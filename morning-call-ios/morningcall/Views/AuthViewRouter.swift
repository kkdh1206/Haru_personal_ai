//
//  AuthViewRouter.swift
//  morningcall
//
//  Created by 박원빈 on 6/27/25.
//

import SwiftUI
import FirebaseAuth
import FirebaseCore
import GoogleSignInSwift
import AuthenticationServices
import CryptoKit
import Security

struct UserInfo: Decodable {
    let name: String?
    let location: String?
    let interest: String?
    let language: String?
    let speechStyle: String?
}

struct RootView: View {
    @StateObject private var viewModel = AuthViewModel()
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if viewModel.isLoggedIn {
                switch env.onboardingStep {
                case .loading:
                    LoadingView()
                        .onAppear(perform: checkAuth)
                case .featureIntro:
                    FeatureIntroView()
                case .enterName:
                    EnterNameView()
                case .requestLocation:
                    RequestLocationView()
                case .alarmSetup:
                    OnboardingAlarmSetupView()
                case .calendarIntro:
                    CalendarIntroView()
                case .testCallSetup:
                    OnboardingTestCallView()
                case .completed:
                    AlarmListView()
                        .task {
                            registerDeviceTokenToAPI()
                            CurrentLocationManager.shared.refreshAndSaveIfAuthorized(env: env)
                            AppleCalendarService.shared.syncIfNeeded()
                        }
                }
            } else {
                LoginView()
            }
        }
        .onAppear {
            viewModel.checkAuthState()
            AppIconManager.applyStoredPreference()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active, viewModel.isLoggedIn, env.onboardingStep == .completed else { return }
            CurrentLocationManager.shared.refreshAndSaveIfAuthorized(env: env)
            AppleCalendarService.shared.syncIfNeeded()
        }
        .environment(\.locale, env.appLanguage.locale)
        .environmentObject(viewModel)
    }
    
    func checkAuth() {
        APIClient.request(path: "/user", method: .GET) { (result: Result<UserInfo, Error>) in
            DispatchQueue.main.async {
                switch result {
                case .success(let user):
                    env.user = User(
                        id: "id",
                        name: user.name,
                        location: user.location,
                        interest: user.interest,
                        language: user.language,
                        speechStyle: user.speechStyle
                    )
                    DeviceTokenManager.shared.registerTokensToAPI()
                    let trimmedName = user.name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

                    if trimmedName.isEmpty {
                        env.onboardingStep = .enterName
                    } else if FeatureIntroStore.shouldShow(for: user) {
                        env.onboardingStep = FeatureIntroStore.currentStep()
                    } else {
                        env.onboardingStep = .completed
                    }
                case .failure(let error):
                    print("❌ 에러: \(error)")
                }
            }
        }
    }
    
    private func registerDeviceTokenToAPI() {
        DeviceTokenManager.shared.registerTokensToAPI()
    }
}

class AuthViewModel: ObservableObject {
    @Published var isLoggedIn: Bool = false

    func checkAuthState() {
        isLoggedIn = Auth.auth().currentUser != nil
    }

    func signOut() {
        DeviceTokenManager.shared.invalidateRegistration()
        try? Auth.auth().signOut()
        isLoggedIn = false
    }
}

struct LoginView: View {
    @Environment(\.openURL) var openURL
    
    var body: some View {
        ZStack {
            Image("Background_morning")
                .resizable()
                .scaledToFill()
                .ignoresSafeArea()

            GeometryReader { proxy in
                VStack(spacing: 0) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("하루")
                            .font(.system(size: 44, weight: .bold, design: .rounded))
                            .foregroundStyle(Color.black.opacity(0.92))

                        Text("따뜻한 아침을 함께 준비해요.")
                            .font(.system(.headline, design: .rounded).weight(.medium))
                            .foregroundStyle(Color.black.opacity(0.62))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, proxy.safeAreaInsets.top + 64)

                    Spacer(minLength: 40)

                    VStack(spacing: 12) {
                        AppleSignInButton()
                        SignInWithGoogleButton()

                        Text(agreementText)
                            .font(.system(.footnote, design: .rounded))
                            .tint(Color.black.opacity(0.72))
                            .foregroundStyle(Color.black.opacity(0.56))
                            .multilineTextAlignment(.center)
                            .padding(.top, 6)
                    }
                    .padding(18)
                    .background(
                        RoundedRectangle(cornerRadius: 28, style: .continuous)
                            .fill(Color.white.opacity(0.86))
                            .overlay(
                                RoundedRectangle(cornerRadius: 28, style: .continuous)
                                    .stroke(Color.white.opacity(0.72), lineWidth: 1)
                            )
                    )
                    .padding(.bottom, proxy.safeAreaInsets.bottom + 44)
                }
                .padding(.horizontal, 22)
                .frame(width: proxy.size.width, height: proxy.size.height)
            }
        }
        .preferredColorScheme(.light)
    }

    private var agreementText: AttributedString {
        var text = AttributedString("시작하면 ")
        text.append(agreementLinkText("서비스 이용약관", url: "https://morningcall.poapper.com/terms"))
        text.append(AttributedString(" 및 "))
        text.append(agreementLinkText("개인정보 처리방침", url: "https://morningcall.poapper.com/privacy"))
        text.append(AttributedString("에 동의하게 됩니다."))
        return text
    }

    private func agreementLinkText(_ title: String, url: String) -> AttributedString {
        var text = AttributedString(title)
        text.link = URL(string: url)
        text.font = .system(.footnote, design: .rounded).weight(.bold)
        return text
    }
}

