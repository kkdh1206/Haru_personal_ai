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
    @State private var showSaveError = false
    @State private var isSaving = false

    var body: some View {
        OnboardingLayout(step: .enterName) {
            VStack(alignment: .leading, spacing: 24) {
                OnboardingHeading(
                    title: "뭐라고 불러드릴까요?",
                    subtitle: "이름은 선택 사항이에요. 나중에 설정에서 바꿀 수 있어요."
                )

                TextField(text: $name) {
                    Text("이름을 입력해 주세요")
                }
                    .textContentType(.name)
                    .textInputAutocapitalization(.words)
                    .padding(16)
                    .background(Color.white.opacity(0.88), in: RoundedRectangle(cornerRadius: HaruStyle.cardRadius, style: .continuous))
                    .foregroundStyle(Color.black.opacity(0.90))
                    .submitLabel(.done)
                    .disabled(isSaving)
                    .onSubmit {
                        goNext()
                    }

                if showSaveError {
                    Text("프로필 저장에 실패했어요. 다시 시도해 주세요.")
                        .font(.system(.footnote).weight(.semibold))
                        .foregroundStyle(Color.red.opacity(0.82))
                }
            }
            .frame(maxWidth: .infinity)
        } actions: {
            Button {
                goNext()
            } label: {
                Text(LocalizedStringKey(isSaving ? "저장 중..." : "다음"))
            }
            .disabled(isSaving)
            .buttonStyle(PrimaryButtonStyle())
        }
        .onAppear {
            name = env.user?.name ?? ""
        }
        .preferredColorScheme(.light)
    }

    private func goNext() {
        guard !isSaving else { return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        showSaveError = false
        isSaving = true

        let language = env.appLanguage.callLanguageValue
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

                    env.advanceOnboarding(from: .enterName)
                case .failure(let error):
                    showSaveError = true
                    print("❌ 프로필 저장 실패: \(error)")
                }
            }
        }
    }
}
