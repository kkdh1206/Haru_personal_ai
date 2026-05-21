import SwiftUI

struct LiveKitInfo: Codable {
    var lkToken: String
    var lkUrl: String
}

struct TestCallView: View {
    @Environment(\.dismiss) var dismiss
    @State private var wakeIntensity = "gentle"

    var body: some View {
        NavigationView {
            List {
                Section("하루") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("친구처럼 챙겨주는 Haru")
                            .font(.headline)
                        Text("테스트 통화에서도 Haru가 먼저 인사하고 깨워요.")
                            .font(.subheadline)
                            .foregroundColor(.gray)
                    }
                    .padding(.vertical, 4)
                }

                NavigationLink {
                    WakeIntensityView(selectedIntensity: $wakeIntensity)
                } label: {
                    HStack {
                        Text("깨우기 강도")
                        Spacer()
                        Text(wakeIntensity == "firm" ? "강하게" : "다정하게")
                            .foregroundColor(.gray)
                    }
                }

                Section {
                    Button {
                        testCall()
                        dismiss()
                    } label: {
                        Text("전화 걸기")
                            .frame(maxWidth: .infinity, alignment: .center)
                    }
                }
            }
            .navigationTitle("테스트 전화")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func testCall() {
        let character = CharacterPreferenceStore.current
        APIClient.request(path: "/alarm/test-call", method: .POST, body: [
            "wakeIntensity": wakeIntensity,
            "voice": character.voiceName,
            "role": character.roleName
        ]) { (result: Result<LiveKitInfo, Error>) in
            DispatchQueue.main.async {
                switch result {
                case .success(let updated):
                    print("방 생성 성공: \(updated)")
                    CallManager.shared.prepareIncoming(url: updated.lkUrl, token: updated.lkToken, alarmId: "-")
                    CallManager.shared.startOutgoing(handle: character.roleName)
                case .failure(let error):
                    print("방 생성 실패: \(error)")
                }
            }
        }
    }
}
