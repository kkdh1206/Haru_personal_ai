import SwiftUI
@preconcurrency import CallKit
import AVFoundation
import LiveKit
import LiveKitWebRTC

private enum LocalNudgeAudioLibrary {
    static let assetsByStage: [Int: [String]] = [
        1: ["wakeup", "warm_wake_water"],
        2: ["wakeupx5", "late_wakeup_warning"],
        3: ["last_chance"],
    ]

    static func randomAsset(for stage: Int) -> String? {
        assetsByStage[stage]?.randomElement()
    }
}

enum CallPresentationPhase: Equatable {
    case idle
    case incoming
    case connecting
    case active
}

@MainActor
final class CallPresentationStore: ObservableObject {
    static let shared = CallPresentationStore()

    @Published private(set) var phase: CallPresentationPhase = .idle
    @Published private(set) var callerName = "Haru"
    @Published private(set) var alarmID: String?
    @Published private(set) var connectedAt: Date?
    @Published private(set) var isMuted = false
    @Published private(set) var isSpeakerOn = false
    @Published private(set) var lastEndedAlarmID: String?
    @Published private(set) var onboardingTestCompleted = FeatureIntroStore.testCallCompleted

    var isVisible: Bool {
        phase != .idle
    }

    func showIncoming(callerName: String, alarmID: String?) {
        self.callerName = callerName
        self.alarmID = alarmID
        connectedAt = nil
        isMuted = false
        isSpeakerOn = false
        phase = .incoming
    }

    func showConnecting(callerName: String? = nil, alarmID: String? = nil) {
        if let callerName {
            self.callerName = callerName
        }
        if let alarmID {
            self.alarmID = alarmID
        }
        phase = .connecting
    }

    func showActive() {
        if connectedAt == nil {
            connectedAt = Date()
        }
        phase = .active
    }

    func setMuted(_ muted: Bool) {
        isMuted = muted
    }

    func setSpeakerOn(_ speakerOn: Bool) {
        isSpeakerOn = speakerOn
    }

    func finishCall(alarmID endedAlarmID: String?, wasAnswered: Bool) {
        if let endedAlarmID,
           wasAnswered || endedAlarmID == "onboarding-test" {
            lastEndedAlarmID = endedAlarmID
        }
        if endedAlarmID == "onboarding-test", wasAnswered {
            markOnboardingTestCompleted()
        }
        phase = .idle
        connectedAt = nil
        alarmID = nil
        isMuted = false
        isSpeakerOn = false
    }

    func prepareForOnboardingTest() {
        lastEndedAlarmID = nil
        onboardingTestCompleted = false
        FeatureIntroStore.clearTestCallCompleted()
    }

    func markOnboardingTestCompleted() {
        onboardingTestCompleted = true
        FeatureIntroStore.markTestCallCompleted()
    }

    func refreshOnboardingTestCompletion() {
        if FeatureIntroStore.testCallCompleted
            || (alarmID == "onboarding-test" && (phase == .connecting || phase == .active)) {
            onboardingTestCompleted = true
        }
    }
}

