//
//  AuthViewRouter.swift
//  morningcall
//
//  Created by 박원빈 on 6/27/25.
//

import SwiftUI
import FirebaseAuth
import GoogleSignInSwift
import AuthenticationServices
import CryptoKit
import Security

struct UserInfo: Decodable {
    let name: String?
    let location: String?
    let interest: String?
    let language: String?
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
                case .enterName:
                    EnterNameView()
                case .requestLocation:
                    RequestLocationView()
                case .completed:
                    AlarmListView()
                        .task {
                            registerDeviceTokenToAPI()
                            CurrentLocationManager.shared.refreshAndSaveIfAuthorized(env: env)
                        }
                }
            } else {
                LoginView()
            }
        }
        .onAppear {
            viewModel.checkAuthState()
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active, viewModel.isLoggedIn, env.onboardingStep == .completed else { return }
            CurrentLocationManager.shared.refreshAndSaveIfAuthorized(env: env)
        }
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
                        language: user.language
                    )
                    let trimmedName = user.name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                    let trimmedLocation = user.location?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

                    if trimmedName.isEmpty {
                        env.onboardingStep = .enterName
                    } else if trimmedLocation.isEmpty {
                        env.onboardingStep = .requestLocation
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
        guard let apnsToken = DeviceTokenManager.shared.deviceToken else {
            print("❌ APNs 토큰 없음")
            return
        }

        AuthTokenManager.shared.refreshTokenIfNeeded { idToken in
            guard let idToken = idToken else { return }

            var request = URLRequest(url: URL(string: "https://morningcall.poapper.com/user/device-token")!)
            request.httpMethod = "PATCH"
            request.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            let body: [String: Any] = ["deviceToken": apnsToken]
            request.httpBody = try? JSONSerialization.data(withJSONObject: body, options: [])

            URLSession.shared.dataTask(with: request) { data, response, error in
                if let error = error {
                    print("🌐 등록 에러: \(error.localizedDescription)")
                    return
                }
                print("✅ 디바이스 토큰 등록 완료")
            }.resume()
        }
    }
}

class AuthViewModel: ObservableObject {
    @Published var isLoggedIn: Bool = false

    func checkAuthState() {
        isLoggedIn = Auth.auth().currentUser != nil
    }

    func signOut() {
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

            VStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Haru")
                        .font(.system(size: 44, weight: .bold, design: .rounded))
                        .foregroundStyle(Color.black.opacity(0.92))

                    Text("따뜻한 아침을 함께 준비해요.")
                        .font(.system(.headline, design: .rounded).weight(.medium))
                        .foregroundStyle(Color.black.opacity(0.62))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 36)

                Spacer(minLength: 16)

                Image("Haru_morning")
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: 250)
                    .shadow(color: Color.black.opacity(0.10), radius: 18, y: 12)

                Spacer(minLength: 20)

                VStack(spacing: 12) {
                    AppleSignInButton()
                    SignInWithGoogleButton()

                    Text(.init("시작하면 [서비스 이용약관](https://example.com/terms) 및 [개인정보 처리방침](https://example.com/privacy)에 동의하게 됩니다."))
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
                .padding(.bottom, 18)
            }
            .padding(.horizontal, 22)
        }
        .preferredColorScheme(.light)
    }
}

struct AppleSignInButton: View {
    @EnvironmentObject var authVM: AuthViewModel
    @State private var currentNonce: String?

    var body: some View {
        SignInWithAppleButton(.signIn) { request in
            let nonce = randomNonceString()
            currentNonce = nonce
            request.requestedScopes = [.fullName, .email]
            request.nonce = sha256(nonce)
        } onCompletion: { result in
            switch result {
            case .success(let authorization):
                handleAuthorization(authorization)
            case .failure(let error):
                print("❌ Apple login error: \(error.localizedDescription)")
            }
        }
        .signInWithAppleButtonStyle(.black)
        .frame(height: 52)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
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

// 임시 저장소 (PushDelegate가 이 값 설정해야 함)
class DeviceTokenManager: ObservableObject {
    static let shared = DeviceTokenManager()
    @Published var deviceToken: String? = nil
}
