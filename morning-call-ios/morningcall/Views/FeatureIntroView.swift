import AVFoundation
import FirebaseAuth
import SwiftUI

enum FeatureIntroStore {
    private static let completedKey = "haru.onboarding.completed.v2"
    private static let currentStepKey = "haru.onboarding.current-step.v2"
    private static let testCallScheduledAtKey = "haru.onboarding.test-call-scheduled-at.v2"
    private static let testCallJobIDKey = "haru.onboarding.test-call-job-id.v2"
    private static let testCallRoomNameKey = "haru.onboarding.test-call-room-name.v2"
    private static let testCallCompletedKey = "haru.onboarding.test-call-completed.v2"

    static func shouldShow(for _: UserInfo) -> Bool {
        !UserDefaults.standard.bool(forKey: completedKeyForCurrentUser())
    }

    static func currentStep() -> OnboardingStep {
        guard
            let rawValue = UserDefaults.standard.string(forKey: currentStepKeyForCurrentUser()),
            let step = OnboardingStep(rawValue: rawValue),
            step != .completed,
            step != .loading,
            step != .enterName
        else {
            return .featureIntro
        }

        return step
    }

    static func advance(to step: OnboardingStep) {
        UserDefaults.standard.set(step.rawValue, forKey: currentStepKeyForCurrentUser())
    }

    static func markCompleted() {
        UserDefaults.standard.set(true, forKey: completedKeyForCurrentUser())
        UserDefaults.standard.removeObject(forKey: currentStepKeyForCurrentUser())
        UserDefaults.standard.removeObject(forKey: testCallScheduledAtKeyForCurrentUser())
        UserDefaults.standard.removeObject(forKey: testCallJobIDKeyForCurrentUser())
        UserDefaults.standard.removeObject(forKey: testCallRoomNameKeyForCurrentUser())
        UserDefaults.standard.removeObject(forKey: testCallCompletedKeyForCurrentUser())
    }

    static var testCallScheduledAt: Date? {
        get {
            UserDefaults.standard.object(forKey: testCallScheduledAtKeyForCurrentUser()) as? Date
        }
        set {
            if let newValue {
                UserDefaults.standard.set(newValue, forKey: testCallScheduledAtKeyForCurrentUser())
            } else {
                UserDefaults.standard.removeObject(forKey: testCallScheduledAtKeyForCurrentUser())
            }
        }
    }

    static var testCallJobID: String? {
        get {
            UserDefaults.standard.string(forKey: testCallJobIDKeyForCurrentUser())
        }
        set {
            UserDefaults.standard.set(newValue, forKey: testCallJobIDKeyForCurrentUser())
        }
    }

    static var testCallRoomName: String? {
        get {
            UserDefaults.standard.string(forKey: testCallRoomNameKeyForCurrentUser())
        }
        set {
            UserDefaults.standard.set(newValue, forKey: testCallRoomNameKeyForCurrentUser())
        }
    }

    static var testCallCompleted: Bool {
        UserDefaults.standard.bool(forKey: testCallCompletedKeyForCurrentUser())
    }

    static func markTestCallCompleted() {
        UserDefaults.standard.set(true, forKey: testCallCompletedKeyForCurrentUser())
    }

    static func clearTestCallCompleted() {
        UserDefaults.standard.removeObject(forKey: testCallCompletedKeyForCurrentUser())
    }

    static func resetForCurrentUser() {
        UserDefaults.standard.removeObject(forKey: completedKeyForCurrentUser())
        UserDefaults.standard.removeObject(forKey: currentStepKeyForCurrentUser())
        UserDefaults.standard.removeObject(forKey: testCallScheduledAtKeyForCurrentUser())
        UserDefaults.standard.removeObject(forKey: testCallJobIDKeyForCurrentUser())
        UserDefaults.standard.removeObject(forKey: testCallRoomNameKeyForCurrentUser())
        UserDefaults.standard.removeObject(forKey: testCallCompletedKeyForCurrentUser())
    }

