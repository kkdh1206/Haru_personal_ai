import UIKit
import PushKit
import CallKit
import Firebase
import GoogleSignIn
import UserNotifications

/// PushKit + Firebase + Google Sign-In + LiveKit
final class PushDelegate: NSObject, UIApplicationDelegate, PKPushRegistryDelegate, UNUserNotificationCenterDelegate {

    override init() {
        super.init()
        print("🚀 PushDelegate initialized")
        _ = pushRegistry
    }

    // MARK: - App Launch
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        FirebaseApp.configure()
        let notificationCenter = UNUserNotificationCenter.current()
        notificationCenter.delegate = self
        LocalCallFallbackScheduler.shared.registerNotificationCategory()
        application.registerForRemoteNotifications()
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

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let tokenString = deviceToken.map { String(format: "%02x", $0) }.joined()
        print("📲 Notification token:", tokenString)
        DeviceTokenManager.shared.notificationToken = tokenString
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("❌ Notification token registration failed:", error.localizedDescription)
    }

    // 푸시 수신 → CallKit 보고
    func pushRegistry(_ registry: PKPushRegistry,
                      didReceiveIncomingPushWith payload: PKPushPayload,
                      for type: PKPushType,
                      completion: @escaping () -> Void) {

        guard type == .voIP else {
            completion()
            return
        }

        guard let dict = payload.dictionaryPayload as? [String: Any] else {
            CallManager.shared.reportDiscardedIncoming(handle: "Haru", reason: .failed, completion: completion)
            return
        }

        // 1) payload.* 우선, 2) 최상위 키 백업
        let data = (dict["payload"] as? [String: Any]) ?? dict

        if let type = data["type"] as? String, type == "wake_followup" {
            let title = (data["title"] as? String) ?? "Haru"
            let body = (data["body"] as? String) ?? "전화를 여러 번 드렸는데 연결이 잘 안 돼서 메시지를 남겨요."
            showLocalWakeFollowup(title: title, body: body)
            CallManager.shared.reportDiscardedIncoming(handle: title, reason: .failed, completion: completion)
            return
        }

        let caller  = (data["caller"] as? String) ?? "Unknown"
        let lkURL   = (data["lkUrl"] as? String)
        let lkToken = (data["lkToken"] as? String)
        let alarmId = (data["alarmId"] as? String)

        if LocalCallFallbackScheduler.shared.shouldIgnoreIncomingPush(for: alarmId) {
            CallManager.shared.reportDiscardedIncoming(handle: caller, reason: .unanswered, completion: completion)
            return
        }

        // 필수 값 체크
        guard let lkURL, let lkToken else {
            print("🛑 LiveKit push payload missing url/token")
            CallManager.shared.reportDiscardedIncoming(handle: caller, reason: .failed, completion: completion)
            return
        }

        CallManager.shared.reportIncoming(
            handle: caller,
            url: lkURL,
            token: lkToken,
            alarmId: alarmId,
            completion: completion
        )
    }

    private func showLocalWakeFollowup(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: "haru.wake-followup.\(UUID().uuidString)",
            content: content,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: 0.1, repeats: false)
        )

        UNUserNotificationCenter.current().add(request) { error in
            if let error {
                print("❌ Failed to schedule local wake followup:", error.localizedDescription)
            } else {
                print("✅ Local wake followup notification scheduled")
            }
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo
        let isCallFallback = userInfo["type"] as? String == "callFallback"
        let alarmId = userInfo["alarmId"] as? String

        guard isCallFallback else {
            completionHandler()
            return
        }

        switch response.actionIdentifier {
        case LocalCallFallbackScheduler.stopActionIdentifier:
            LocalCallFallbackScheduler.shared.cancelFallback(for: alarmId) {
                completionHandler()
            }
        default:
            completionHandler()
        }
    }
}
