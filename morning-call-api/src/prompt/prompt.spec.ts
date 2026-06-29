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
  });
});
