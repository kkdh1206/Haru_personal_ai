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
}

enum OnboardingStep {
    case loading
    case enterName
    case requestLocation
    case completed
}