// MARK: - CallManager (LiveKit + CallKit)
/// LiveKit Room 및 CallKit Provider/Controller를 관리하는 싱글톤 actor
final actor CallManager: NSObject, ObservableObject {

    // MARK: - Properties

    static let shared = CallManager()

    // CallKit
    nonisolated(unsafe) private let provider: CXProvider
    private let callController = CXCallController()
    private var currentCallUUID: UUID? // 현재 활성화된 통화의 고유 ID
    private var isOutgoing = false // 통화가 발신(true)인지 수신(false)인지 여부
    private var wasAnswered = false
    private var currentCallerName = "Haru"

    // LiveKit
    private var room: Room? // LiveKit 실시간 통신 객체
    private var livekitURL: String? // LiveKit 서버 URL
    private var livekitToken: String? // LiveKit 연결 토큰
    private var alarmId: String? // 통화와 관련된 알람 ID (선택)

    // 상태 플래그
    private var isConnectingOrConnected = false // LiveKit 연결 중이거나 이미 연결된 상태

    // 로컬 무응답 깨우기 음성
    private var localNudgeAudioPlayer: AVAudioPlayer?
    private var localNudgeCompletionTask: Task<Void, Never>?
    private var localNudgeRequestID: String?
    private var localNudgeAsset: String?
    private var userPrefersSpeaker = false
    private var localNudgeForcedSpeaker = false

    // MARK: - Init

    override init() {
        // 1. CallKit Provider 설정
        let config = CXProviderConfiguration()
        config.supportsVideo = false // 비디오 통화 미지원
        config.includesCallsInRecents = false // 최근 통화 목록에 표시 안 함
        config.supportedHandleTypes = [.generic] // 일반 핸들 타입 사용
        // 아이콘 설정 (전화 모양 시스템 이미지 사용)
        config.iconTemplateImageData = UIImage(systemName: "phone")?.pngData()
        provider = CXProvider(configuration: config)

        super.init()
        // CallKit 이벤트를 받기 위해 델리게이트 설정
        provider.setDelegate(self, queue: nil)

        // LiveKit Room 초기화
        self.room = Room(delegate: self)

        // 일반 대화는 수화부로 시작하고, 무응답 깨우기 WAV를 재생할 때만
        // 잠시 스피커로 전환합니다.
        AudioManager.shared.isSpeakerOutputPreferred = false

        // WebRTC 오디오 세션 수동 관리 설정
        let rtc = LKRTCAudioSession.sharedInstance()
        rtc.useManualAudio = true // 오디오 세션을 직접 활성화/비활성화
        rtc.isAudioEnabled = false  // 초기 오디오 비활성화

        print("Init CallManager")
    }

    deinit {
        provider.invalidate() // Provider 정리
    }

    // MARK: - 외부 정보 준비
    
    /// Push 알림 등을 통해 전달된 LiveKit 연결 정보를 저장
    func prepareIncoming(url: String?, token: String?, alarmId: String?) {
        self.livekitURL = url
        self.livekitToken = token
        self.alarmId = alarmId
        LocalCallFallbackScheduler.shared.cancelFallback(for: alarmId)
        print("LiveKit info prepared: url=\(url != nil), token=\(token != nil)")
    }

    // MARK: - Public helpers (UI/외부 호출)
    
    /// **CallKit**에 수신 통화가 왔음을 알림 (앱이 백그라운드나 종료된 상태에서 사용)
    nonisolated func reportIncoming(
        handle: String,
        url: String,
        token: String,
        alarmId: String?,
        completion: (() -> Void)? = nil
    ) {
        let uuid = UUID()
        let update = incomingCallUpdate(handle: handle)
        let provider = self.provider

        Task {
            await self.stageIncomingCall(
                uuid: uuid,
                handle: handle,
                url: url,
                token: token,
                alarmId: alarmId
            )
            await MainActor.run {
                CallPresentationStore.shared.showIncoming(
                    callerName: handle,
                    alarmID: alarmId
                )
            }

            // 연결 정보를 먼저 저장한 뒤 CallKit에 수신 통화를 보고합니다.
            do {
                try await provider.reportNewIncomingCall(with: uuid, update: update)
            } catch {
                print("Incoming error: \(error.localizedDescription)")
                await self.failCallPresentation(uuid: uuid)
            }
            completion?()
        }
        print("reportIncoming... \(handle)")
    }

    private func stageIncomingCall(
        uuid: UUID,
        handle: String,
        url: String,
        token: String,
        alarmId: String?
    ) {
        cancelIfOngoing()
        currentCallUUID = uuid
        isOutgoing = false
        wasAnswered = false
        currentCallerName = handle
        isConnectingOrConnected = false
        prepareIncoming(url: url, token: token, alarmId: alarmId)
    }

    private func failCallPresentation(uuid: UUID) {
        guard currentCallUUID == uuid else { return }
        clearLocalNudgePlayback()
        let endedAlarmID = alarmId
        currentCallUUID = nil
        livekitURL = nil
        livekitToken = nil
        alarmId = nil
        isConnectingOrConnected = false
        Task { @MainActor in
            CallPresentationStore.shared.finishCall(
                alarmID: endedAlarmID,
                wasAnswered: false
            )
        }
    }

    /// 통화가 아닌 VoIP 푸시나 처리할 수 없는 푸시도 CallKit에 보고한 뒤 즉시 종료합니다.
    /// PushKit VoIP 푸시를 보고 없이 반환하면 iOS가 앱을 강제 종료합니다.
    nonisolated func reportDiscardedIncoming(
        handle: String,
        reason: CXCallEndedReason,
        completion: @escaping () -> Void
    ) {
        let uuid = UUID()
        let provider = self.provider
        let update = incomingCallUpdate(handle: handle)

        provider.reportNewIncomingCall(with: uuid, update: update) { error in
            if let error {
                print("Discarded incoming report error: \(error.localizedDescription)")
            } else {
                provider.reportCall(with: uuid, endedAt: Date(), reason: reason)
            }
            completion()
        }
    }

    nonisolated private func incomingCallUpdate(handle: String) -> CXCallUpdate {
        let update = CXCallUpdate()
        update.hasVideo = false
        update.supportsHolding = false
        update.supportsDTMF = false
        update.supportsUngrouping = false
        update.supportsGrouping = false
        update.localizedCallerName = handle
        update.remoteHandle = CXHandle(type: .generic, value: handle)
        return update
    }

    /// 현재 진행 중인 통화가 있다면 CallKit을 통해 종료 요청
    func cancelIfOngoing() {
        guard let uuid = currentCallUUID else { return }
        let end = CXEndCallAction(call: uuid)
        let tx = CXTransaction(action: end)
        // CallKit 컨트롤러를 통해 종료 액션 요청
        callController.request(tx) { err in
            if let err = err { print("End existing call error:", err) }
        }
    }

    /// **CallKit**에 발신 통화 시작을 요청 (앱이 포그라운드일 때 사용)
    func startOutgoing(handle: String) {
        let uuid = UUID()
        currentCallUUID = uuid
        isOutgoing = true
        wasAnswered = true
        currentCallerName = handle
        isConnectingOrConnected = false
        let currentAlarmID = alarmId

        Task { @MainActor in
            CallPresentationStore.shared.showConnecting(
                callerName: handle,
                alarmID: currentAlarmID
            )
        }

        let handleObj = CXHandle(type: .generic, value: handle)
        let start = CXStartCallAction(call: uuid, handle: handleObj)
        let transaction = CXTransaction(action: start)

        // CallKit 컨트롤러를 통해 시작 액션 요청
        callController.request(transaction) { err in
            if let err = err {
                print("Outgoing error: \(err.localizedDescription)")
                Task {
                    await self.failCallPresentation(uuid: uuid)
                }
            }
        }
    }

    func endCurrentCall() {
        cancelIfOngoing()
    }

    private func endCurrentCallFromRemote() async {
        guard let uuid = currentCallUUID else { return }
        provider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
        await disconnectRoomIfCurrent(uuid: uuid)
    }

    func setMuted(_ muted: Bool) async {
        guard let room else { return }
        do {
            try await room.localParticipant.setMicrophone(enabled: !muted)
            await MainActor.run {
                CallPresentationStore.shared.setMuted(muted)
            }
        } catch {
            print("Microphone state update failed: \(error.localizedDescription)")
        }
    }

    func setSpeakerOn(_ speakerOn: Bool) {
        userPrefersSpeaker = speakerOn
        localNudgeForcedSpeaker = false
        applySpeakerRoute(speakerOn)
    }

    private func applySpeakerRoute(_ speakerOn: Bool) {
        AudioManager.shared.isSpeakerOutputPreferred = speakerOn
        do {
            try AVAudioSession.sharedInstance().overrideOutputAudioPort(
                speakerOn ? .speaker : .none
            )
            Task { @MainActor in
                CallPresentationStore.shared.setSpeakerOn(speakerOn)
            }
        } catch {
            print("Speaker state update failed: \(error.localizedDescription)")
        }
    }

    private func beginLocalNudgeSpeakerBoost() {
        guard !userPrefersSpeaker else { return }
        localNudgeForcedSpeaker = true
        applySpeakerRoute(true)
    }

    private func restoreSpeakerAfterLocalNudge() {
        guard localNudgeForcedSpeaker else { return }
        localNudgeForcedSpeaker = false
        applySpeakerRoute(userPrefersSpeaker)
    }

    // MARK: - 로컬 무응답 깨우기 음성

    private func playLocalNudge(stage: Int, requestID: String) async {
        guard currentCallUUID != nil, wasAnswered, isConnectingOrConnected else {
            await publishLocalAudioEvent(
                type: "local_audio.failed",
                requestID: requestID,
                reason: "call_not_active"
            )
            return
        }

        guard let asset = LocalNudgeAudioLibrary.randomAsset(for: stage) else {
            await publishLocalAudioEvent(
                type: "local_audio.failed",
                requestID: requestID,
                reason: "unknown_stage"
            )
            return
        }

        guard let url = Bundle.main.url(forResource: asset, withExtension: "wav") else {
            print("⚠️ Local nudge WAV is missing from the app bundle: \(asset).wav")
            await publishLocalAudioEvent(
                type: "local_audio.failed",
                requestID: requestID,
                asset: asset,
                reason: "asset_missing"
            )
            return
        }

        if let activeRequestID = localNudgeRequestID {
            await finishLocalNudge(
                requestID: activeRequestID,
                reason: "replaced",
                notifyAgent: true
            )
        }

        do {
            let player = try AVAudioPlayer(contentsOf: url)
            player.numberOfLoops = 0
            player.volume = 1
            player.prepareToPlay()
            beginLocalNudgeSpeakerBoost()

            guard player.play() else {
                restoreSpeakerAfterLocalNudge()
                await publishLocalAudioEvent(
                    type: "local_audio.failed",
                    requestID: requestID,
                    asset: asset,
                    reason: "playback_rejected"
                )
                return
            }

            localNudgeAudioPlayer = player
            localNudgeRequestID = requestID
            localNudgeAsset = asset

            let durationMilliseconds = Int((player.duration * 1_000).rounded())
            let waitNanoseconds = UInt64(max(player.duration + 0.25, 0) * 1_000_000_000)
            localNudgeCompletionTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: waitNanoseconds)
                guard !Task.isCancelled else { return }
                await self?.finishLocalNudge(
                    requestID: requestID,
                    reason: "completed",
                    notifyAgent: true
                )
            }

            print("🔔 Playing local nudge: stage=\(stage) asset=\(asset).wav")
            await publishLocalAudioEvent(
                type: "local_audio.started",
                requestID: requestID,
                asset: asset,
                durationMilliseconds: durationMilliseconds
            )
        } catch {
            print("⚠️ Failed to play local nudge \(asset).wav: \(error.localizedDescription)")
            clearLocalNudgePlayback()
            await publishLocalAudioEvent(
                type: "local_audio.failed",
                requestID: requestID,
                asset: asset,
                reason: "player_error"
            )
        }
    }

    private func stopLocalNudge(requestID: String?, reason: String) async {
        guard let activeRequestID = localNudgeRequestID else { return }
        guard requestID == nil || requestID == activeRequestID else { return }

        await finishLocalNudge(
            requestID: activeRequestID,
            reason: reason,
            notifyAgent: true
        )
    }

    private func finishLocalNudge(
        requestID: String,
        reason: String,
        notifyAgent: Bool
    ) async {
        guard localNudgeRequestID == requestID else { return }
        let asset = localNudgeAsset
        clearLocalNudgePlayback()
        print("🔕 Local nudge finished: asset=\(asset ?? "(unknown)") reason=\(reason)")

        if notifyAgent {
            await publishLocalAudioEvent(
                type: "local_audio.finished",
                requestID: requestID,
                asset: asset,
                reason: reason
            )
        }
    }

    private func clearLocalNudgePlayback() {
        localNudgeCompletionTask?.cancel()
        localNudgeCompletionTask = nil
        localNudgeAudioPlayer?.stop()
        localNudgeAudioPlayer = nil
        localNudgeRequestID = nil
        localNudgeAsset = nil
        restoreSpeakerAfterLocalNudge()
    }

    private func publishLocalAudioEvent(
        type: String,
        requestID: String,
        asset: String? = nil,
        reason: String? = nil,
        durationMilliseconds: Int? = nil
    ) async {
        guard let room else { return }

        var payload: [String: Any] = [
            "type": type,
            "requestId": requestID,
        ]
        if let asset {
            payload["asset"] = asset
        }
        if let reason {
            payload["reason"] = reason
        }
        if let durationMilliseconds {
            payload["durationMs"] = durationMilliseconds
        }

        do {
            let data = try JSONSerialization.data(withJSONObject: payload)
            let options = DataPublishOptions(
                topic: "haru.call.control",
                reliable: true
            )
            try await room.localParticipant.publish(data: data, options: options)
        } catch {
            print("⚠️ Failed to publish local audio event: \(error.localizedDescription)")
        }
    }

    // MARK: - LiveKit 연결 및 해제

    /// **CallKit 오디오 세션 활성화(didActivate) 이후** LiveKit 방에 연결 시도
    private func connectRoomAfterActivation() {
        print("LiveKit 연결 시도")
        guard !isConnectingOrConnected else {
            print("⚠️ Already connecting/connected; skip")
            return
        }
        guard let url = livekitURL, let token = livekitToken, let room = self.room else {
            print("🛑 Missing LiveKit url/token/room")

            if let uuid = currentCallUUID {
                let end = CXEndCallAction(call: uuid)
                let tx = CXTransaction(action: end)
                callController.request(tx) { error in
                    if let error = error {
                        print("End call due to missing LiveKit info: \(error)")
                    }
                }
            }
            return
        }

        isConnectingOrConnected = true

        Task {
            do {
                // 1. LiveKit Room 연결
                try await room.connect(url: url, token: token)
                print("✅ Connected to LiveKit room")

                // 2. 발신 통화였다면, CallKit에 '연결 완료' 보고
                if isOutgoing, let uuid = currentCallUUID {
                    provider.reportOutgoingCall(with: uuid, connectedAt: Date())
                }

                // 3. 오디오 입출력 설정 및 마이크 활성화
                try await room.localParticipant.setMicrophone(enabled: true)
                print("🎙️ Microphone enabled after connect")
                await MainActor.run {
                    CallPresentationStore.shared.showActive()
                    CallPresentationStore.shared.setSpeakerOn(false)
                }
            } catch {
                print("🛑 LiveKit connect error: \(error.localizedDescription)")
                isConnectingOrConnected = false
                // 연결 실패 시 CallKit 통화 종료
                if let uuid = currentCallUUID {
                    let end = CXEndCallAction(call: uuid)
                    let tx = CXTransaction(action: end)
                    do {
                        try await callController.request(tx)
                        print("Successfully ended call.")
                    } catch {
                        print("End call after connect failure:", error)
                    }
                }
            }
        }
    }
    
    private func configureAudioAndConnect() {
        guard !isConnectingOrConnected else {
            print("⚠️ Already connecting/connected; skip configureAudioAndConnect")
            return
        }

        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [.allowBluetoothHFP]
            )
            try audioSession.setPreferredSampleRate(48_000)
            try audioSession.setPreferredIOBufferDuration(0.005)
            try audioSession.setActive(true)
            try audioSession.overrideOutputAudioPort(.none)
            userPrefersSpeaker = false
            localNudgeForcedSpeaker = false
            print("📱 AVAudioSession activated with receiver preferred")
        } catch {
            print("AVAudioSession config/activate error: \(error)")
        }

        let rtc = LKRTCAudioSession.sharedInstance()
        rtc.useManualAudio = true
        rtc.audioSessionDidActivate(audioSession)
        rtc.isAudioEnabled = true

        // LiveKit 방 연결
        connectRoomAfterActivation()
    }


    /// LiveKit Room 연결을 해제 후 상태를 초기화
    private func disconnectRoom() async {
        clearLocalNudgePlayback()
        let endedAlarmID = alarmId
        let answered = wasAnswered
        let currentRoom = room

        livekitURL = nil
        livekitToken = nil
        alarmId = nil
        isConnectingOrConnected = false
        currentCallUUID = nil
        isOutgoing = false
        wasAnswered = false
        userPrefersSpeaker = false
        localNudgeForcedSpeaker = false

        let rtc = LKRTCAudioSession.sharedInstance()
        rtc.isAudioEnabled = false

        await MainActor.run {
            CallPresentationStore.shared.finishCall(
                alarmID: endedAlarmID,
                wasAnswered: answered
            )
        }

        await currentRoom?.disconnect()
        print("🚪 Disconnected LiveKit room")
    }
}

