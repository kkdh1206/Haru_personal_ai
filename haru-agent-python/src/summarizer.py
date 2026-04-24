"""
통화 종료 후 transcript를 분석해
1) 통화 요약
2) 장기 메모리 후보
를 추출하는 모듈
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from dataclasses import dataclass, field
from re import Pattern
from typing import ClassVar

import google.generativeai as genai

logger = logging.getLogger("summarizer")


@dataclass
class ExtractedMemory:
    content: str
    importance: str = "medium"
    tags: list[str] = field(default_factory=list)


@dataclass
class TranscriptAnalysis:
    call_summary: str = ""
    long_term_memories: list[ExtractedMemory] = field(default_factory=list)


class ConversationSummarizer:
    """통화 transcript 분석 클래스"""

    LOW_SIGNAL_SUMMARY_PATTERNS: ClassVar[list[Pattern[str]]] = [
        re.compile(r"총\s*\d+\s*개"),
        re.compile(r"\d+\s*개의\s*(메시지|대화)"),
        re.compile(r"메시지가\s*오간\s*통화\s*기록"),
        re.compile(r"대화가\s*오갔"),
        re.compile(r"통화\s*기록"),
    ]

    def __init__(self):
        api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        if not api_key:
            logger.warning(
                "⚠️ No Gemini API key configured - transcript analysis disabled"
            )
            self.client = None
            return

        genai.configure(api_key=api_key)
        self.summary_model = os.getenv("GEMINI_SUMMARY_MODEL", "gemini-3-flash-preview")
        self.client = genai.GenerativeModel(self.summary_model)
        logger.info(f"✅ Summarizer initialized with model: {self.summary_model}")

    async def analyze_transcript(self, messages: list[dict]) -> TranscriptAnalysis:
        """
        통화 전체 transcript를 분석해 요약과 장기 메모리 후보를 생성합니다.
        """
        if not messages:
            return TranscriptAnalysis()

        if not self.client:
            return TranscriptAnalysis(
                call_summary=self._build_fallback_summary(messages),
                long_term_memories=[],
            )

        conversation_text = "\n".join(
            [
                f"{'사용자' if msg['role'] == 'user' else '어시스턴트'}: {msg['content']}"
                for msg in messages
                if msg.get("content")
            ]
        )

        prompt = f"""
다음은 사용자와 AI의 통화 transcript다.

해야 할 일:
1. 통화 전체를 1~2문장으로 짧게 요약한다.
2. 앞으로도 기억할 가치가 있는 사용자 관련 정보만 추린다.

요약 규칙:
- 메시지 개수, 대화 횟수, "통화 기록" 같은 메타 표현으로 요약하지 않는다.
- 실제로 어떤 주제와 요청이 오갔는지 내용 중심으로 쓴다.
- 가능하면 사용자의 핵심 요청, 확인한 사실, 정한 계획을 먼저 적는다.
- "사용자와 AI가 대화했다"처럼 당연한 말은 쓰지 않는다.

장기 메모리에 포함할 정보 예시:
- 이름, 생일, 직업, 관계, 선호/비선호
- 자주 언급하는 루틴, 습관, 건강 상태
- 앞으로의 중요한 약속, 목표, 계획
- 반복해서 챙겨야 할 사용자 고유 맥락

장기 메모리에서 제외할 정보:
- 오늘 날씨, 일반 뉴스, 단순한 인사말
- 통화 중 순간 감정, 잠투정, 기계적인 맞장구
- 어시스턴트가 한 말 자체
- 한 번 쓰고 끝나는 잡담

반드시 아래 JSON만 반환한다:
{{
  "call_summary": "짧은 요약",
  "memories": [
    {{
      "content": "사용자는 ...",
      "importance": "high 또는 medium",
      "tags": ["태그1", "태그2"]
    }}
  ]
}}

