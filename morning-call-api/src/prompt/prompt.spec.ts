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

    expect(prompt).toContain('한 번에 1~2문장만 말한다');
    expect(prompt).toContain('일어났어"라고 또박또박');
    expect(prompt).toContain('사용자가 "일어났어"라고 또렷하게 말하면 깬 것으로 본다');
    expect(prompt).toContain('방금 뭐라고 했어? 또박또박 크게 말해줘.');
    expect(prompt).toContain('3+4, 5+6, 7x8, 12-5');
    expect(prompt).toContain('짧게 브리핑해줄까?');
    expect(prompt).toContain('특정 정체성 비하, 혐오, 위협은 하지 않는다');
    expect(prompt).toContain('날씨는 제공된 정보만 말하고 지어내지 않는다');
    expect(prompt).toContain('압박 카드');
    expect(prompt).toContain('명령형');
    expect(prompt).toContain('지친 친구형');
    expect(prompt).toContain('카운트다운형');
    expect(prompt).toContain('무응답이면 반복 호출과 카운트다운을 우선');
    expect(prompt).toContain('현실 압박형');
    expect(prompt).not.toContain('딱 한 번만 더 전화할게');
    expect(prompt).not.toContain('예:');
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

    expect(prompt).toContain('재통화 여유가 거의 없다');
    expect(prompt).toContain('거의 마지막이라는 긴장감');
    expect(prompt).toContain('포기톤은 마지막 압박 연출');
    expect(prompt).toContain('직전 통화에서 바로 끊었다');
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

    expect(prompt).toContain('이번에는 꼭 일어나야 한다고 말한다');
    expect(prompt).toContain('직전 통화에서 반응이 없었다');
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

    expect(prompt).toContain('부드럽고 짧게 깨운다');
    expect(prompt).toContain('직전 통화에서 반응이 없었다');
    expect(prompt).not.toContain('니가 깨워달라며');
    expect(prompt).not.toContain('니가 시켜서 하는 거잖아');
    expect(prompt).not.toContain('딱 한 번만 더 건다');
  });

  it('uses schedule context early and exposes multiple schedule items', () => {
    const prompt = buildMorningCallPrompt({
      name: '민수',
      assistantName: '하루',
      language: '한국어',
      timeZone: 'Asia/Seoul',
      wakeIntensity: 'gentle',
      callType: 'initial',
      retryCount: 0,
      retryCallsRemaining: 1,
      todayLabel: '2026년 06월 28일 일요일',
      currentTimeLabel: '2026년 06월 28일 일요일 08:10',
      currentIsoTime: '2026-06-28T08:10:00+09:00',
      weather: '서울, KR 기준, 관측 08:00, 흐림, 최근 1시간 비 1mm',
      schedule: [
        {
          id: '1',
          summary: '팀 미팅',
          start: '06월 28일 09:00',
          end: '06월 28일 10:00',
        },
        {
          id: '2',
          summary: '외출 약속',
          start: '06월 28일 14:00',
          end: '06월 28일 15:00',
          location: '강남',
        },
      ],
      customMessage: '',
    });

    expect(prompt).toContain('일정이 있으면 가장 이른 일정 하나만');
    expect(prompt).toContain('날씨/일정은 지금 일어나야 하는 이유 하나와 연결');
    expect(prompt).toContain('06월 28일 09:00 팀 미팅');
    expect(prompt).toContain('06월 28일 14:00 외출 약속 @ 강남');
  });
});
