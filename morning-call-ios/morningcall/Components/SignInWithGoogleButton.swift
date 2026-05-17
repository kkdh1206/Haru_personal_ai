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
            .padding(.vertical, 15)
            .background(configuration.isPressed ? Color.white.opacity(0.74) : Color.white)
            .foregroundColor(Color.black.opacity(0.84))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .fontWeight(.bold)
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color.black.opacity(0.08), lineWidth: 1)
            )
    }
}

struct SignInWithGoogleButton: View {
    @EnvironmentObject var authVM: AuthViewModel

    var body: some View {
        Button {
            handleGoogleSignIn()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "g.circle.fill")
                    .font(.system(size: 18, weight: .semibold))
                Text("Google로 계속하기")
                    .font(.system(.body, design: .rounded).weight(.semibold))
            }
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
