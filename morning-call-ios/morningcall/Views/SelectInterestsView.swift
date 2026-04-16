//
//  SelectInterestsView.swift
//  morningcall
//
//  Created by 박원빈 on 7/5/25.
//

import SwiftUI

struct SelectInterestsView: View {
    @EnvironmentObject var env: AppEnvironment
    @State private var selectedKey: String? = nil
    
    let options: [(label: String, key: String)] = [
        ("주요 뉴스", "korea-top"),
        ("세계", "world"),
        ("비즈니스", "business"),
        ("기술", "tech"),
        ("건강", "health"),
        ("엔터테인먼트", "entertainment"),
        ("스포츠", "sports"),
        ("정치", "politics")
    ]
    
    let columns = [
        GridItem(.flexible(), spacing: 16),
        GridItem(.flexible(), spacing: 16)
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Step 3/3")
                .font(.headline)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .foregroundColor(.blue)
            Spacer()
            Text("관심사를 선택해주세요")
                .font(.title)
                .fontWeight(.bold)
            LazyVGrid(columns: columns, spacing: 16) {
                ForEach(options, id: \.key) { option in
                    Button(action: {
                        selectedKey = (selectedKey == option.key) ? nil : option.key
                    }) {
                        HStack {
                            Text(option.label)
                            Spacer()
                            if selectedKey == option.key {
                                Image(systemName: "checkmark")
                            }
                        }
                        .padding()
                        .frame(maxWidth: .infinity, minHeight: 60) // 👈 박스 크기 균일화
                        .background(Color.gray.opacity(0.2))
                        .cornerRadius(16)
                    }
                    .buttonStyle(PlainButtonStyle())
                }
            }
            Spacer()
            Button("완료") {
                if let key = selectedKey {
                    env.user?.interest = key
                }
                signUp()
            }
            .buttonStyle(PrimaryButtonStyle())
            Button("건너뛰기") {
                signUp()
            }
            .buttonStyle(SecondaryButtonStyle())
        }
        .padding()
    }
    
    func signUp() {
        APIClient.request(path: "/user", method: .PUT, body: [
            "name": env.user!.name,
            "location": env.user!.location,
            "interest": env.user!.interest
        ]) { (result: Result<UserInfo, Error>) in
            DispatchQueue.main.async {
                switch result {
                case .success(let user):
                    env.onboardingStep = .completed
                case .failure(let error):
                    print("❌ 에러: \(error)")
                }
            }
        }
    }
}