통화 transcript:
{conversation_text}
"""

        try:
            response = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.client.generate_content(
                    prompt,
                    generation_config=genai.types.GenerationConfig(
                        max_output_tokens=500,
                        temperature=0.2,
                    ),
                ),
            )
            return self._parse_analysis_response(response.text, messages)
        except Exception as e:
            logger.error(
                f"❌ Failed to analyze transcript: {type(e).__name__}: {e!s}"
            )
            return TranscriptAnalysis(
                call_summary=self._build_fallback_summary(messages),
                long_term_memories=[],
            )

    def _extract_json_text(self, raw_text: str) -> str:
        text = raw_text.strip()
        text = re.sub(r"^```json\s*", "", text)
        text = re.sub(r"```$", "", text).strip()
        if text.startswith("{") and text.endswith("}"):
            return text

        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        return match.group(0).strip() if match else text

    def _clean_summary_candidate(self, text: str) -> str:
        cleaned = re.sub(r"\s+", " ", text or "").strip()
        cleaned = cleaned.strip('"').strip("'").strip()
        return cleaned

    def _is_low_signal_summary(self, summary: str) -> bool:
        normalized = self._clean_summary_candidate(summary)
        if not normalized:
            return True

        if len(normalized) < 12:
            return True

        return any(pattern.search(normalized) for pattern in self.LOW_SIGNAL_SUMMARY_PATTERNS)

    def _is_meaningful_user_text(self, text: str) -> bool:
        normalized = re.sub(r"\s+", " ", text).strip()
        if len(normalized) < 5:
            return False

        return normalized not in {
            "응",
            "네",
            "맞아",
            "아니",
            "고마워",
            "잘자",
            "안녕",
        }

    def _shorten_text(self, text: str, limit: int = 42) -> str:
        cleaned = re.sub(r"\s+", " ", text).strip()
        if len(cleaned) <= limit:
            return cleaned
        return cleaned[: limit - 1].rstrip() + "…"

    def _build_fallback_summary(self, messages: list[dict]) -> str:
        user_points: list[str] = []
        assistant_points: list[str] = []

        for msg in messages:
            content = re.sub(r"\s+", " ", str(msg.get("content", ""))).strip()
            if not content:
                continue

            if msg.get("role") == "user" and self._is_meaningful_user_text(content):
                user_points.append(content)
            elif msg.get("role") == "assistant" and len(content) >= 8:
                assistant_points.append(content)

        deduped_user_points = list(dict.fromkeys(user_points))
        if len(deduped_user_points) >= 2:
            return (
                f"사용자는 {self._shorten_text(deduped_user_points[0])}에 대해 이야기했고, "
                f"이후 {self._shorten_text(deduped_user_points[-1])}를 중심으로 대화를 이어갔다."
            )

        if deduped_user_points:
            return (
                f"이번 통화에서는 사용자가 "
                f"{self._shorten_text(deduped_user_points[0])}에 대해 주로 이야기했다."
            )

        if assistant_points:
            return (
                f"이번 통화에서는 기상 안내와 함께 "
                f"{self._shorten_text(assistant_points[0])}를 중심으로 짧게 대화했다."
            )

        return "이번 통화에서는 기상 상태와 당일 계획을 짧게 확인했다."

    def _parse_analysis_response(
        self, raw_text: str, messages: list[dict]
    ) -> TranscriptAnalysis:
        text = self._extract_json_text(raw_text)

        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            logger.warning("⚠️ Transcript analysis did not return valid JSON")
            return TranscriptAnalysis(
                call_summary=self._build_fallback_summary(messages),
                long_term_memories=[],
            )

        summary = self._clean_summary_candidate(str(payload.get("call_summary", "")))
        memories: list[ExtractedMemory] = []
        seen = set()

        for item in payload.get("memories", []):
            content = str(item.get("content", "")).strip()
            if not content:
                continue

            normalized = re.sub(r"\s+", " ", content).strip().lower()
            if normalized in seen:
                continue
            seen.add(normalized)

            importance = str(item.get("importance", "medium")).strip().lower()
            if importance not in {"high", "medium"}:
                importance = "medium"

            tags = [
                str(tag).strip()
                for tag in item.get("tags", [])
                if str(tag).strip()
            ][:5]

            memories.append(
                ExtractedMemory(
                    content=content,
                    importance=importance,
                    tags=tags,
                )
            )

        return TranscriptAnalysis(
            call_summary=summary
            if not self._is_low_signal_summary(summary)
            else self._build_fallback_summary(messages),
            long_term_memories=memories[:8],
        )


_summarizer_instance = None


def get_summarizer() -> ConversationSummarizer:
    global _summarizer_instance
    if _summarizer_instance is None:
        _summarizer_instance = ConversationSummarizer()
    return _summarizer_instance