// MARK: - RoomDelegate (LiveKit 이벤트 처리)
extension CallManager: RoomDelegate {
    nonisolated func room(
        _ room: Room,
        participant: RemoteParticipant?,
        didReceiveData data: Data,
        forTopic topic: String,
        encryptionType: EncryptionType
    ) {
        guard topic == "haru.call.control",
              let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = payload["type"] as? String else {
            return
        }

        switch type {
        case "call.end":
            print("📴 서버에서 통화 종료 신호를 받았습니다.")
            Task {
                await self.endCurrentCallFromRemote()
            }
        case "local_audio.play":
            guard let requestID = payload["requestId"] as? String,
                  let stage = payload["stage"] as? Int else {
                return
            }
            Task {
                await self.playLocalNudge(stage: stage, requestID: requestID)
            }
        case "local_audio.stop":
            let requestID = payload["requestId"] as? String
            let reason = payload["reason"] as? String ?? "stopped"
            Task {
                await self.stopLocalNudge(requestID: requestID, reason: reason)
            }
        default:
            break
        }
    }

    nonisolated func room(_ room: Room, participant: RemoteParticipant, didPublishTrack publication: RemoteTrackPublication) {
        print("📡 Remote published: \(publication.kind) sid=\(publication.sid)")
    }

    nonisolated func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication) {
        print("🔊 Subscribed remote track: \(publication.kind)")
    }

    nonisolated func room(_ room: Room, participant localParticipant: LocalParticipant, didPublishTrack publication: LocalTrackPublication) {
        print("🎤 Local published: \(publication.kind) sid=\(publication.sid)")
    }

    nonisolated func room(_ room: Room, didUpdateConnectionState connectionState: ConnectionState, from oldValue: ConnectionState) {
        print("🔗 Room state: \(oldValue) -> \(connectionState)")
        
        if case .disconnected = connectionState {
            print("🚪 서버 연결이 종료되었습니다. CallKit을 종료합니다.")
            Task {
                await self.endCurrentCallFromRemote()
            }
        }
    }
    
    nonisolated func room(_ room: Room, participantDidDisconnect participant: RemoteParticipant) {
        print("👤 상대방이 방에서 나갔습니다.")
        
        // 방에 남은 상대방(RemoteParticipant)이 0명이라면 통화 종료
        if room.remoteParticipants.isEmpty {
            print("📭 방에 아무도 남지 않았습니다. CallKit을 종료합니다.")
            Task {
                await self.endCurrentCallFromRemote()
            }
        }
    }
    
    // ✅ 서버 연결 자체가 끊겼을 때 (방이 폭파되었을 때)
    nonisolated func room(_ room: Room, didUpdate connectionState: ConnectionState, from oldValue: ConnectionState) {
        if case .disconnected = connectionState {
            print("🚪 서버와 연결이 끊겼습니다.")
            Task {
                await self.endCurrentCallFromRemote()
            }
        }
    }
}

