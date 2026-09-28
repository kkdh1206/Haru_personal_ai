import FirebaseAuth
import SwiftUI

enum FeatureIntroStore {
    private static let completedKey = "haru.onboarding.completed.v2"
    private static let currentStepKey = "haru.onboarding.current-step.v3"
    private static let legacyStepKey = "haru.onboarding.current-step.v2"
    private static let testCallScheduledAtKey = "haru.onboarding.test-call-scheduled-at.v2"
    private static let testCallJobIDKey = "haru.onboarding.test-call-job-id.v2"
    private static let testCallRoomNameKey = "haru.onboarding.test-call-room-name.v2"
    private static let testCallCompletedKey = "haru.onboarding.test-call-completed.v2"

    static func shouldShow(for _: UserInfo) -> Bool {
        !UserDefaults.standard.bool(forKey: completedKeyForCurrentUser())
    }

    static func currentStep() -> OnboardingStep {
        if UserDefaults.standard.string(forKey: currentStepKeyForCurrentUser()) == nil {
            let legacy = UserDefaults.standard.string(forKey: legacyStepKeyForCurrentUser())
                .flatMap(OnboardingStep.init(rawValue:))
            return OnboardingStep.migrateLegacy(legacy)
        }
        guard
            let rawValue = UserDefaults.standard.string(forKey: currentStepKeyForCurrentUser()),
            let step = OnboardingStep(rawValue: rawValue),
            step != .completed,
            step != .loading
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
        UserDefaults.standard.removeObject(forKey: legacyStepKeyForCurrentUser())
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
        UserDefaults.standard.removeObject(forKey: legacyStepKeyForCurrentUser())
        UserDefaults.standard.removeObject(forKey: testCallScheduledAtKeyForCurrentUser())
        UserDefaults.standard.removeObject(forKey: testCallJobIDKeyForCurrentUser())
        UserDefaults.standard.removeObject(forKey: testCallRoomNameKeyForCurrentUser())
        UserDefaults.standard.removeObject(forKey: testCallCompletedKeyForCurrentUser())
    }

    static func reset(forUserID uid: String) {
        UserDefaults.standard.removeObject(forKey: completedKey(forUserID: uid))
        UserDefaults.standard.removeObject(forKey: currentStepKey(forUserID: uid))
        UserDefaults.standard.removeObject(forKey: "\(legacyStepKey).\(uid)")
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

    private static func legacyStepKeyForCurrentUser() -> String {
        guard let uid = Auth.auth().currentUser?.uid, !uid.isEmpty else { return legacyStepKey }
        return "\(legacyStepKey).\(uid)"
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

// Language is selected locally before any profile data is required.
// EnterNameView persists both the name and chosen call language together.
struct FeatureIntroView: View {
    @EnvironmentObject private var env: AppEnvironment

    var body: some View {
        OnboardingLayout(step: .featureIntro) {
            OnboardingHeading(
                title: "어떤 언어로 시작할까요?",
                subtitle: "앱과 모닝콜에 사용할 언어를 골라 주세요. 나중에 설정에서 각각 바꿀 수 있어요."
            )

            VStack(spacing: 12) {
                ForEach(AppLanguage.allCases) { language in
                    Button {
                        env.updateAppLanguage(language)
                    } label: {
                        HStack(spacing: 12) {
                            Text(language.nativeLabel)
                                .font(.body.weight(.semibold))
                            Spacer(minLength: 12)
                            Image(systemName: env.appLanguage == language ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 22, weight: .medium))
                                .foregroundStyle(HaruStyle.ink.opacity(env.appLanguage == language ? 1 : 0.25))
                        }
                        .foregroundStyle(HaruStyle.ink)
                        .padding(18)
                        .frame(maxWidth: .infinity, minHeight: 64)
                        .background(.white.opacity(0.86), in: RoundedRectangle(cornerRadius: HaruStyle.cardRadius))
                        .overlay {
                            RoundedRectangle(cornerRadius: HaruStyle.cardRadius)
                                .strokeBorder(HaruStyle.ink.opacity(env.appLanguage == language ? 0.8 : 0), lineWidth: 1.5)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(env.appLanguage == language ? .isSelected : [])
                }
            }
        } actions: {
            Button("다음") {
                env.advanceOnboarding(from: .featureIntro)
            }
            .buttonStyle(PrimaryButtonStyle())
        }
    }
}
