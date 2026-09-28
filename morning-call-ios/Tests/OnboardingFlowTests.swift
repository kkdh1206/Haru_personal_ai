@main
struct OnboardingFlowTests {
    static func main() {
        let expected: [OnboardingStep] = [.featureIntro, .enterName, .alarmSetup, .requestLocation, .calendarIntro, .testCallSetup]
        precondition(OnboardingStep.steps == expected)
        for (index, step) in expected.enumerated() {
            precondition(step.number == index + 1)
            precondition(step.next == (index + 1 < expected.count ? expected[index + 1] : .completed))
        }
        precondition(OnboardingStep.resume(saved: nil, hasName: false, completed: false) == .featureIntro)
        precondition(OnboardingStep.resume(saved: .enterName, hasName: false, completed: false) == .enterName)
        precondition(OnboardingStep.resume(saved: .alarmSetup, hasName: false, completed: false) == .featureIntro)
        for step in expected {
            precondition(OnboardingStep.resume(saved: step, hasName: true, completed: false) == step)
            precondition(OnboardingStep.resume(saved: step, hasName: true, completed: true) == .completed)
        }
        precondition(OnboardingStep.resume(saved: .loading, hasName: true, completed: false) == .featureIntro)
        precondition(OnboardingStep.migrateLegacy(.requestLocation) == .alarmSetup)
        precondition(OnboardingStep.migrateLegacy(.alarmSetup) == .alarmSetup)
        precondition(OnboardingStep.migrateLegacy(.enterName) == .featureIntro)
        precondition(OnboardingStep.migrateLegacy(.calendarIntro) == .calendarIntro)
        precondition(OnboardingStep.migrateLegacy(.testCallSetup) == .testCallSetup)
        precondition(OnboardingStep.migrateLegacy(nil) == .featureIntro)
        print("PASS ordered steps and consistent progress numbers")
        print("PASS language-first entry, name resume, and completed-user handling")
        print("PASS legacy progress migration preserves alarm setup")
    }
}
