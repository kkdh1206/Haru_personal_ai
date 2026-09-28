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

    var next: Self {
        guard let index = Self.steps.firstIndex(of: self), index + 1 < Self.steps.count else {
            return .completed
        }
        return Self.steps[index + 1]
    }

    static func resume(saved: Self?, hasName: Bool, completed: Bool) -> Self {
        guard hasName else { return saved == .enterName ? .enterName : .featureIntro }
        if completed { return .completed }
        guard let saved, steps.contains(saved) else { return .featureIntro }
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
