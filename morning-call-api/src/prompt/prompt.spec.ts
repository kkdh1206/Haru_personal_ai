import { buildMorningCallPrompt } from './prompt';

describe('buildMorningCallPrompt', () => {
  it('adds firm wake instructions for repeated calls and action confirmation', () => {
    const prompt = buildMorningCallPrompt({
      name: '민수',
      assistantName: '하루',
      language: '한국어',
      timeZone: 'Asia/Seoul',
      wakeIntensity: 'firm',
      callType: 'initial',
      retryCount: 0,
      retryCallsRemaining: 3,
      todayLabel: '2026년 06월 28일 일요일',
      currentTimeLabel: '2026년 06월 28일 일요일 09:00',
      currentIsoTime: '2026-06-28T09:00:00+09:00',
      weather: '맑음, 현재 20도',
      schedule: [],
      customMessage: '',
    });

    expect(prompt).toContain('일어나, 일어나, 일어나');
    expect(prompt).toContain('물 한 모금 마셨어');
    expect(prompt).toContain('"일어났어"처럼 짧고 흐린 대답');
    expect(prompt).toContain('특정 정체성 비하, 혐오, 위협은 하지 않는다');
    expect(prompt).toContain('제공된 위치와 관측 시각을 기준으로 정확히 말한다');
    expect(prompt).toContain('오늘도 마지막까지 힘내자');
    expect(prompt).toContain('야, 일어나!');
    expect(prompt).toContain('압박 카드');
    expect(prompt).toContain('명령형');
    expect(prompt).toContain('지친 친구형');
    expect(prompt).toContain('애원형');
    expect(prompt).toContain('제발 일어나주세요');
    expect(prompt).toContain('카운트다운형');
    expect(prompt).toContain('사용자가 대답하지 않는 상황에서는 반복 호출과 카운트다운을 우선');
    expect(prompt).toContain('다시 센다. 셋, 둘, 하나. 발 내려');
    expect(prompt).toContain('행동 미션형');
    expect(prompt).toContain('현실 압박형');
    expect(prompt).toContain('나도 계속 붙잡고 있을 수는 없어');
    expect(prompt).not.toContain('딱 한 번만 더 전화할게');
    expect(prompt).not.toContain('포기하는 말투는 실제 포기가 아니라 마지막 압박 연출');
    expect(prompt).not.toContain('남은 재통화 가능 횟수는 3회');
    expect(prompt).not.toContain('남은 재통화 가능 횟수: 3');
  });

  it('uses character pressure instead of retry count when retries are almost exhausted', () => {
    const prompt = buildMorningCallPrompt({
      name: '민수',
      assistantName: '하루',
      language: '한국어',
      timeZone: 'Asia/Seoul',
      wakeIntensity: 'firm',
      callType: 'retry',
      retryCount: 2,
      retryCallsRemaining: 1,
      lastWakeStatus: 'rejected',
      todayLabel: '2026년 06월 28일 일요일',
      currentTimeLabel: '2026년 06월 28일 일요일 09:02',
      currentIsoTime: '2026-06-28T09:02:00+09:00',
      weather: '서울, KR 기준, 관측 09:00, 맑음, 현재 20도',
      schedule: [],
      customMessage: '',
    });

    expect(prompt).toContain('하... 나도 이제 한계야');
    expect(prompt).toContain('진짜 마지막으로 한 번만 더 깨운다');
    expect(prompt).toContain('이번에도 안 일어나면 나도 더 못 도와줘');
    expect(prompt).toContain('딱 한 번만 더 전화할게');
    expect(prompt).toContain('포기하는 말투는 실제 포기가 아니라 마지막 압박 연출');
    expect(prompt).toContain('나 또 전화했어');
    expect(prompt).toContain('아까 전화 왜 끊었어?');
    expect(prompt).not.toContain('남은 재통화 가능 횟수는 1회');
    expect(prompt).not.toContain('재통화 (2번째 재시도)');
  });

  it('does not use disappointed give-up pressure in gentle retry prompts', () => {
    const prompt = buildMorningCallPrompt({
      name: '민수',
      assistantName: '하루',
      language: '한국어',
      timeZone: 'Asia/Seoul',
      wakeIntensity: 'gentle',
      callType: 'retry',
      retryCount: 2,
      retryCallsRemaining: 1,
      lastWakeStatus: 'no_response',
      todayLabel: '2026년 06월 28일 일요일',
      currentTimeLabel: '2026년 06월 28일 일요일 09:02',
      currentIsoTime: '2026-06-28T09:02:00+09:00',
      weather: '서울, KR 기준, 관측 09:00, 맑음, 현재 20도',
      schedule: [],
      customMessage: '',
    });

    expect(prompt).toContain('부드럽게 마지막 안내');
    expect(prompt).toContain('아까 전화 안 받았잖아');
    expect(prompt).not.toContain('하... 나도 이제 한계야');
    expect(prompt).not.toContain('딱 한 번만 더 전화할게');
    expect(prompt).not.toContain('야, 일어나!');
  });

  it('falls back tsundere input to the gentle assistant-style prompt', () => {
    const prompt = buildMorningCallPrompt({
      name: '민수',
      assistantName: '하루',
      language: '한국어',
      timeZone: 'Asia/Seoul',
      wakeIntensity: 'tsundere',
      callType: 'retry',
      retryCount: 1,
      retryCallsRemaining: 2,
      lastWakeStatus: 'no_response',
      todayLabel: '2026년 06월 28일 일요일',
      currentTimeLabel: '2026년 06월 28일 일요일 09:02',
      currentIsoTime: '2026-06-28T09:02:00+09:00',
      weather: '서울, KR 기준, 관측 09:00, 맑음, 현재 20도',
      schedule: [],
      customMessage: '',
    });

    expect(prompt).toContain('아침 비서처럼');
    expect(prompt).toContain('아까 전화 안 받았잖아');
    expect(prompt).not.toContain('니가 깨워달라며');
    expect(prompt).not.toContain('니가 시켜서 하는 거잖아');
    expect(prompt).not.toContain('딱 한 번만 더 건다');
  });
});
