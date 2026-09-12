import SwiftUI

struct LiveKitInfo: Codable {
    var lkToken: String
    var lkUrl: String
}

struct TestCallView: View {
    @Environment(\.dismiss) var dismiss
    @EnvironmentObject var env: AppEnvironment
    @State private var wakeIntensity = "gentle"

    var body: some View {
        NavigationView {
            List {
                Section(localized("하리")) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(localized("친구처럼 챙겨주는 Hari"))
                            .font(.headline)
                        Text(localized("테스트 통화에서도 Hari가 먼저 인사하고 깨워요."))
                            .font(.subheadline)
                            .foregroundColor(.gray)
                    }
                    .padding(.vertical, 4)
                }

                NavigationLink {
                    WakeIntensityView(selectedIntensity: $wakeIntensity)
                } label: {
                    HStack {
                        Text(localized("깨우기 강도"))
                        Spacer()
                        Text(wakeIntensityLabel)
                            .foregroundColor(.gray)
                    }
                }

                Section {
                    Button {
                        testCall()
                        dismiss()
                    } label: {
                        Text(localized("전화 걸기"))
                            .frame(maxWidth: .infinity, alignment: .center)
                    }
                }
            }
            .navigationTitle(localized("테스트 전화"))
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var wakeIntensityLabel: String {
        switch wakeIntensity {
        case "firm":
            return localized("강하게")
        default:
            return localized("다정하게")
        }
    }

    private func localized(_ key: String) -> String {
        AppLocalizer.string(key, language: env.appLanguage)
    }

    private func testCall() {
        let character = CharacterPreference.hari
        APIClient.request(path: "/alarm/test-call", method: .POST, body: [
            "wakeIntensity": wakeIntensity,
            "voice": character.voiceName,
            "role": character.roleName
        ]) { (result: Result<LiveKitInfo, Error>) in
            DispatchQueue.main.async {
                switch result {
                case .success(let updated):
                    print("방 생성 성공: \(updated)")
                    Task {
                        await CallManager.shared.prepareIncoming(
                            url: updated.lkUrl,
                            token: updated.lkToken,
                            alarmId: "-"
                        )
                        await CallManager.shared.startOutgoing(handle: character.roleName)
                    }
                case .failure(let error):
                    print("방 생성 실패: \(error)")
                }
            }
        }
    }
}
