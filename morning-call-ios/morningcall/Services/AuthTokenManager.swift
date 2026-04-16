//
//  AuthTokenManager.swift
//  morningcall
//
//  Created by 박원빈 on 6/27/25.
//

import Foundation
import FirebaseAuth

class AuthTokenManager: ObservableObject {
    static let shared = AuthTokenManager()

    @Published var idToken: String? = nil

    init() {
        refreshTokenIfNeeded()
    }

    func refreshTokenIfNeeded(forceRefresh: Bool = false, completion: ((String?) -> Void)? = nil) {
        guard let user = Auth.auth().currentUser else {
            print("🔒 No user logged in")
            self.idToken = nil
            completion?(nil)
            return
        }

        user.getIDTokenForcingRefresh(forceRefresh) { token, error in
            if let error = error {
                print("❌ Token error: \(error.localizedDescription)")
                self.idToken = nil
                completion?(nil)
            } else {
                print("🔐 Fetched Firebase ID Token: \(token ?? "nil")")
                self.idToken = token
                completion?(token)
            }
        }
    }
}
