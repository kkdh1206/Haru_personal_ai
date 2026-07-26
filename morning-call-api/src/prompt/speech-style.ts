export const SPEECH_STYLE_CODES = [
  'ko-gyeongsang',
  'ja-osaka',
  'en-california',
] as const;

export type SpeechStyleCode = (typeof SPEECH_STYLE_CODES)[number];
export type SpeechLanguageCode = 'ko' | 'ja' | 'en';

export type SpeechStyleDefinition = {
  code: SpeechStyleCode;
  language: SpeechLanguageCode;
  label: string;
  prompt: string;
  testPrompt: string;
};

export const SPEECH_STYLES: Record<SpeechStyleCode, SpeechStyleDefinition> = {
  'ko-gyeongsang': {
    code: 'ko-gyeongsang',
    language: 'ko',
    label: '경상도 사투리',
    prompt: `
- 경상도 사투리는 짧은 깨움이나 재촉에만 한 표현 정도 가볍게 섞는다.
- "인났나?", "퍼뜩 일어나자", "또박또박 말해봐라"처럼 실제 대화에서 자연스러운 짧은 표현만 쓴다.
- 딱딱한 문어체나 과장된 사투리 표현은 쓰지 않는다.
- 한 발화에 사투리 표현은 최대 하나만 쓰고, 확인 질문과 브리핑, 날씨, 일정, 작별 인사는 자연스러운 표준 구어체로 말한다.
`.trim(),
    testPrompt:
      '경상도 사투리는 짧은 표현 하나만 가볍게 쓰고 나머지는 자연스러운 표준 구어체로 말한다.',
  },
  'ja-osaka': {
    code: 'ja-osaka',
    language: 'ja',
    label: '大阪弁',
    prompt: `
- 親しみやすい自然な大阪弁を、短い起こし文句やリアクションに一つだけ軽く使う。
- 「起きたん？」「そろそろ起きよか」「今日もぼちぼちいこか」のような、日常会話で自然な表現を使う。
- 毎文を大阪弁にせず、聞き返し、天気、予定、ブリーフィング、別れの言葉は聞き取りやすい自然な日本語で話す。
- 誇張した関西弁、乱暴な表現、わざとらしいキャラクター演技はしない。
`.trim(),
    testPrompt: '親しみやすい自然な大阪弁を一つだけ軽く使い、短く話す。',
  },
  'en-california': {
    code: 'en-california',
    language: 'en',
    label: 'California English',
    prompt: `
- Use relaxed, upbeat California-style English with a friendly West Coast rhythm.
- Use at most one casual phrase such as "Hey, rise and shine," "Come on, you've got this," or "Let's get moving" in a short wake-up line or reaction.
- Keep slang light and natural. Do not turn every sentence into slang or a surfer caricature.
- Use clear, natural English for clarification questions, weather, schedules, briefings, and farewells.
`.trim(),
    testPrompt:
      'Use relaxed, upbeat California-style English with light, natural slang.',
  },
};

const DEFAULT_SPEECH_STYLE: Record<SpeechLanguageCode, SpeechStyleCode> = {
  ko: 'ko-gyeongsang',
  ja: 'ja-osaka',
  en: 'en-california',
};

export function resolveSpeechLanguage(language?: string): SpeechLanguageCode {
  const normalized = language?.trim().toLowerCase() || '';
  if (
    normalized.includes('japanese') ||
    normalized.includes('일본') ||
    normalized.includes('日本') ||
    normalized.startsWith('ja')
  ) {
    return 'ja';
  }
  if (
    normalized.includes('english') ||
    normalized.includes('영어') ||
    normalized.startsWith('en')
  ) {
    return 'en';
  }
  return 'ko';
}

export function resolveSpeechStyle(
  language?: string,
  requestedStyle?: string | null,
): SpeechStyleDefinition {
  const speechLanguage = resolveSpeechLanguage(language);
  const requested = requestedStyle
    ? SPEECH_STYLES[requestedStyle as SpeechStyleCode]
    : undefined;

  if (requested?.language === speechLanguage) {
    return requested;
  }

  return SPEECH_STYLES[DEFAULT_SPEECH_STYLE[speechLanguage]];
}