struct AppleSignInButton: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var coordinator = AppleSignInCoordinator()
    @State private var currentNonce: String?

    var body: some View {
        Button {
            startAppleSignIn()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "applelogo")
                    .font(.system(size: 18, weight: .semibold))
                Text("Apple로 계속하기")
                    .font(.system(.body, design: .rounded).weight(.semibold))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .foregroundStyle(.white)
            .background(Color.black.opacity(0.92))
        }
        .buttonStyle(.plain)
        .frame(height: 52)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func startAppleSignIn() {
        let nonce = randomNonceString()
        currentNonce = nonce

        coordinator.onAuthorization = { authorization in
            handleAuthorization(authorization)
        }
        coordinator.onError = { error in
            print("❌ Apple login error: \(error.localizedDescription)")
        }

        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = sha256(nonce)

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = coordinator
        controller.presentationContextProvider = coordinator
        controller.performRequests()
    }

    private func handleAuthorization(_ authorization: ASAuthorization) {
        guard
            let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential,
            let nonce = currentNonce,
            let appleIDToken = appleIDCredential.identityToken,
            let idTokenString = String(data: appleIDToken, encoding: .utf8)
        else {
            print("❌ Apple credential error")
            return
        }

        let credential = OAuthProvider.appleCredential(
            withIDToken: idTokenString,
            rawNonce: nonce,
            fullName: appleIDCredential.fullName
        )

        Auth.auth().signIn(with: credential) { authResult, error in
            if let error = error {
                print("❌ Firebase Apple login error: \(error.localizedDescription)")
                return
            }

            print("✅ Firebase Apple login success: \(authResult?.user.uid ?? "")")
            authVM.checkAuthState()
        }
    }

    private func sha256(_ input: String) -> String {
        let inputData = Data(input.utf8)
        let hashedData = SHA256.hash(data: inputData)
        return hashedData.compactMap { String(format: "%02x", $0) }.joined()
    }

    private func randomNonceString(length: Int = 32) -> String {
        precondition(length > 0)
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remainingLength = length

        while remainingLength > 0 {
            var randoms = [UInt8](repeating: 0, count: 16)
            let errorCode = SecRandomCopyBytes(kSecRandomDefault, randoms.count, &randoms)
            guard errorCode == errSecSuccess else {
                fatalError("Unable to generate nonce. SecRandomCopyBytes failed with OSStatus \(errorCode)")
            }

            randoms.forEach { random in
                if remainingLength == 0 {
                    return
                }

                if Int(random) < charset.count {
                    result.append(charset[Int(random)])
                    remainingLength -= 1
                }
            }
        }

        return result
    }
}

final class AppleSignInCoordinator: NSObject, ObservableObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    var onAuthorization: ((ASAuthorization) -> Void)?
    var onError: ((Error) -> Void)?

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        onAuthorization?(authorization)
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        onError?(error)
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes
            .flatMap(\.windows)
            .first { $0.isKeyWindow }
            ?? ASPresentationAnchor()
    }
}

class DeviceTokenManager: ObservableObject {
    static let shared = DeviceTokenManager()

    @Published private(set) var isRegistered = false
    @Published private(set) var isRegistering = false
    @Published var deviceToken: String? = nil {
        didSet {
            invalidateRegistration()
            registerTokensToAPI()
        }
    }
    @Published var notificationToken: String? = nil {
        didSet {
            invalidateRegistration()
            registerTokensToAPI()
        }
    }

    private var registeredFingerprint: String?
    private var registrationRequestID: UUID?

    private static var apnsEnvironment: String {
#if DEBUG
        return "sandbox"
#else
        return "production"
#endif
    }

    func invalidateRegistration() {
        registeredFingerprint = nil
        registrationRequestID = nil
        isRegistered = false
        isRegistering = false
    }

    func registerTokensToAPI(completion: ((Bool) -> Void)? = nil) {
        guard FirebaseApp.app() != nil else {
            completion?(false)
            return
        }
        guard let userID = Auth.auth().currentUser?.uid else {
            completion?(false)
            return
        }
        guard let voipToken = deviceToken else {
            print("❌ VoIP APNs 토큰 없음")
            completion?(false)
            return
        }

        let fingerprint = [
            userID,
            voipToken,
            notificationToken ?? "",
            Self.apnsEnvironment
        ].joined(separator: "|")

        if isRegistered, registeredFingerprint == fingerprint {
            completion?(true)
            return
        }

        let requestID = UUID()
        registrationRequestID = requestID
        isRegistered = false
        isRegistering = true

        var body: [String: Any] = [
            "deviceToken": voipToken,
            "deviceType": "ios",
            "apnsEnvironment": Self.apnsEnvironment
        ]
        if let notificationToken {
            body["notificationToken"] = notificationToken
        }

        APIClient.requestVoid(
            path: "/user/device-token",
            method: .PATCH,
            body: body
        ) { result in
            DispatchQueue.main.async {
                guard self.registrationRequestID == requestID else {
                    completion?(false)
                    return
                }

                self.isRegistering = false
                switch result {
                case .success:
                    print("✅ 디바이스 토큰 등록 완료")
                    self.registeredFingerprint = fingerprint
                    self.isRegistered = true
                    completion?(true)
                case .failure(let error):
                    print("❌ 디바이스 토큰 등록 실패: \(error)")
                    self.registeredFingerprint = nil
                    self.isRegistered = false
                    completion?(false)
                }
            }
        }
    }
}
