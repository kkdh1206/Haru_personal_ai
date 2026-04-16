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

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Step 1/3")
                .font(.headline)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .foregroundColor(.blue)
            Spacer()
            Text("이름을 알려주세요")
                .font(.title)
                .fontWeight(.bold)
            TextField("뭐라고 불러드릴까요?", text: $name)
                .padding()
                .background(Color.gray.opacity(0.1))
                .foregroundColor(.white)
                .cornerRadius(16)
                .frame(maxWidth: .infinity)
            Spacer()
            Button("다음") {
                if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                      return
                  }
                  env.user?.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
                  env.onboardingStep = .requestLocation
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }.padding()
    }
}
