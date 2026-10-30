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
        precondition(OnboardingStep.resume(saved: .alarmSetup, hasName: false, completed: false) == .alarmSetup)
        for step in expected {
            precondition(OnboardingStep.resume(saved: step, hasName: true, completed: false) == (step == .enterName ? .alarmSetup : step))
            precondition(OnboardingStep.resume(saved: step, hasName: true, completed: true) == .completed)
            precondition(OnboardingStep.resume(saved: step, hasName: false, completed: true, isAppleSignIn: true) == .completed)
            // A returning Apple user may receive neither name nor email from
            // AuthenticationServices. No saved step may force name re-entry.
            precondition(OnboardingStep.resume(saved: step, hasName: false, completed: false, isAppleSignIn: true) == (step == .enterName ? .alarmSetup : step))
        }
        let appleSteps: [OnboardingStep] = [.featureIntro, .alarmSetup, .requestLocation, .calendarIntro, .testCallSetup]
        precondition(OnboardingStep.steps(skippingName: true) == appleSteps)
        precondition(OnboardingStep.steps(skippingName: false) == expected)
        for (index, step) in appleSteps.enumerated() {
            precondition(step.next(skippingName: true) == (index + 1 < appleSteps.count ? appleSteps[index + 1] : .completed))
        }
        precondition(OnboardingStep.resume(saved: nil, hasName: false, completed: false, isAppleSignIn: true) == .featureIntro)
        // Declining location continues to calendar setup, including after restart.
        precondition(OnboardingStep.requestLocation.next(skippingName: true) == .calendarIntro)
        precondition(OnboardingStep.resume(saved: .calendarIntro, hasName: false, completed: false, isAppleSignIn: true) == .calendarIntro)
        precondition(OnboardingStep.resume(saved: .loading, hasName: true, completed: false) == .featureIntro)
        precondition(OnboardingStep.migrateLegacy(.requestLocation) == .alarmSetup)
        precondition(OnboardingStep.migrateLegacy(.alarmSetup) == .alarmSetup)
        precondition(OnboardingStep.migrateLegacy(.enterName) == .featureIntro)
        precondition(OnboardingStep.migrateLegacy(.calendarIntro) == .calendarIntro)
        precondition(OnboardingStep.migrateLegacy(.testCallSetup) == .testCallSetup)
        precondition(OnboardingStep.migrateLegacy(nil) == .featureIntro)
        print("PASS ordered steps and consistent progress numbers")
        print("PASS Apple first sign-in, missing-name re-login, and legacy name-step resume")
        print("PASS optional names, location-denied continuation, and completed-user handling")
        print("PASS legacy progress migration preserves alarm setup")
    }
}
