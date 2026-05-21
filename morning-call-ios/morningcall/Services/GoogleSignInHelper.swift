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
import UIKit

class GoogleSignInHelper: ObservableObject {
    @Published var accessToken: String?
    @Published var refreshToken: String?

    func signInForCalendar(completion: @escaping (Bool) -> Void = { _ in }) {
        guard let clientID = FirebaseApp.app()?.options.clientID else {
            completion(false)
            return
        }

        let config = GIDConfiguration(clientID: clientID)
        GIDSignIn.sharedInstance.configuration = config
        
        guard
            let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
            let rootVC = windowScene.windows.first?.rootViewController
        else {
            print("No root view controller found.")
            completion(false)
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
                registerCalendarTokenToAPI(
                    accessToken: accessToken,
                    refreshToken: refreshToken,
                    completion: completion
                )
            } catch {
                print("❌ Sign-in error: \(error)")
                completion(false)
            }
        }
    }
    
    private func registerCalendarTokenToAPI(
        accessToken: String,
        refreshToken: String,
        completion: @escaping (Bool) -> Void
    ) {
        AuthTokenManager.shared.refreshTokenIfNeeded { idToken in
            guard let idToken = idToken else {
                completion(false)
                return
            }

            var request = URLRequest(url: URL(string: "https://morningcall.poapper.com/user/calendar-token")!)
            request.httpMethod = "PATCH"
            request.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            let body: [String: Any] = ["calendarAccessToken": accessToken, "calendarRefreshToken": refreshToken]
            request.httpBody = try? JSONSerialization.data(withJSONObject: body, options: [])

            URLSession.shared.dataTask(with: request) { data, response, error in
                if let error = error {
                    print("🌐 등록 에러: \(error.localizedDescription)")
                    completion(false)
                    return
                }
                if let httpResponse = response as? HTTPURLResponse,
                   !(200...299).contains(httpResponse.statusCode) {
                    print("🌐 캘린더 토큰 등록 실패: \(httpResponse.statusCode)")
                    completion(false)
                    return
                }
                print("✅ 캘린더 토큰 등록 완료")
                DispatchQueue.main.async {
                    self.accessToken = accessToken
                    self.refreshToken = refreshToken
                    completion(true)
                }
            }.resume()
        }
    }
}
