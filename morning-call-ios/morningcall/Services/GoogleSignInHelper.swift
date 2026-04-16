//
//  GoogleSignInHelper.swift
//  morningcall
//
//  Created by 박원빈 on 6/27/25.
//

import Foundation
import GoogleSignIn
import GoogleSignInSwift
import FirebaseAuth
import FirebaseCore

class GoogleSignInHelper: ObservableObject {
    @Published var accessToken: String?
    @Published var refreshToken: String?

    func signInForCalendar() {
        guard let clientID = FirebaseApp.app()?.options.clientID else { return }

        let config = GIDConfiguration(clientID: clientID)
        GIDSignIn.sharedInstance.configuration = config
        
        guard
            let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
            let rootVC = windowScene.windows.first?.rootViewController
        else {
            print("No root view controller found.")
            return
        }

        let scopes = ["https://www.googleapis.com/auth/calendar"]

        Task {
            do {
                let result = try await GIDSignIn.sharedInstance.signIn(
                    withPresenting: rootVC,
                    hint: nil,
                    additionalScopes: scopes
                )

                let accessToken = result.user.accessToken.tokenString
                let refreshToken = result.user.refreshToken.tokenString
                print("✅ Access Token: \(accessToken)")
                print("✅ Refresh Token: \(refreshToken)")
                registerCalendarTokenToAPI(accessToken: accessToken, refreshToken: refreshToken)
            } catch {
                print("❌ Sign-in error: \(error)")
            }
        }
    }
    
    private func registerCalendarTokenToAPI(accessToken: String, refreshToken: String) {
        AuthTokenManager.shared.refreshTokenIfNeeded { idToken in
            guard let idToken = idToken else { return }

            var request = URLRequest(url: URL(string: "https://morningcall.poapper.com/user/calendar-token")!)
            request.httpMethod = "PATCH"
            request.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            let body: [String: Any] = ["calendarAccessToken": accessToken, "calendarRefreshToken": refreshToken]
            request.httpBody = try? JSONSerialization.data(withJSONObject: body, options: [])

            URLSession.shared.dataTask(with: request) { data, response, error in
                if let error = error {
                    print("🌐 등록 에러: \(error.localizedDescription)")
                    return
                }
                print("✅ 캘린더 토큰 등록 완료")
            }.resume()
        }
    }
}