    static func reset(forUserID uid: String) {
        UserDefaults.standard.removeObject(forKey: completedKey(forUserID: uid))
        UserDefaults.standard.removeObject(forKey: currentStepKey(forUserID: uid))
        UserDefaults.standard.removeObject(forKey: testCallScheduledAtKey(forUserID: uid))
        UserDefaults.standard.removeObject(forKey: testCallJobIDKey(forUserID: uid))
        UserDefaults.standard.removeObject(forKey: testCallRoomNameKey(forUserID: uid))
        UserDefaults.standard.removeObject(forKey: testCallCompletedKey(forUserID: uid))
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

    private static func currentStepKeyForCurrentUser() -> String {
        guard let uid = Auth.auth().currentUser?.uid, !uid.isEmpty else {
            return currentStepKey
        }

        return currentStepKey(forUserID: uid)
    }

    private static func currentStepKey(forUserID uid: String) -> String {
        "\(currentStepKey).\(uid)"
    }

    private static func testCallScheduledAtKeyForCurrentUser() -> String {
        guard let uid = Auth.auth().currentUser?.uid, !uid.isEmpty else {
            return testCallScheduledAtKey
        }

        return testCallScheduledAtKey(forUserID: uid)
    }

    private static func testCallScheduledAtKey(forUserID uid: String) -> String {
        "\(testCallScheduledAtKey).\(uid)"
    }

    private static func testCallJobIDKeyForCurrentUser() -> String {
        guard let uid = Auth.auth().currentUser?.uid, !uid.isEmpty else {
            return testCallJobIDKey
        }

        return testCallJobIDKey(forUserID: uid)
    }

    private static func testCallJobIDKey(forUserID uid: String) -> String {
        "\(testCallJobIDKey).\(uid)"
    }

    private static func testCallRoomNameKeyForCurrentUser() -> String {
        guard let uid = Auth.auth().currentUser?.uid, !uid.isEmpty else {
            return testCallRoomNameKey
        }

        return testCallRoomNameKey(forUserID: uid)
    }

    private static func testCallRoomNameKey(forUserID uid: String) -> String {
        "\(testCallRoomNameKey).\(uid)"
    }

    private static func testCallCompletedKeyForCurrentUser() -> String {
        guard let uid = Auth.auth().currentUser?.uid, !uid.isEmpty else {
            return testCallCompletedKey
        }

        return testCallCompletedKey(forUserID: uid)
    }

    private static func testCallCompletedKey(forUserID uid: String) -> String {
        "\(testCallCompletedKey).\(uid)"
    }
}

struct FeatureIntroView: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var microphonePermission = AVAudioApplication.shared.recordPermission
    @State private var isRequestingMicrophone = false
    @State private var selectedLanguage = AppLanguageStore.current
    @State private var isSavingLanguage = false
    @State private var showLanguageSaveError = false

