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

    var body: some View {
        ZStack {
            fixedBackground

            GeometryReader { proxy in
                VStack(alignment: .leading, spacing: 0) {
                    Text("1 / 2")
                        .font(.system(.headline, design: .rounded).weight(.semibold))
                        .foregroundStyle(Color.black.opacity(0.56))
                        .frame(maxWidth: .infinity, alignment: .trailing)

                    Spacer(minLength: 0)

                    VStack(alignment: .leading, spacing: 18) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("뭐라고 불러드릴까요?")
                                .font(.system(.title, design: .rounded).weight(.bold))
                                .foregroundStyle(Color.black.opacity(0.92))

                            Text("첫 대화부터 자연스럽게 이름을 불러드릴게요.")
                                .font(.system(.subheadline, design: .rounded))
                                .foregroundStyle(Color.black.opacity(0.58))
                        }

                        TextField("예: 원빈", text: $name)
                            .textInputAutocapitalization(.never)
                            .padding(16)
                            .background(Color.white.opacity(0.88), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .foregroundStyle(Color.black.opacity(0.90))
                            .submitLabel(.next)
                            .onSubmit(goNext)

                        if showNameError {
                            Text("이름을 입력해야 다음으로 넘어갈 수 있어요.")
                                .font(.system(.footnote, design: .rounded).weight(.semibold))
                                .foregroundStyle(Color.red.opacity(0.82))
                        }
                    }
                    .padding(.bottom, 116)
                }
                .padding(.horizontal, 22)
                .padding(.top, proxy.safeAreaInsets.top + 28)
                .frame(width: proxy.size.width, height: proxy.size.height)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Button("다음") {
                goNext()
            }
            .buttonStyle(PrimaryButtonStyle())
            .padding(.horizontal, 22)
            .padding(.top, 10)
            .padding(.bottom, 30)
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
        env.user?.name = trimmed
        env.onboardingStep = .requestLocation
    }
}
