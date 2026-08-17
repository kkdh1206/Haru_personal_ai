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

    private let calendarScope = "https://www.googleapis.com/auth/calendar"

    func signInForCalendar(
        completion: @escaping (CalendarConnectionResult) -> Void = { _ in }
    ) {
        Task { @MainActor in
            guard let clientID = FirebaseApp.app()?.options.clientID else {
                completion(.failed)
                return
            }

            GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)

            guard let presenter = Self.presentingViewController() else {
                print("❌ Google Calendar 로그인 화면을 표시할 수 없습니다.")
                completion(.failed)
                return
            }

            do {
                let user: GIDGoogleUser
                if let currentUser = GIDSignIn.sharedInstance.currentUser {
                    if currentUser.grantedScopes?.contains(calendarScope) == true {
                        user = try await currentUser.refreshTokensIfNeeded()
                    } else {
                        let result = try await currentUser.addScopes(
                            [calendarScope],
                            presenting: presenter
                        )
                        user = result.user
                    }
                } else {
                    let result = try await GIDSignIn.sharedInstance.signIn(
                        withPresenting: presenter,
                        hint: nil,
                        additionalScopes: [calendarScope]
                    )
                    user = result.user
                }

                guard user.grantedScopes?.contains(calendarScope) == true else {
                    completion(.permissionDenied)
                    return
                }

                registerCalendarTokenToAPI(user: user, completion: completion)
            } catch {
                print("❌ Sign-in error: \(error)")
                let nsError = error as NSError
                if nsError.domain == kGIDSignInErrorDomain, nsError.code == -5 {
                    completion(.cancelled)
                } else {
                    completion(.failed)
                }
            }
        }
    }

    @MainActor
    private static func presentingViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .sorted { lhs, rhs in
                lhs.activationState == .foregroundActive
                    && rhs.activationState != .foregroundActive
            }

        let rootViewController = scenes.lazy
            .compactMap { scene in
                scene.windows.first(where: { $0.isKeyWindow })?.rootViewController
                    ?? scene.windows.first(where: { !$0.isHidden })?.rootViewController
            }
            .first

        return topViewController(from: rootViewController)
    }

    @MainActor
    private static func topViewController(from viewController: UIViewController?) -> UIViewController? {
        if let presented = viewController?.presentedViewController {
            return topViewController(from: presented)
        }
        if let navigation = viewController as? UINavigationController {
            return topViewController(from: navigation.visibleViewController)
        }
        if let tab = viewController as? UITabBarController {
            return topViewController(from: tab.selectedViewController)
        }
        return viewController
    }

    private func registerCalendarTokenToAPI(
        user: GIDGoogleUser,
        completion: @escaping (CalendarConnectionResult) -> Void
    ) {
        let accessToken = user.accessToken.tokenString
        let refreshToken = user.refreshToken.tokenString
        guard !accessToken.isEmpty, !refreshToken.isEmpty else {
            completion(.failed)
            return
        }

        APIClient.requestVoid(
            path: "/user/calendar-token",
            method: .PATCH,
            body: [
                "calendarAccessToken": accessToken,
                "calendarRefreshToken": refreshToken
            ]
        ) { result in
            switch result {
            case .success:
                DispatchQueue.main.async {
                    self.accessToken = accessToken
                    self.refreshToken = refreshToken
                    CalendarProviderStore.selected = .google
                    completion(.connected)
                }
            case .failure(let error):
                print("🌐 캘린더 토큰 등록 실패: \(error)")
                DispatchQueue.main.async {
                    completion(.failed)
                }
            }
        }
    }
}
