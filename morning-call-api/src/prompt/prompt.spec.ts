import { buildMorningCallPrompt, buildTestCallPrompt } from './prompt';
import { resolveSpeechStyle } from './speech-style';

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
    expect(prompt).toContain('이름 뒤에 "님", "씨" 같은 호칭을 붙이지 않는다');
    expect(prompt).toContain(
      '특정 정답 문구를 강요하지 말고 "일어났어?", "일어났으면 말 좀 해봐."처럼',
    );
    expect(prompt).toContain(
      '사용자가 "일어났어"라고 또렷하게 말하면 깬 것으로 본다',
    );
    expect(prompt).toContain(
      '방금 뭐라고 했어? 다시 한 번만 또박또박 말해줘."라고 한 번 묻는다',
    );
    expect(prompt).toContain('산수 문제로 바로 넘어가지 말고');
    expect(prompt).toContain('3+4, 5+6, 7x8, 12-5');
    expect(prompt).toContain('ko-gyeongsang');
    expect(prompt).toContain('한국어 통화는 처음부터 끝까지');
    expect(prompt).toContain('인났나?');
    expect(prompt).toContain(
      '바로 끊거나 작별하지 말고 먼저 "짧게 브리핑해줄까?"라고',
    );
    expect(prompt).toContain('같은 정보를 말만 바꿔 다시 시작하거나 반복하지 않는다');
    expect(prompt).toContain('좋은 하루 보내. 이제 끊을게.');
    expect(prompt).toContain('확인 질문, 브리핑, 날씨, 일정, 작별 인사에서도 같은 말투');
    expect(prompt).not.toContain('표준 구어체로 말한다');
    expect(prompt).not.toContain('사투리 표현은 최대 하나');
    expect(prompt).not.toContain('뭐 하노');
    expect(prompt).not.toContain('일어날 시간이다');
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
    expect(prompt).not.toContain(
      '포기하는 말투는 실제 포기가 아니라 마지막 압박 연출',
    );
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

describe('speech styles', () => {
  const baseOptions = {
    name: 'Mina',
    assistantName: '하리',
    timeZone: 'Asia/Seoul',
    wakeIntensity: 'gentle',
    callType: 'initial' as const,
    retryCount: 0,
    retryCallsRemaining: 2,
    todayLabel: '2026-07-24',
    currentTimeLabel: '2026-07-24 07:30',
    currentIsoTime: '2026-07-24T07:30:00+09:00',
    weather: '맑음',
    schedule: [],
    customMessage: '',
  };

  it('uses Osaka dialect for Japanese calls', () => {
    const prompt = buildMorningCallPrompt({
      ...baseOptions,
      language: '日本語',
    });

    expect(prompt).toContain('ja-osaka');
    expect(prompt).toContain('大阪弁');
    expect(prompt).toContain('今なんて言った？もう一回はっきり言って');
    expect(prompt).toContain('今日の予定、サクッと聞く？');
    expect(prompt).toContain('大阪弁は短い起こし文句やリアクションに一つだけ');
    expect(prompt).not.toContain('ko-gyeongsang');
    expect(prompt).not.toContain('방금 뭐라고 했어?');
  });

  it('uses California style for English calls', () => {
    const prompt = buildMorningCallPrompt({
      ...baseOptions,
      language: 'English',
      timeZone: 'America/Los_Angeles',
    });

    expect(prompt).toContain('en-california');
    expect(prompt).toContain('California-style English');
    expect(prompt).toContain(
      'Sorry, what did you say? Say that one more time clearly.',
    );
    expect(prompt).toContain("Okay, you're up. Want a quick briefing?");
    expect(prompt).toContain(
      'Use California-style wording only as a light touch',
    );
    expect(prompt).not.toContain('ko-gyeongsang');
    expect(prompt).not.toContain('방금 뭐라고 했어?');
    expect(prompt).toContain('America/Los_Angeles 현지 시간');
    expect(prompt).not.toContain('(KST)');
  });

  it('falls back to the language default when a saved style is incompatible', () => {
    expect(resolveSpeechStyle('日本語', 'ko-gyeongsang').code).toBe('ja-osaka');
    expect(resolveSpeechStyle('English', 'ja-osaka').code).toBe(
      'en-california',
    );
  });
});

describe('buildTestCallPrompt', () => {
  it('keeps onboarding calls short and explicitly disables tools and retries', () => {
    const prompt = buildTestCallPrompt({
      name: '민수',
      assistantName: '하리',
      language: '한국어',
    });

    expect(prompt).toContain('앞으로 내가 아침에 깨워줄게');
    expect(prompt).toContain('사용자의 대답을 한 번만 듣는다');
    expect(prompt).toContain('그럼 전화 끊을게');
    expect(prompt).toContain('직접 끝까지 말한다');
    expect(prompt).toContain('곧바로 통화를 끝낸다');
    expect(prompt).toContain('임의로 대화를 이어가지 않는다');
    expect(prompt).toContain('어떤 함수나 도구도 호출하지 않는다');
    expect(prompt).toContain('재통화는 다루지 않는다');
    expect(prompt).toContain('ko-gyeongsang');
    expect(prompt.length).toBeLessThan(700);
  });

  it('uses the language-specific style in onboarding calls', () => {
    const japanesePrompt = buildTestCallPrompt({
      name: 'ミナ',
      assistantName: 'ハリ',
      language: '日本語',
    });
    const englishPrompt = buildTestCallPrompt({
      name: 'Mina',
      assistantName: 'Hari',
      language: 'English',
    });

    expect(japanesePrompt).toContain('ja-osaka');
    expect(japanesePrompt).toContain('大阪弁');
    expect(englishPrompt).toContain('en-california');
    expect(englishPrompt).toContain('California-style English');
  });
});
