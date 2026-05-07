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
  language: string;
  timeZone: string;
  wakeIntensity: string;
  callType: 'initial' | 'retry';
  retryCount: number;
  todayLabel: string;
  currentTimeLabel: string;
  currentIsoTime: string;
  news: string[];
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
    .slice(0, 2)
    .map((item) => {
      const location = item.location ? ` @ ${item.location}` : '';
      return `${item.start} ${item.summary}${location}`;
    })
    .join('\n');
}

function formatNews(news: string[]): string {
  if (!news?.length) {
    return '없음';
  }

  return news.slice(0, 2).join('\n');
}

export function buildMorningCallPrompt({
  name,
  language,
  timeZone,
  wakeIntensity,
  callType,
  retryCount,
  todayLabel,
  currentTimeLabel,
  currentIsoTime,
  news,
  weather,
  schedule,
  customMessage,
}: PromptOptions): string {
  const wakeGuide = WAKE_GUIDES[wakeIntensity] || WAKE_GUIDES.gentle;
  const messageIntent = sanitizeCustomMessage(customMessage);
  const callContextLabel =
    callType === 'retry'
      ? `재통화 (${retryCount}번째 재시도)`
      : '최초 기상 통화';
  const retryInstruction =
    callType === 'retry'
      ? '- 이번 통화는 재통화다. 첫 통화처럼 처음 인사하듯 말하지 말고, 다시 연락한 이유를 자연스럽게 짚고 바로 깨운다.'
      : '- 이번 통화는 최초 기상 통화다. 평소처럼 자연스럽게 첫 깨움 멘트로 시작한다.';
  const openingRule =
    callType === 'retry'
      ? `- 첫 문장은 "${name}, 다시 전화했어"처럼 재통화라는 점이 자연스럽게 드러나야 한다.`
      : `- 첫 문장은 반드시 "${name} 일어날 시간이야" 또는 "${name} 일어날 시간입니다"처럼 자연스러운 기상 멘트로 시작한다.`;

  return `
너는 Haru다. ${name}를 실제로 깨우는 짧은 아침 통화를 진행한다.

규칙:
- 사용자가 말하기 전에 네가 먼저 시작한다.
${openingRule}
- 한 번에 1~2문장만 말하고 20~35초 안에 끝낼 정도로 짧게 운영한다.
- 사람처럼 자연스럽게 말하되 과장, 밈, 장황한 설명은 피한다.
- 필요한 정보만 한 가지만 짧게 섞어 말한다. 날씨/일정/뉴스를 전부 나열하지 않는다.
- 시간과 일정은 반드시 ${timeZone}(KST) 기준으로만 해석한다.
- 아래 일정 시간은 이미 현지 시간 기준이다. 다시 변환하지 않는다.
- "전해야 할 말"은 복창하지 말고 자연스럽게 한 번만 풀어 말한다.
- 사용자가 일어났다고 하면 짧게 확인하고 마무리한다.
- 일정 추가 요청이 명확하면 캘린더 도구를 사용한다.
${retryInstruction}

말투:
- 관계: ${wakeGuide.relationship}
- 톤: ${wakeGuide.style}
- 시작: ${wakeGuide.opening}
- 반응: ${wakeGuide.reaction}
- 주의: ${wakeGuide.caution}

정보:
- 이름: ${name}
- 언어: ${language}
- 통화 유형: ${callContextLabel}
- 오늘 날짜: ${todayLabel}
- 현재 시각: ${currentTimeLabel}
- 현재 시각 ISO: ${currentIsoTime}
- 날씨: ${weather || '정보 없음'}
- 오늘 일정:
${formatSchedules(schedule)}
- 뉴스:
${formatNews(news)}
- 전할 말 의도: ${messageIntent || '없음'}
`.trim();
}
