import AVFoundation
import FirebaseAuth
import SwiftUI

enum FeatureIntroStore {
    private static let completedKey = "haru.feature-intro.completed"

    static func shouldShow(for _: UserInfo) -> Bool {
        !UserDefaults.standard.bool(forKey: completedKeyForCurrentUser())
    }

    static func markCompleted() {
        UserDefaults.standard.set(true, forKey: completedKeyForCurrentUser())
    }

    static func resetForCurrentUser() {
        UserDefaults.standard.removeObject(forKey: completedKeyForCurrentUser())
    }

    static func reset(forUserID uid: String) {
        UserDefaults.standard.removeObject(forKey: completedKey(forUserID: uid))
    }

    private static func completedKeyForCurrentUser() -> String {
        guard let uid = Auth.auth().currentUser?.uid, !uid.isEmpty else {
            return completedKey
        }

        return completedKey(forUserID: uid)
    }

    private static func completedKey(forUserID uid: String) -> String {
        "\(completedKey).\(uid)"
    }
}

struct FeatureIntroView: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var microphonePermission = AVAudioSession.sharedInstance().recordPermission
    @State private var isRequestingMicrophone = false

    private let items: [FeatureIntroItem] = [
        FeatureIntroItem(
            iconName: "globe",
            title: "앱 언어를 바꿀 수 있어요",
            description: "설정에서 한국어, 영어, 일본어로 화면 언어를 선택할 수 있어요."
        ),
        FeatureIntroItem(
            iconName: "waveform",
            title: "목소리와 캐릭터를 고를 수 있어요",
            description: "기상 전화에 어울리는 목소리와 캐릭터를 설정할 수 있어요."
        ),
        FeatureIntroItem(
            iconName: "moon.zzz.fill",
            title: "방해금지 모드에서는 전화가 안 올 수 있어요",
            description: "알람 시간 전 집중 모드와 방해금지 설정을 확인해 주세요."
        ),
        FeatureIntroItem(
            iconName: "wifi.slash",
            secondaryIconName: "alarm.fill",
            title: "인터넷이 안 되면 기본 알람이 울려요",
            description: "전화 연결이 어려운 상황에서는 일반 iPhone 알람으로 깨워드려요."
        ),
    ]

    private var primaryButtonTitle: String {
        if isRequestingMicrophone {
            return "권한 확인 중..."
        }

        switch microphonePermission {
        case .granted:
            return "시작하기"
        case .denied:
            return "계속하기"
        case .undetermined:
            return "마이크 권한 허용하고 시작하기"
        @unknown default:
            return "시작하기"
        }
    }

    var body: some View {
        ZStack {
            fixedBackground

            GeometryReader { proxy in
                VStack(alignment: .leading, spacing: 0) {
                    Spacer(minLength: 28)

                    VStack(alignment: .leading, spacing: 10) {
                        Text("시작하기 전에")
                            .font(.system(.largeTitle, design: .rounded).weight(.bold))
                            .foregroundStyle(Color.black.opacity(0.92))

                        Text("Haru가 안정적으로 아침 전화를 드릴 수 있도록 몇 가지만 알려드릴게요.")
                            .font(.system(.subheadline, design: .rounded).weight(.medium))
                            .foregroundStyle(Color.black.opacity(0.62))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.top, proxy.safeAreaInsets.top + 44)

                    Spacer(minLength: 24)

                    VStack(spacing: 12) {
                        ForEach(items) { item in
                            FeatureIntroCard(item: item)
                        }
                    }

                    Spacer(minLength: 24)

                    if microphonePermission == .denied {
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "mic.slash.fill")
                                .font(.system(size: 14, weight: .semibold))
                            Text("마이크 권한은 통화 전에 설정에서 다시 허용할 수 있어요.")
                                .font(.system(.footnote, design: .rounded).weight(.semibold))
                        }
                        .foregroundStyle(Color.black.opacity(0.58))
                        .padding(.bottom, 12)
                    }

                    Button {
                        handleStart()
                    } label: {
                        Text(LocalizedStringKey(primaryButtonTitle))
                    }
                    .disabled(isRequestingMicrophone)
                    .buttonStyle(PrimaryButtonStyle())
                    .padding(.bottom, proxy.safeAreaInsets.bottom + 44)
                }
                .padding(.horizontal, 22)
                .frame(width: proxy.size.width, height: proxy.size.height)
            }
        }
        .onAppear {
            microphonePermission = AVAudioSession.sharedInstance().recordPermission
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

    private func handleStart() {
        switch microphonePermission {
        case .undetermined:
            isRequestingMicrophone = true
            AVAudioSession.sharedInstance().requestRecordPermission { _ in
                DispatchQueue.main.async {
                    microphonePermission = AVAudioSession.sharedInstance().recordPermission
                    isRequestingMicrophone = false
                    completeIntro()
                }
            }
        default:
            completeIntro()
        }
    }

    private func completeIntro() {
        FeatureIntroStore.markCompleted()
        env.onboardingStep = .completed
    }
}

private struct FeatureIntroItem: Identifiable {
    let id = UUID()
    let iconName: String
    var secondaryIconName: String? = nil
    let title: String
    let description: String
}

private struct FeatureIntroCard: View {
    let item: FeatureIntroItem

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack(alignment: .bottomTrailing) {
                Image(systemName: item.iconName)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(Color(red: 0.47, green: 0.61, blue: 0.92))
                    .frame(width: 42, height: 42)
                    .background(
                        Circle()
                            .fill(Color.white.opacity(0.82))
                    )

                if let secondaryIconName = item.secondaryIconName {
                    Image(systemName: secondaryIconName)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 20, height: 20)
                        .background(
                            Circle()
                                .fill(Color(red: 0.47, green: 0.61, blue: 0.92))
                        )
                        .offset(x: 4, y: 4)
                }
            }

            VStack(alignment: .leading, spacing: 5) {
                Text(LocalizedStringKey(item.title))
                    .font(.system(.body, design: .rounded).weight(.semibold))
                    .foregroundStyle(Color.black.opacity(0.88))
                    .fixedSize(horizontal: false, vertical: true)

                Text(LocalizedStringKey(item.description))
                    .font(.system(.footnote, design: .rounded).weight(.medium))
                    .foregroundStyle(Color.black.opacity(0.58))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(Color.white.opacity(0.86))
                .overlay(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .stroke(Color.white.opacity(0.70), lineWidth: 1)
                )
        )
    }
}
