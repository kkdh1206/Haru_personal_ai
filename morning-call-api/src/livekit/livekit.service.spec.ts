jest.mock('livekit-server-sdk', () => ({
  AccessToken: jest.fn(),
  AgentDispatchClient: jest.fn(),
  RoomServiceClient: jest.fn(),
}));

import { AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import { LivekitService } from './livekit.service';

describe('LiveKit agent readiness', () => {
  const room = { createRoom: jest.fn(), listParticipants: jest.fn() };
  const dispatch = { createDispatch: jest.fn(), listDispatch: jest.fn() };
  let service: LivekitService;
  const prepare = () =>
    service.prewarmAgent(
      'alarm-room',
      'prompt',
      'Leda',
      'user',
      'Asia/Seoul',
      'alarm',
      'initial',
      0,
      '한국어',
    );

  beforeEach(() => {
    jest.resetAllMocks();
    room.createRoom.mockResolvedValue({});
    room.listParticipants.mockResolvedValue([]);
    dispatch.createDispatch.mockResolvedValue({});
    dispatch.listDispatch.mockResolvedValue([]);
    (RoomServiceClient as jest.Mock).mockImplementation(() => room);
    (AgentDispatchClient as jest.Mock).mockImplementation(() => dispatch);
    service = new LivekitService({ get: () => 'test' } as any);
  });

  afterEach(() => jest.useRealTimers());

  it('dispatches the agent when only the answering user is in the room', async () => {
    room.listParticipants.mockResolvedValue([{ identity: 'user', kind: 0 }]);
    await prepare();
    expect(dispatch.createDispatch).toHaveBeenCalledTimes(1);
  });

  it.each([{ kind: 4 }, { permission: { agent: true } }])(
    'recognizes an existing agent without redispatching (%p)',
    async (participant) => {
      room.listParticipants.mockResolvedValue([participant]);
      await prepare();
      await service.waitForAgentParticipant('alarm-room', 100);
      expect(dispatch.createDispatch).not.toHaveBeenCalled();
    },
  );

  it('does not report ready while only a user is connected', async () => {
    jest.useFakeTimers();
    room.listParticipants.mockResolvedValue([{ kind: 0 }]);
    const check = expect(
      service.waitForAgentParticipant('alarm-room', 100),
    ).rejects.toThrow('Timed out waiting for agent');
    await jest.advanceTimersByTimeAsync(300);
    await check;
  });

  it('reuses a pending dispatch while its worker is starting', async () => {
    dispatch.listDispatch.mockResolvedValue([
      { agentName: 'Haru', state: { jobs: [] } },
    ]);
    await prepare();
    expect(dispatch.createDispatch).not.toHaveBeenCalled();
  });

  it('creates a new worker after an earlier dispatch has finished', async () => {
    dispatch.listDispatch.mockResolvedValue([
      {
        agentName: 'Haru',
        state: { jobs: [{ state: { endedAt: BigInt(1) } }] },
      },
    ]);
    await prepare();
    expect(dispatch.createDispatch).toHaveBeenCalledTimes(1);
  });

  it('coalesces simultaneous prewarm and recovery requests', async () => {
    await Promise.all([prepare(), prepare(), prepare()]);
    expect(dispatch.createDispatch).toHaveBeenCalledTimes(1);
  });

  it('allows recovery after a failed dispatch', async () => {
    dispatch.createDispatch.mockRejectedValueOnce(
      new Error('worker unavailable'),
    );
    await expect(prepare()).rejects.toThrow('worker unavailable');
    await prepare();
    expect(dispatch.createDispatch).toHaveBeenCalledTimes(2);
  });

  it('passes prewarm grace to the agent without changing its normal answer timeout', async () => {
    await service.prewarmAgent(
      'room',
      'prompt',
      'Leda',
      'user',
      'Asia/Seoul',
      'alarm',
      'initial',
      0,
      '한국어',
      20,
    );
    expect(
      JSON.parse(dispatch.createDispatch.mock.calls[0][2].metadata),
    ).toMatchObject({ participant_wait_grace_seconds: 20 });
  });

  it('reserves the test-call countdown and readiness time before timing out', async () => {
    room.listParticipants
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ kind: 4 }]);
    await service.ensureAgentReadyForTest(
      'room',
      'prompt',
      'Leda',
      'user',
      'Asia/Seoul',
      undefined,
      'test',
      0,
      '한국어',
      10,
    );
    expect(
      JSON.parse(dispatch.createDispatch.mock.calls[0][2].metadata),
    ).toMatchObject({ participant_wait_grace_seconds: 40 });
  });
});