// MARK: - CXProviderDelegate (CallKit 액션 처리)
extension CallManager: CXProviderDelegate {
    
    // CallKit Provider를 리셋해야 할 때 호출됨
    nonisolated func providerDidReset(_ provider: CXProvider) {
        print("🔄 Provider did reset")
        // LiveKit 연결 해제
        Task {
            await self.disconnectRoom()
        }
    }
    
    // CallKit이 수신 통화 응답을 허용했을 때 호출
    nonisolated func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        print("📞 Answered incoming call")
        Task {
            guard await self.markAnsweredAndShowConnecting(uuid: action.callUUID) else {
                action.fail()
                return
            }
            await self.configureAudioAndConnect()
            action.fulfill()
        }
    }

    // CallKit이 발신 통화 시작을 허용했을 때 호출
    nonisolated func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        print("📤 Started outgoing call")
        Task {
            await self.configureAudioAndConnect()
        }
        action.fulfill()
    }

    // CallKit이 통화 종료를 요청했을 때 호출 (사용자가 종료 버튼을 누르거나 시스템이 종료할 때)
    nonisolated func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        print("❌ Call ended")
        action.fulfill()
        // LiveKit 연결 해제
        Task {
            await self.disconnectRoomIfCurrent(uuid: action.callUUID)
        }
    }

    // CallKit이 통화를 위해 AVAudioSession을 활성화했을 때 호출
    // 여기서 WebRTC 및 LiveKit 연결 준비를 시작
    nonisolated func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
