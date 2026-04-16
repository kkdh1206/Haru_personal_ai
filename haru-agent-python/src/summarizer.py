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
from typing import List

import google.generativeai as genai

logger = logging.getLogger("summarizer")


@dataclass
class ExtractedMemory:
    content: str
    importance: str = "medium"
    tags: List[str] = field(default_factory=list)


@dataclass
class TranscriptAnalysis:
    call_summary: str = ""
    long_term_memories: List[ExtractedMemory] = field(default_factory=list)


class ConversationSummarizer:
    """통화 transcript 분석 클래스"""

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

    async def analyze_transcript(self, messages: List[dict]) -> TranscriptAnalysis:
        """
        통화 전체 transcript를 분석해 요약과 장기 메모리 후보를 생성합니다.
        """
        if not messages:
            return TranscriptAnalysis()

        if not self.client:
            return TranscriptAnalysis(
                call_summary=f"총 {len(messages)}개의 메시지가 오간 통화 기록",
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
            return self._parse_analysis_response(response.text, len(messages))
        except Exception as e:
            logger.error(
                f"❌ Failed to analyze transcript: {type(e).__name__}: {str(e)}"
            )
            return TranscriptAnalysis(
                call_summary=f"총 {len(messages)}개의 메시지가 오간 통화 기록",
                long_term_memories=[],
            )

    def _parse_analysis_response(
        self, raw_text: str, message_count: int
    ) -> TranscriptAnalysis:
        text = raw_text.strip()
        text = re.sub(r"^```json\s*", "", text)
        text = re.sub(r"```$", "", text).strip()

        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            logger.warning("⚠️ Transcript analysis did not return valid JSON")
            return TranscriptAnalysis(
                call_summary=f"총 {message_count}개의 메시지가 오간 통화 기록",
                long_term_memories=[],
            )

        summary = str(payload.get("call_summary", "")).strip()
        memories: List[ExtractedMemory] = []
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
            call_summary=summary or f"총 {message_count}개의 메시지가 오간 통화 기록",
            long_term_memories=memories[:8],
        )


_summarizer_instance = None


def get_summarizer() -> ConversationSummarizer:
    global _summarizer_instance
    if _summarizer_instance is None:
        _summarizer_instance = ConversationSummarizer()
    return _summarizer_instance
