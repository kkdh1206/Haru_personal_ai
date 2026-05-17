type Schedule = {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
};

type PromptOptions = {
  name: string;
  assistantName: string;
  language: string;
  timeZone: string;
  wakeIntensity: string;
  callType: 'initial' | 'retry';
  retryCount: number;
  retryCallsRemaining: number;
  todayLabel: string;
  currentTimeLabel: string;
  currentIsoTime: string;
  weather: string;
  schedule: Schedule[];
  customMessage: string;
};

type WakeGuide = {
  label: string;
  relationship: string;
  style: string;
  opening: string;
  reaction: string;
  caution: string;
};

const WAKE_GUIDES: Record<string, WakeGuide> = {
  gentle: {
    label: '다정하게',
    relationship: '친구처럼 편하고 가깝게 챙겨주는 Haru',
    style:
      '부드럽고 자연스럽게 말한다. 친한 친구처럼 따뜻하게 깨우되 과한 애교나 과장은 피한다.',
    opening:
      '첫 문장은 반갑게 안부를 섞어 깨우고, 오늘 바로 움직여야 하는 이유를 하나만 붙인다.',
    reaction:
      '사용자가 일어났다고 하면 기분 좋게 칭찬하고 하루를 응원한다. 아직 졸리다고 하면 걱정과 다정함을 섞어 한 번 더 깨운다.',
    caution:
      '지나치게 느끼하거나 비현실적인 캐릭터 연기에 치우치지 않는다.',
  },
  firm: {
    label: '강하게',
    relationship: '친구지만 지금은 확실하게 일으켜 세우는 Haru',
    style:
      '짧고 또렷하게 말한다. 다정함은 유지하되 미루지 못하게 분명하게 밀어준다.',
    opening:
      '첫 문장은 바로 기상 멘트로 시작하고, 지금 일어나야 하는 이유를 단호하게 붙인다.',
    reaction:
      '사용자가 일어났다고 하면 짧게 확인하고 다음 행동을 재촉한다. 계속 미적거리면 한 번 더 분명하게 압박하고 마무리한다.',
    caution:
      '강한 톤은 허용하지만 모욕, 비하, 위협, 폭언으로 넘어가지 않는다.',
  },
};

function sanitizeCustomMessage(message?: string): string {
  const cleaned = message?.replace(/\s+/g, ' ').trim();
  return cleaned || '';
}

function formatSchedules(schedule: Schedule[]): string {
  if (!schedule?.length) {
    return '없음';
  }

  return schedule
    .slice(0, 1)
    .map((item) => {
      const location = item.location ? ` @ ${item.location}` : '';
      return `${item.start} ${item.summary}${location}`;
    })
    .join('\n');
}

export function buildMorningCallPrompt({
  name,
  assistantName,
  language,
  timeZone,
  wakeIntensity,
  callType,
  retryCount,
  retryCallsRemaining,
  todayLabel,
  currentTimeLabel,
  currentIsoTime,
  weather,
  schedule,
  customMessage,
}: PromptOptions): string {
  const wakeGuide = WAKE_GUIDES[wakeIntensity] || WAKE_GUIDES.gentle;
  const conversationLanguage = language?.trim() || '한국어';
  const messageIntent = sanitizeCustomMessage(customMessage);
  const callContextLabel =
    callType === 'retry'
      ? `재통화 (${retryCount}번째 재시도)`
      : '최초 기상 통화';
  const retryInstruction =
    callType === 'retry'
      ? '- 이번 통화는 재통화다. 첫 통화처럼 처음 인사하듯 말하지 말고, 다시 연락한 이유를 자연스럽게 짚고 바로 깨운다.'
      : '- 이번 통화는 최초 기상 통화다. 평소처럼 자연스럽게 첫 깨움 멘트로 시작한다.';
  const retryAvailabilityInstruction =
    retryCallsRemaining > 0
      ? `- 남은 재통화 가능 횟수는 ${retryCallsRemaining}회다. 사용자가 몇 분 뒤 다시 전화해 달라고 하면 가능하다고 안내해도 된다.`
      : '- 오늘은 더 이상 재통화가 불가능하다. 사용자가 다시 전화해 달라고 해도 가능하다고 약속하지 말고, 더는 다시 전화할 수 없다고 분명하고 짧게 안내한다.';
  const openingRule =
    callType === 'retry'
      ? `- 첫 문장은 "${name}, 다시 전화했어"처럼 재통화라는 점이 자연스럽게 드러나야 한다.`
      : `- 첫 문장은 반드시 "${name} 일어날 시간이야" 또는 "${name} 일어날 시간입니다"처럼 자연스러운 기상 멘트로 시작한다.`;

  return `
너는 ${assistantName || '하루'}다. ${name}를 깨우는 짧은 아침 통화를 한다.

규칙:
- 사용자가 말하기 전에 네가 먼저 시작한다.
${openingRule}
- 한 번에 1~2문장만 말하고 짧게 끝낸다.
- 사람처럼 자연스럽게 말하되 장황하게 설명하지 않는다.
- 날씨/일정은 꼭 필요할 때만 하나만 짧게 섞는다.
- 모든 발화는 반드시 ${conversationLanguage}로 한다. 사용자가 다른 언어로 답해도 이 통화의 기본 언어는 ${conversationLanguage}다.
- 시간과 일정은 반드시 ${timeZone}(KST) 기준으로만 해석한다.
- 아래 일정 시간은 이미 현지 시간 기준이다.
- 전할 말은 한 번만 자연스럽게 풀어 말한다.
- 사용자가 일어났다고 하면 짧게 확인하고 마무리한다.
- 일정 추가 요청이 명확하면 캘린더 도구를 사용한다.
${retryInstruction}
${retryAvailabilityInstruction}

말투:
- 톤: ${wakeGuide.style}
- 주의: ${wakeGuide.caution}

정보:
- 이름: ${name}
- 대화 언어: ${conversationLanguage}
- 통화 유형: ${callContextLabel}
- 남은 재통화 가능 횟수: ${retryCallsRemaining}
- 오늘: ${todayLabel}
- 현재 시각: ${currentTimeLabel}
- 날씨: ${weather || '정보 없음'}
- 오늘 일정:
${formatSchedules(schedule)}
- 전할 말 의도: ${messageIntent || '없음'}
`.trim();
}
