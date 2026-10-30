enum OnboardingStep: String {
    case loading
    // Keep the stored value for users resuming the old introduction screen.
    case featureIntro
    case enterName
    case alarmSetup
    case requestLocation
    case calendarIntro
    case testCallSetup
    case completed

    static let steps: [Self] = [
        .featureIntro, .enterName, .alarmSetup,
        .requestLocation, .calendarIntro, .testCallSetup,
    ]

    var number: Int { (Self.steps.firstIndex(of: self) ?? 0) + 1 }

    static func steps(skippingName: Bool) -> [Self] {
        steps.filter { !skippingName || $0 != .enterName }
    }

    var next: Self {
        guard let index = Self.steps.firstIndex(of: self), index + 1 < Self.steps.count else {
            return .completed
        }
        return Self.steps[index + 1]
    }

    func next(skippingName: Bool) -> Self {
        let candidate = next
        return skippingName && candidate == .enterName ? candidate.next : candidate
    }

    static func resume(saved: Self?, hasName: Bool, completed: Bool, isAppleSignIn: Bool = false) -> Self {
        if completed { return .completed }
        guard let saved, steps.contains(saved) else { return .featureIntro }
        if saved == .enterName && (hasName || isAppleSignIn) { return .alarmSetup }
        return saved
    }

    static func migrateLegacy(_ step: Self?) -> Self {
        guard let step else { return .featureIntro }
        switch step {
        case .requestLocation: return .alarmSetup
        case .enterName: return .featureIntro
        default: return steps.contains(step) ? step : .featureIntro
        }
    }
}
