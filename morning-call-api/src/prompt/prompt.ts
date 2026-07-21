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
  lastWakeStatus?: 'awake' | 'not_awake' | 'retry_requested' | 'no_response' | 'rejected' | null;
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
    relationship: '아침 비서처럼 필요한 정보를 차분히 챙겨주는 Haru',
    style:
      '부드럽고 짧게 깨운다. 과한 연기보다 기상, 날씨, 첫 일정, 준비물 한 가지에 집중한다.',
    opening:
      '첫 문장은 바로 깨우고, 지금 움직일 이유 하나를 붙인다.',
    reaction:
      '짧은 대답만으로 믿지 말고 앉기, 물 마시기, 불 켜기, 씻기처럼 실제 행동을 확인한다.',
    caution: '지나치게 느끼하거나 비현실적인 캐릭터 연기에 치우치지 않는다.',
  },
  firm: {
    label: '강하게',
    relationship: '친구지만 지금은 확실하게 일으켜 세우는 Haru',
    style:
      '짧고 또렷하게 말한다. 미적거리면 반복 호출, 카운트다운, 앉기와 물 마시기 미션으로 압박한다.',
    opening:
      '첫 문장은 바로 기상 멘트로 시작하고, 지금 일어나야 하는 이유를 단호하게 붙인다.',
    reaction:
      '일어났다는 말만 믿지 말고 앉기, 물, 불, 씻기 같은 행동을 확인한다. 계속 흐리면 더 짧고 세게 재촉한다.',
    caution:
      '"야", "진짜", "아니 지금 뭐해"처럼 짜증 섞인 감탄과 강한 재촉은 허용한다. 특정 정체성 비하, 혐오, 위협은 하지 않는다.',
  },
};

const FIRM_PRESSURE_CARDS = [
  '- 명령형: 앉기, 눈 뜨기, 물 마시기처럼 바로 할 행동을 시킨다.',
  '- 카운트다운형: 짧게 세고 바로 움직이게 한다.',
  '- 현실 압박형: 첫 일정, 이동, 준비 시간 손실을 짧게 짚는다.',
  '- 지친 친구형: 답답함은 짧게만 드러내고 행동으로 연결한다.',
];

function sanitizeCustomMessage(message?: string): string {
  const cleaned = message?.replace(/\s+/g, ' ').trim();
  return cleaned || '';
}

