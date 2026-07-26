//
//  AppEnvironment.swift
//  morningcall
//
//  Created by 박원빈 on 7/5/25.
//

import Foundation

class AppEnvironment: ObservableObject {
    @Published var user: User?
    @Published var onboardingStep: OnboardingStep = .loading
    @Published var appLanguage: AppLanguage = AppLanguageStore.current

    func updateAppLanguage(_ language: AppLanguage) {
        guard appLanguage != language else { return }
        AppLanguageStore.current = language
        appLanguage = language
    }
}

enum OnboardingStep: String {
    case loading
    case featureIntro
    case enterName
    case requestLocation
    case alarmSetup
    case calendarIntro
    case testCallSetup
    case completed
}
