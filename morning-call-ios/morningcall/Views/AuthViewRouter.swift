//
//  AuthViewRouter.swift
//  morningcall
//
//  Created by 박원빈 on 6/27/25.
//

import SwiftUI
import FirebaseAuth
import GoogleSignInSwift

struct UserInfo: Decodable {
    let name: String?
    let location: String?
    let interest: String?
    let language: String?
}

struct RootView: View {
    @StateObject private var viewModel = AuthViewModel()
    @EnvironmentObject var env: AppEnvironment

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
                case .selectInterests:
                    SelectInterestsView()
                case .completed:
                    AlarmListView()
                        .task {
                            registerDeviceTokenToAPI()
                        }
                }
            } else {
                LoginView()
            }
        }
        .onAppear {
            viewModel.checkAuthState()
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
                    print(user.name ?? "이름 없음")
                    if user.name == nil {
                        env.onboardingStep = .enterName
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
        VStack(spacing: 20) {
            Spacer()
            Text("Haru")
                .font(.largeTitle)
                .fontWeight(.bold)
            Spacer()
            Text(.init("시작하기 버튼을 누르면 [서비스 이용약관](https://example.com/terms) 및\n[개인정보 처리방침](https://example.com/privacy)에 동의하는 것으로 간주합니다."))
                .font(.footnote)
                .tint(.blue)
                .multilineTextAlignment(.center)
            SignInWithGoogleButton()
        }
        .padding()
    }
}

// 임시 저장소 (PushDelegate가 이 값 설정해야 함)
class DeviceTokenManager: ObservableObject {
    static let shared = DeviceTokenManager()
    @Published var deviceToken: String? = nil
}