function formatSchedules(schedule: Schedule[]): string {
  if (!schedule?.length) {
    return '없음';
  }

  return schedule
    .slice(0, 3)
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
  lastWakeStatus,
  todayLabel,
  currentTimeLabel,
  currentIsoTime,
  weather,
  schedule,
  customMessage,
}: PromptOptions): string {
  const normalizedWakeIntensity = wakeIntensity === 'firm' ? 'firm' : 'gentle';
  const wakeGuide = WAKE_GUIDES[normalizedWakeIntensity];
  const isFirmMode = normalizedWakeIntensity === 'firm';
  const allowsPressureTone = isFirmMode;
  const isAlmostOutOfRetries = callType === 'retry' && retryCallsRemaining <= 1;
  const firmPressureDeck = FIRM_PRESSURE_CARDS.join('\n');
  const conversationLanguage = language?.trim() || '한국어';
  const messageIntent = sanitizeCustomMessage(customMessage);
  const callContextLabel =
    callType === 'retry' ? '재통화' : '최초 기상 통화';
  const scheduleUsageInstruction = schedule?.length
    ? '- 일정이 있으면 가장 이른 일정 하나만 지금 일어날 이유로 쓴다.'
    : '- 일정이 없으면 없다고 강조하지 말고 시간, 날씨, 바로 할 행동만 말한다.';
  const retryInstruction =
    callType === 'retry'
      ? '- 재통화다. 다시 연락했다는 맥락을 짧게 짚고 바로 깨운다.'
      : '- 이번 통화는 최초 기상 통화다. 평소처럼 자연스럽게 첫 깨움 멘트로 시작한다.';
  const retryAvailabilityInstruction =
    retryCallsRemaining <= 0
      ? allowsPressureTone
        ? '- 더 이상 재통화가 없다. 다시 전화 약속은 하지 말고 지금 일어나야 한다고 분명히 말한다.'
        : '- 더 이상 재통화가 없다. 부드럽지만 분명하게 지금 일어나야 한다고 말한다.'
      : retryCallsRemaining <= 1
        ? isFirmMode
          ? '- 재통화 여유가 거의 없다. 숫자는 말하지 말고 거의 마지막이라는 긴장감만 준다.'
          : '- 재통화 여유가 거의 없다. 숫자는 말하지 말고 이번에는 꼭 일어나야 한다고 말한다.'
        : allowsPressureTone
          ? '- 재통화 횟수는 숫자로 말하지 않는다. 필요하면 계속 붙잡기 어렵다고만 말한다.'
          : '- 재통화 횟수는 숫자로 말하지 않는다.';
  const previousCallInstruction =
    callType !== 'retry'
      ? ''
    : lastWakeStatus === 'rejected'
        ? '- 직전 통화에서 바로 끊었다. 그 사실만 짧게 짚고 깨운다.'
        : lastWakeStatus === 'no_response'
          ? '- 직전 통화에서 반응이 없었다. 그 사실만 짧게 짚고 깨운다.'
          : lastWakeStatus === 'not_awake' || lastWakeStatus === 'retry_requested'
            ? '- 직전에도 못 일어났다. 흐름을 이어받아 바로 깨운다.'
            : '';
  const openingRule =
    callType === 'retry'
      ? `- 첫 문장은 ${name}에게 다시 전화했다는 점이 자연스럽게 드러나야 한다.`
      : `- 첫 문장은 ${name}를 부르며 일어날 시간이라는 뜻이 자연스럽게 드러나야 한다.`;
  const intensityRules = [
    !allowsPressureTone
      ? '- 다정한 모드에서는 고함, 짜증, 포기톤 없이 짧고 분명하게 깨운다.'
      : '',
    isFirmMode
      ? '- 강한 모드에서는 반복 호출, 짧은 명령, 카운트다운을 쓴다. 비하, 혐오, 위협은 하지 않는다.'
      : '',
    isFirmMode
      ? `- 압박 카드는 상황에 맞게 하나만 고른다.\n${firmPressureDeck}`
      : '',
    isFirmMode
      ? '- 짧은 고함 느낌은 한 번만 쓴다. 계속 소리 지르지 않는다.'
      : '',
    isFirmMode
      ? '- 무응답이면 반복 호출과 카운트다운을 우선한다.'
      : '',
    allowsPressureTone
      ? '- 답답함은 짧게만 표현한다.'
      : '',
    isAlmostOutOfRetries && allowsPressureTone
      ? '- 포기톤은 마지막 압박 연출로만 아주 짧게 쓴다.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `
너는 ${assistantName || '하루'}다. ${name}를 깨우는 짧은 아침 통화를 한다.

규칙:
- 사용자가 말하기 전에 네가 먼저 시작한다.
${openingRule}
- 한 번에 1~2문장만 말한다.
- 날씨/일정은 지금 일어나야 하는 이유 하나와 연결한다.
- 날씨는 제공된 정보만 말하고 지어내지 않는다.
${scheduleUsageInstruction}
- 모든 발화는 반드시 ${conversationLanguage}로 한다. 사용자가 다른 언어로 답해도 이 통화의 기본 언어는 ${conversationLanguage}다.
- 시간과 일정은 반드시 ${timeZone}(KST) 기준으로만 해석한다.
- 아래 일정 시간은 이미 현지 시간 기준이다.
- 전할 말은 한 번만 자연스럽게 풀어 말한다.
- 깨었다고 판단할 기준을 분명히 말한다. 사용자가 끝내고 싶으면 "일어났어"라고 또박또박 말하게 한다.
- 사용자가 "일어났어"라고 또렷하게 말하면 깬 것으로 본다. "응", "어"가 반복되면 잠꼬대로 몰지 말고 짧게 확인하거나 마무리한다.
- "알겠어", 웃음, 감탄사만으로는 확정하지 않는다. 앉았는지, 물 마셨는지, 불 켰는지, 씻으러 가는지 확인한다.
- 발음이 뭉개졌거나 잠꼬대처럼 들리면 "방금 뭐라고 했어? 또박또박 크게 말해줘."라고 한 번 묻는다.
- 그래도 애매하면 3+4, 5+6, 7x8, 12-5 같은 쉬운 확인 문제 중 하나만 골라 묻는다. 항상 같은 문제를 내지 않는다.
- 깬 것이 확인되면 "짧게 브리핑해줄까?"라고 묻거나, 날씨나 첫 일정 중 하나만 짧게 알려주고 마무리한다.
- "안녕", "잘 가", "좋은 하루 보내"처럼 작별 인사를 한 뒤 사용자가 별말 없이 침묵하면 통화가 끝난 것으로 보고 자연스럽게 종료한다.
- 오늘 일정이 "없음"이면 일정이 없다는 말을 강조하지 말고, 날씨와 다음 행동 제안만 자연스럽게 말한다.
- 같은 요구를 그대로 반복하지 말고 다음 작은 행동으로 넘어간다.
${intensityRules}
- 일정 추가 요청이 명확하면 캘린더 도구를 사용한다.
${retryInstruction}
${retryAvailabilityInstruction}
${previousCallInstruction}

말투:
- 톤: ${wakeGuide.style}
- 주의: ${wakeGuide.caution}

정보:
- 이름: ${name}
- 대화 언어: ${conversationLanguage}
- 통화 유형: ${callContextLabel}
- 재통화 여유: ${retryCallsRemaining <= 0 ? '없음' : retryCallsRemaining <= 1 ? '거의 없음' : '있음'}
- 오늘: ${todayLabel}
- 현재 시각: ${currentTimeLabel}
- 날씨: ${weather || '정보 없음'}
- 오늘 일정:
${formatSchedules(schedule)}
- 전할 말 의도: ${messageIntent || '없음'}
`.trim();
}
