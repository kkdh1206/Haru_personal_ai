import UIKit
import PushKit
import Firebase
import GoogleSignIn

/// PushKit + Firebase + Google Sign-In + LiveKit
final class PushDelegate: NSObject, UIApplicationDelegate, PKPushRegistryDelegate {

    override init() {
        super.init()
        print("🚀 PushDelegate initialized")
        _ = pushRegistry
    }

    // MARK: - App Launch
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        FirebaseApp.configure()
        print("🔥 Firebase configured")
        return true
    }

    // MARK: - Google 로그인 redirect 핸들링
    func application(_ app: UIApplication,
                     open url: URL,
                     options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
        return GIDSignIn.sharedInstance.handle(url)
    }

    // MARK: - PushKit 등록
    private lazy var pushRegistry: PKPushRegistry = {
        let reg = PKPushRegistry(queue: .main)
        reg.delegate = self
        reg.desiredPushTypes = [.voIP]
        return reg
    }()

    // 디바이스 토큰 획득
    func pushRegistry(_ registry: PKPushRegistry,
                      didUpdate pushCredentials: PKPushCredentials,
                      for type: PKPushType) {
        let tokenString = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        print("📲 VoIP token:", tokenString)

        // 디바이스 토큰 등록
        DeviceTokenManager.shared.deviceToken = tokenString
    }

    // 푸시 수신 → CallKit 보고
    func pushRegistry(_ registry: PKPushRegistry,
                      didReceiveIncomingPushWith payload: PKPushPayload,
                      for type: PKPushType,
                      completion: @escaping () -> Void) {

        defer { completion() }

        guard let dict = payload.dictionaryPayload as? [String: Any] else { return }

        // 1) payload.* 우선, 2) 최상위 키 백업
        let data = (dict["payload"] as? [String: Any]) ?? dict

        let caller  = (data["caller"] as? String) ?? "Unknown"
        let lkURL   = (data["lkUrl"] as? String)
        let lkToken = (data["lkToken"] as? String)
        let alarmId = (data["alarmId"] as? String)

        // 필수 값 체크
        guard let lkURL, let lkToken else {
            print("🛑 LiveKit push payload missing url/token")
            return
        }

        CallManager.shared.cancelIfOngoing()
        CallManager.shared.prepareIncoming(url: lkURL, token: lkToken, alarmId: alarmId)
        CallManager.shared.reportIncoming(handle: caller)
    }
}
