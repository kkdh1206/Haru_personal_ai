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
    @Published var skipsNameOnboarding = false

    func updateAppLanguage(_ language: AppLanguage) {
        guard appLanguage != language else { return }
        AppLanguageStore.current = language
        appLanguage = language
    }

    func advanceOnboarding(from step: OnboardingStep) {
        let next = step.next(skippingName: skipsNameOnboarding)
        FeatureIntroStore.advance(to: next)
        onboardingStep = next
    }
}