//        print("🔊 Audio session activated → configure")
//
//        // 1) AVAudioSession 설정: 통화에 최적화된 설정 적용
//        // CallKit이 활성화한 세션을 음성 채팅 모드로 설정하여 송수신 및 스피커/블루투스 사용을 허용
//        do {
//            try audioSession.setCategory(.playAndRecord,
//                                         mode: .voiceChat,
//                                         options: [AVAudioSession.CategoryOptions.allowBluetoothHFP])
//            try audioSession.setPreferredSampleRate(48_000)
//            try audioSession.setPreferredIOBufferDuration(0.005)
//        } catch {
//            print("AVAudioSession config error: \(error)")
//        }
//
//        // 2) WebRTC 라이브러리(LiveKitWebRTC)에 활성화 통지
//        // WebRTC의 오디오 엔진이 오디오 세션을 사용하여 데이터를 처리하도록 준비
//        let rtc = LKRTCAudioSession.sharedInstance()
//        rtc.useManualAudio = true
//        rtc.audioSessionDidActivate(audioSession)
//        rtc.isAudioEnabled = true // WebRTC 오디오 송수신 엔진 활성화
//
//        // 3) 오디오 세션이 활성화되었으므로, 이제 LiveKit 연결을 시작
//        Task {
//            await self.connectRoomAfterActivation()
//        }
        print("📣 CallKit didActivate called (we already activated manually).")
    }

    // CallKit이 오디오 세션을 비활성화했을 때 호출
    nonisolated func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        print("🔇 Audio session deactivated")
        
        // WebRTC 오디오 엔진 중지 및 세션 비활성화 통지
        let rtc = LKRTCAudioSession.sharedInstance()
        rtc.isAudioEnabled = false
        rtc.audioSessionDidDeactivate(audioSession)

        // LiveKit 연결 해제
        Task {
            await self.disconnectRoom()
        }
    }
}

private extension CallManager {
    func markAnsweredAndShowConnecting(uuid: UUID) async -> Bool {
        guard currentCallUUID == uuid else { return false }
        wasAnswered = true
        let callerName = currentCallerName
        let currentAlarmID = alarmId
        await MainActor.run {
            if currentAlarmID == "onboarding-test" {
                CallPresentationStore.shared.markOnboardingTestCompleted()
            }
            CallPresentationStore.shared.showConnecting(
                callerName: callerName,
                alarmID: currentAlarmID
            )
        }
        return true
    }

    func disconnectRoomIfCurrent(uuid: UUID) async {
        guard currentCallUUID == uuid else { return }
        await disconnectRoom()
    }
}
