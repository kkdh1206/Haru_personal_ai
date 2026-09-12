//
//  EnterNameView.swift
//  morningcall
//
//  Created by 박원빈 on 7/5/25.
//

import SwiftUI

struct EnterNameView: View {
    @EnvironmentObject var env: AppEnvironment
    @State private var name = ""
    @State private var showNameError = false
    @State private var showSaveError = false
    @State private var isSaving = false

    var body: some View {
        ZStack {
            fixedBackground

            GeometryReader { proxy in
                VStack(alignment: .leading, spacing: 0) {
                    // Before language selection, use English with Korean/Japanese hints for key actions.
                    Text(verbatim: "Profile")
                        .font(.system(.headline, design: .rounded).weight(.semibold))
                        .foregroundStyle(Color.black.opacity(0.56))
                        .lineLimit(1)
                        .frame(height: 28)
                        .frame(maxWidth: .infinity, alignment: .trailing)

                    Spacer(minLength: 24)

                    VStack(alignment: .leading, spacing: 18) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(verbatim: "What should I call you?")
                                .font(.system(.title, design: .rounded).weight(.bold))
                                .foregroundStyle(Color.black.opacity(0.92))

                            Text(verbatim: "뭐라고 불러드릴까요?\nなんとお呼びすればいいですか？")
                                .font(.system(.subheadline, design: .rounded))
                                .foregroundStyle(Color.black.opacity(0.58))
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        TextField(text: $name) {
                            Text(verbatim: "Your name")
                        }
                            .textInputAutocapitalization(.never)
                            .padding(16)
                            .background(Color.white.opacity(0.88), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .foregroundStyle(Color.black.opacity(0.90))
                            .submitLabel(.done)
                            .disabled(isSaving)
                            .onSubmit {
                                goNext()
                            }

                        if showNameError {
                            Text(verbatim: "Please enter your name to continue.")
                                .font(.system(.footnote, design: .rounded).weight(.semibold))
                                .foregroundStyle(Color.red.opacity(0.82))
                        }

                        if showSaveError {
                            Text(verbatim: "Couldn't save your profile. Please try again.")
                                .font(.system(.footnote, design: .rounded).weight(.semibold))
                                .foregroundStyle(Color.red.opacity(0.82))
                        }
                    }
                    .frame(maxWidth: .infinity)

                    Spacer(minLength: 24)

                    Button {
                        goNext()
                    } label: {
                        Text(verbatim: isSaving ? "Saving..." : "Next")
                    }
                    .disabled(isSaving)
                    .buttonStyle(PrimaryButtonStyle())
                    .padding(.bottom, proxy.safeAreaInsets.bottom + 44)
                }
                .padding(.horizontal, 22)
                .padding(.top, proxy.safeAreaInsets.top + 44)
                .frame(width: proxy.size.width, height: proxy.size.height)
            }
        }
        .onAppear {
            name = env.user?.name ?? ""
        }
        .preferredColorScheme(.light)
    }

    private var fixedBackground: some View {
        Image("Background_morning")
            .resizable()
            .scaledToFill()
            .frame(width: UIScreen.main.bounds.width, height: UIScreen.main.bounds.height)
            .clipped()
            .ignoresSafeArea(.all)
    }

    private func goNext() {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            showNameError = true
            return
        }

        showNameError = false
        showSaveError = false
        isSaving = true

        let language = env.user?.language ?? "한국어"
        let speechStyle = SpeechStyle.value(
            forCallLanguage: language,
            preserving: env.user?.speechStyle,
            currentLanguage: env.user?.language
        )
        APIClient.request(path: "/user", method: .PUT, body: [
            "name": trimmed,
            "location": env.user?.location ?? "",
            "language": language,
            "speechStyle": speechStyle
        ]) { (result: Result<UserInfo, Error>) in
            DispatchQueue.main.async {
                isSaving = false

                switch result {
                case .success(let user):
                    env.user?.name = user.name ?? trimmed
                    env.user?.location = user.location ?? env.user?.location
                    env.user?.language = user.language ?? env.user?.language
                    env.user?.speechStyle = user.speechStyle ?? env.user?.speechStyle

                    FeatureIntroStore.advance(to: .featureIntro)
                    env.onboardingStep = .featureIntro
                case .failure(let error):
                    showSaveError = true
                    print("❌ 프로필 저장 실패: \(error)")
                }
            }
        }
    }
}
