//
//  SignInWithGoogleButton.swift
//  morningcall
//
//  Created by 박원빈 on 6/27/25.
//

import GoogleSignIn
import GoogleSignInSwift
import FirebaseAuth
import FirebaseCore
import SwiftUI

struct SinInButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .padding()
            .background(configuration.isPressed ? Color.blue.opacity(0.8) : Color.blue)
            .foregroundColor(.white)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .fontWeight(.bold)
    }
}

struct SignInWithGoogleButton: View {
    @EnvironmentObject var authVM: AuthViewModel

    var body: some View {
        Button("Google로 시작하기") {
            handleGoogleSignIn()
        }
        .buttonStyle(SinInButtonStyle())
    }

    func handleGoogleSignIn() {
            guard let clientID = FirebaseApp.app()?.options.clientID else { return }

            let config = GIDConfiguration(clientID: clientID)
            GIDSignIn.sharedInstance.configuration = config

            // SwiftUI에선 UIWindowScene에서 UIViewController를 찾아야 함
            guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                  let rootViewController = windowScene.windows.first?.rootViewController else {
                return
            }

            GIDSignIn.sharedInstance.signIn(withPresenting: rootViewController) { result, error in
                if let error = error {
                    print("❌ Sign-in error: \(error.localizedDescription)")
                    return
                }

                guard
                    let user = result?.user,
                    let idToken = user.idToken?.tokenString
                else {
                    print("❌ Token error")
                    return
                }

                let credential = GoogleAuthProvider.credential(withIDToken: idToken,
                                                                accessToken: user.accessToken.tokenString)

                Auth.auth().signIn(with: credential) { authResult, error in
                    if let error = error {
                        print("❌ Firebase login error: \(error.localizedDescription)")
                    } else {
                        print("✅ Firebase login success! User: \(authResult?.user.uid ?? "")")
                        authVM.checkAuthState()
                    }
                }
            }
        }

}
