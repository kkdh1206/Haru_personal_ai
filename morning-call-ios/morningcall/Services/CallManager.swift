import SwiftUI
@preconcurrency import CallKit
import AVFoundation
import LiveKit
import LiveKitWebRTC

// MARK: - CallManager (LiveKit + CallKit)
/// LiveKit Room 및 CallKit Provider/Controller를 관리하는 싱글톤 actor
final actor CallManager: NSObject, ObservableObject {

    // MARK: - Properties

    static let shared = CallManager()

    // CallKit
    private let provider: CXProvider
    private let callController = CXCallController()
    private var currentCallUUID: UUID? // 현재 활성화된 통화의 고유 ID
    private var isOutgoing = false // 통화가 발신(true)인지 수신(false)인지 여부

    // LiveKit
    private var room: Room? // LiveKit 실시간 통신 객체
    private var livekitURL: String? // LiveKit 서버 URL
    private var livekitToken: String? // LiveKit 연결 토큰
    private var alarmId: String? // 통화와 관련된 알람 ID (선택)

    // 상태 플래그
    private var isConnectingOrConnected = false // LiveKit 연결 중이거나 이미 연결된 상태

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
        print("LiveKit info prepared: url=\(url != nil), token=\(token != nil)")
    }

    // MARK: - Public helpers (UI/외부 호출)
    
    /// **CallKit**에 수신 통화가 왔음을 알림 (앱이 백그라운드나 종료된 상태에서 사용)
    func reportIncoming(handle: String) {
        let uuid = UUID()
        currentCallUUID = uuid
        isOutgoing = false
        isConnectingOrConnected = false

        let update = CXCallUpdate()
        update.hasVideo = false
        update.supportsHolding = false
        update.supportsDTMF = false
        update.supportsUngrouping = false
        update.supportsGrouping = false
        update.localizedCallerName = handle
        update.remoteHandle = CXHandle(type: .generic, value: handle)

        // CallKit에 새 수신 통화를 보고
        provider.reportNewIncomingCall(with: uuid, update: update) { err in
            if let err = err { print("Incoming error: \(err.localizedDescription)") }
        }
        print("reportIncoming... \(handle)")
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
        isConnectingOrConnected = false

        let handleObj = CXHandle(type: .generic, value: handle)
        let start = CXStartCallAction(call: uuid, handle: handleObj)
        let transaction = CXTransaction(action: start)

        // CallKit 컨트롤러를 통해 시작 액션 요청
        callController.request(transaction) { err in
            if let err = err { print("Outgoing error: \(err.localizedDescription)") }
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
                // 오디오 세션은 이미 CallKit에 의해 활성화됨. 스피커로 강제 출력하려면 아래 주석 해제
                // try? AVAudioSession.sharedInstance().overrideOutputAudioPort(.speaker)
                try await room.localParticipant.setMicrophone(enabled: true)
                print("🎙️ Microphone enabled after connect")
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
            try audioSession.setCategory(.playAndRecord, options: [.allowBluetooth])
            try audioSession.setPreferredSampleRate(48_000)
            try audioSession.setPreferredIOBufferDuration(0.005)
            try audioSession.setActive(true)
            print("🔊 AVAudioSession activated manually")
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
    private func disconnectRoom() {
        Task {
            await room?.disconnect()
            print("🚪 Disconnected LiveKit room")

            // 상태 및 LiveKit 정보 초기화
            livekitURL = nil
            livekitToken = nil
            alarmId = nil
            isConnectingOrConnected = false

            // WebRTC 오디오 비활성화
            let rtc = LKRTCAudioSession.sharedInstance()
            rtc.isAudioEnabled = false
        }
    }
}

// MARK: - RoomDelegate (LiveKit 이벤트 처리)
extension CallManager: RoomDelegate {
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
                await self.cancelIfOngoing()
            }
        }
    }
    
    nonisolated func room(_ room: Room, participant: RemoteParticipant, didUpdate connectionState: ConnectionState) {
        // 상대방의 상태가 disconnected가 되면
        if connectionState == .disconnected {
            print("👤 상대방(에이전트)이 연결을 끊었습니다.")
            Task {
                await self.cancelIfOngoing()
            }
        }
    }

    // ✅ 추가: 방 안에 남은 사람이 아무도 없을 때 (에이전트가 나갔을 때)
    nonisolated func room(_ room: Room, participantDidDisconnect participant: RemoteParticipant) {
        print("👤 상대방이 방에서 나갔습니다.")
        
        // 방에 남은 상대방(RemoteParticipant)이 0명이라면 통화 종료
        if room.remoteParticipants.isEmpty {
            print("📭 방에 아무도 남지 않았습니다. CallKit을 종료합니다.")
            Task {
                await self.cancelIfOngoing()
            }
        }
    }
    
    // ✅ 서버 연결 자체가 끊겼을 때 (방이 폭파되었을 때)
    nonisolated func room(_ room: Room, didUpdate connectionState: ConnectionState, from oldValue: ConnectionState) {
        if case .disconnected = connectionState {
            print("🚪 서버와 연결이 끊겼습니다.")
            Task {
                await self.cancelIfOngoing()
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
            await self.configureAudioAndConnect()
        }
        action.fulfill()
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
            await self.disconnectRoom()
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