    private let items: [FeatureIntroItem] = [
        FeatureIntroItem(
            iconName: "globe",
            title: "앱 언어를 바꿀 수 있어요",
            description: "설정에서 한국어, 영어, 일본어로 화면 언어를 선택할 수 있어요."
        ),
        FeatureIntroItem(
            iconName: "waveform",
            title: "하리가 아침마다 전화해요",
            description: "밝고 명랑한 하리가 기상 전화를 걸어 깨워드려요."
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
        if isSavingLanguage {
            return "저장 중..."
        }

        switch microphonePermission {
        case .granted:
            return "알람 설정하기"
        case .denied:
            return "계속하기"
        case .undetermined:
            return "마이크 권한 허용하고 알람 설정하기"
        @unknown default:
            return "알람 설정하기"
        }
    }

    var body: some View {
        ZStack {
            fixedBackground

            GeometryReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("시작하기 전에")
                                .font(.system(.largeTitle, design: .rounded).weight(.bold))
                                .foregroundStyle(Color.black.opacity(0.92))

                            Text("Haru가 안정적으로 아침 전화를 드릴 수 있도록 몇 가지만 알려드릴게요.")
                                .font(.system(.subheadline, design: .rounded).weight(.medium))
                                .foregroundStyle(Color.black.opacity(0.62))
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        VStack(alignment: .leading, spacing: 12) {
                            Label("앱과 통화 언어", systemImage: "translate")
                                .font(.system(.headline, design: .rounded).weight(.semibold))
                                .foregroundStyle(Color.black.opacity(0.82))

                            Text("선택한 언어가 앱 화면과 모닝콜에 함께 적용돼요.")
                                .font(.system(.footnote, design: .rounded).weight(.medium))
                                .foregroundStyle(Color.black.opacity(0.58))
                                .fixedSize(horizontal: false, vertical: true)

                            Picker("앱과 통화 언어", selection: $selectedLanguage) {
                                ForEach(AppLanguage.allCases) { language in
                                    Text(language.nativeLabel)
                                        .tag(language)
                                }
                            }
                            .pickerStyle(.segmented)
                        }
                        .padding(16)
                        .background(Color.white.opacity(0.86), in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                        VStack(spacing: 12) {
                            ForEach(items) { item in
                                FeatureIntroCard(item: item)
                            }
                        }

                        if microphonePermission == .denied {
                            HStack(alignment: .top, spacing: 8) {
                                Image(systemName: "mic.slash.fill")
                                    .font(.system(size: 14, weight: .semibold))
                                Text("마이크 권한은 통화 전에 설정에서 다시 허용할 수 있어요.")
                                    .font(.system(.footnote, design: .rounded).weight(.semibold))
                            }
                            .foregroundStyle(Color.black.opacity(0.58))
                        }

                        if showLanguageSaveError {
                            Text("언어 설정을 저장하지 못했어요. 다시 시도해 주세요.")
                                .font(.system(.footnote, design: .rounded).weight(.semibold))
                                .foregroundStyle(Color.red.opacity(0.82))
                                .frame(maxWidth: .infinity, alignment: .center)
                        }

                        Button {
                            handleStart()
                        } label: {
                            Text(LocalizedStringKey(primaryButtonTitle))
                        }
                        .disabled(isRequestingMicrophone || isSavingLanguage)
                        .buttonStyle(PrimaryButtonStyle())
                    }
                    .padding(.horizontal, 22)
                    .padding(.top, proxy.safeAreaInsets.top + 44)
                    .padding(.bottom, proxy.safeAreaInsets.bottom + 44)
                    .frame(minHeight: proxy.size.height, alignment: .top)
                }
                .scrollIndicators(.hidden)
            }
        }
        .onAppear {
            microphonePermission = AVAudioApplication.shared.recordPermission
            selectedLanguage = env.appLanguage
        }
        .onChange(of: selectedLanguage) { _, language in
            env.updateAppLanguage(language)
            showLanguageSaveError = false
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
            AVAudioApplication.requestRecordPermission { _ in
                DispatchQueue.main.async {
                    microphonePermission = AVAudioApplication.shared.recordPermission
                    isRequestingMicrophone = false
                    completeIntro()
                }
            }
        default:
            completeIntro()
        }
    }

    private func completeIntro() {
        guard !isSavingLanguage else { return }
        guard let name = env.user?.name, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            showLanguageSaveError = true
            return
        }

        let callLanguage = selectedLanguage.callLanguageValue
        let speechStyle = SpeechStyle.value(
            forCallLanguage: callLanguage,
            preserving: env.user?.speechStyle,
            currentLanguage: env.user?.language
        )

        isSavingLanguage = true
        showLanguageSaveError = false
        APIClient.request(path: "/user", method: .PUT, body: [
            "name": name,
            "location": env.user?.location ?? "",
            "language": callLanguage,
            "speechStyle": speechStyle
        ]) { (result: Result<UserInfo, Error>) in
            DispatchQueue.main.async {
                isSavingLanguage = false

                switch result {
                case .success(let user):
                    env.user?.language = user.language ?? callLanguage
                    env.user?.speechStyle = user.speechStyle ?? speechStyle
                    FeatureIntroStore.advance(to: .requestLocation)
                    env.onboardingStep = .requestLocation
                case .failure(let error):
                    showLanguageSaveError = true
                    print("❌ 온보딩 언어 설정 저장 실패: \(error)")
                }
            }
        }
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
