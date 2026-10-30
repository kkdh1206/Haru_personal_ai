//
//  SettingView.swift
//  morningcall
//
//  Created by 박원빈 on 9/5/25.
//

import SwiftUI
import FirebaseAuth
import UIKit

struct UserSettings: Codable {
    var name: String?
    var language: String
}

private struct CalendarConnectionStatus: Decodable {
    let connected: Bool
    let provider: String?
}

private struct DailyCallUsage: Decodable {
    let date: String
    let used: Int
    let limit: Int
    let remaining: Int
}

private struct AccountDeletionResponse: Decodable {
    let status: String
    let deleted: Bool
    let firebaseDeleted: Bool
}

struct SettingView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var googleHelper = GoogleSignInHelper()
    @EnvironmentObject var env: AppEnvironment
    @EnvironmentObject var subscriptionManager: SubscriptionManager
    @Environment(\.scenePhase) private var scenePhase

    @State private var userName: String = ""
    @State private var selectedAppLanguage: AppLanguage = AppLanguageStore.current
    @State private var selectedLanguage: String = "한국어"
    @State private var isCalendarConnected = false
    @State private var calendarProvider: CalendarProvider?
    @State private var isCalendarStatusLoading = false
    @State private var isCalendarDisconnecting = false
    @State private var isCalendarConnecting = false
    @State private var calendarConnectionErrorKey: String?
    @State private var showAppleCalendarPermissionAlert = false
    @State private var appleCalendarPermissionRestricted = false
    @State private var retryAppleCalendarAfterSettings = false
    @State private var dailyCallUsage: DailyCallUsage?
    @State private var isDailyCallUsageLoading = false
    @State private var showDeleteAccountAlert = false
    @State private var showDeleteAccountError = false
    @State private var isDeletingAccount = false

    private let languageOptions: [(code: String, label: String)] = [
        ("한국어", "한국어"),
        ("English", "영어"),
        ("日本語", "일본어")
    ]
    
    var body: some View {
        GeometryReader { proxy in
            ScrollView(.vertical) {
                VStack(alignment: .leading, spacing: 20) {
                    profileSection
                    subscriptionSection
                    appLanguageSection
                    callSection
                    dailyCallSection
                    calendarSection
                    legalSection
                    logoutSection
                }
                .frame(width: max(0, proxy.size.width - 40), alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.top, 20)
                .padding(.bottom, 36)
            }
            .frame(width: proxy.size.width)
            .scrollBounceBehavior(.basedOnSize, axes: .vertical)
        }
        .background(Color(red: 0.97, green: 0.96, blue: 0.93).ignoresSafeArea())
        .navigationTitle(localized("설정"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .tint(HaruStyle.ink)
        .symbolRenderingMode(.monochrome)
        .task(id: Auth.auth().currentUser?.uid) {
            loadInitialSettings()
            loadCalendarStatus()
            loadDailyCallUsage()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            if retryAppleCalendarAfterSettings,
               AppleCalendarService.shared.hasFullAccess {
                retryAppleCalendarAfterSettings = false
                connectCalendar(.apple)
            } else {
                loadCalendarStatus()
            }
            loadDailyCallUsage()
        }
        .alert(localized("Apple Calendar 권한이 필요해요"), isPresented: $showAppleCalendarPermissionAlert) {
            Button(localized("취소"), role: .cancel) {}
            Button(localized("설정 열기")) {
                retryAppleCalendarAfterSettings = true
                openCalendarSettings()
            }
        } message: {
            Text(
                localized(
                    appleCalendarPermissionRestricted
                    ? "이 기기에서는 캘린더 접근이 제한되어 있어요. 스크린 타임 또는 관리 설정을 확인해 주세요."
                    : "Apple Calendar를 연결하려면 설정에서 캘린더 전체 접근을 허용해 주세요."
                )
            )
        }
        .alert(localized("계정 탈퇴"), isPresented: $showDeleteAccountAlert) {
            Button(localized("취소"), role: .cancel) {}
            Button(localized("탈퇴"), role: .destructive) {
                deleteAccount()
            }
        } message: {
            Text(localized("계정과 알람이 삭제됩니다. 이 작업은 되돌릴 수 없어요."))
        }
        .alert(localized("계정 탈퇴 실패"), isPresented: $showDeleteAccountError) {
            Button(localized("완료"), role: .cancel) {}
        } message: {
            Text(localized("계정을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요."))
        }
        .preferredColorScheme(.light)
        .task {
            subscriptionManager.refresh()
        }
    }

    private var profileSection: some View {
        settingsCard(title: "프로필") {
            TextField(localized("이름"), text: $userName)
                .font(.system(.body).weight(.semibold))
                .foregroundStyle(.black)
                .textInputAutocapitalization(.never)
                .submitLabel(.done)
                .onSubmit { saveProfile() }
                .padding(18)
                .background(
                    RoundedRectangle(cornerRadius: HaruStyle.cardRadius, style: .continuous)
                        .fill(Color.white.opacity(0.78))
                )
        }
    }

    private var legalSection: some View {
        settingsCard(title: "약관 및 개인정보") {
            VStack(alignment: .leading, spacing: 16) {
                Link(localized("이용약관 (EULA)"), destination: LegalLinks.termsOfUse)
                Link(localized("서비스 이용약관"), destination: LegalLinks.serviceTerms)
                Link(localized("개인정보 처리방침"), destination: LegalLinks.privacyPolicy)
            }
            .font(.subheadline)
        }
    }

    private var subscriptionSection: some View {
        settingsCard(title: "구독") {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 14) {
                    Image(systemName: subscriptionManager.isActive ? "checkmark.seal.fill" : "sunrise.fill")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(Color(red: 0.95, green: 0.57, blue: 0.22))

                    VStack(alignment: .leading, spacing: 4) {
                        Text(localized(subscriptionManager.isTrial ? "무료 체험 이용 중" : subscriptionManager.isActive ? "하루 플러스 이용 중" : "하루 플러스"))
                            .font(.system(.body).weight(.semibold))
                        Text(localized(subscriptionManager.isActive ? "매일 AI 모닝콜을 이용할 수 있어요." : "신규 이용자는 3일 무료 체험을 이용할 수 있어요."))
                            .font(.system(.footnote))
                            .foregroundStyle(Color.black.opacity(0.58))
                    }

                    Spacer()
                }

                Button {
                    if subscriptionManager.isActive {
                        subscriptionManager.openSubscriptionManagement()
                    } else {
                        subscriptionManager.showPaywall = true
                    }
                } label: {
                    Text(localized(subscriptionManager.isActive ? "구독 관리" : "구독 시작하기"))
                        .font(.system(.body).weight(.semibold))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .foregroundStyle(subscriptionManager.isActive ? Color.black : Color.white)
                .background(
                    RoundedRectangle(cornerRadius: HaruStyle.cardRadius)
                        .fill(subscriptionManager.isActive ? Color.white.opacity(0.82) : Color.black.opacity(0.9))
                )
            }
            .padding(18)
            .background(
                RoundedRectangle(cornerRadius: HaruStyle.cardRadius, style: .continuous)
                    .fill(Color.white.opacity(0.78))
            )
        }
    }

    private var callSection: some View {
        settingsCard(title: "통화 시 언어") {
            HStack(spacing: 12) {
                Image(systemName: "globe")
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(HaruStyle.ink)

                Text(localized("선택 언어"))
                    .font(.system(.body).weight(.semibold))
                    .foregroundStyle(.black)

                Spacer()

                Picker(localized("언어"), selection: $selectedLanguage) {
                    ForEach(languageOptions, id: \.code) { lang in
                        Text(localized(lang.label))
                            .tag(lang.code)
                    }
                }
                .pickerStyle(.menu)
                .labelsHidden()
                .tint(.black)
            }
            .padding(18)
            .background(
                RoundedRectangle(cornerRadius: HaruStyle.cardRadius, style: .continuous)
                    .fill(Color.white.opacity(0.78))
            )
            .onChange(of: selectedLanguage) { _ in
                saveProfile()
            }
        }
    }

    private var appLanguageSection: some View {
        settingsCard(title: "앱 내부 언어") {
            HStack(spacing: 12) {
                Image(systemName: "translate")
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(HaruStyle.ink)

                Text(localized("화면 표시 언어"))
                    .font(.system(.body).weight(.semibold))
                    .foregroundStyle(.black)

                Spacer()

                Picker(localized("언어"), selection: $selectedAppLanguage) {
                    ForEach(AppLanguage.allCases) { language in
                        Text(language.nativeLabel)
                            .tag(language)
                    }
                }
                .pickerStyle(.menu)
                .labelsHidden()
                .tint(.black)
            }
            .padding(18)
            .background(
                RoundedRectangle(cornerRadius: HaruStyle.cardRadius, style: .continuous)
                    .fill(Color.white.opacity(0.78))
            )
            .onChange(of: selectedAppLanguage) { language in
                env.updateAppLanguage(language)
            }
        }
    }

    private var dailyCallSection: some View {
        settingsCard(title: "오늘의 모닝콜") {
            HStack(spacing: 14) {
                Image(systemName: "phone.badge.clock.fill")
                    .font(.system(size: 21, weight: .semibold))
                    .foregroundStyle(HaruStyle.ink)

                VStack(alignment: .leading, spacing: 4) {
                    Text(localized("남은 전화 횟수"))
                        .font(.system(.body).weight(.semibold))
                        .foregroundStyle(.black)
                    Text(localized("일반 모닝콜과 재통화를 합쳐 하루 최대 3회예요."))
                        .font(.system(.footnote))
                        .foregroundStyle(Color.black.opacity(0.58))
                }

                Spacer()

                if isDailyCallUsageLoading {
                    ProgressView()
                        .tint(.black)
                } else {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(dailyCallUsage.map { "\($0.remaining) / \($0.limit)" } ?? "--")
                            .font(.system(.title3).weight(.bold))
                            .foregroundStyle(.black)
                        Text(localized("회 남음"))
                            .font(.system(.caption).weight(.semibold))
                            .foregroundStyle(Color.black.opacity(0.52))
                    }
                }
            }
            .padding(18)
            .background(
                RoundedRectangle(cornerRadius: HaruStyle.cardRadius, style: .continuous)
                    .fill(Color.white.opacity(0.78))
            )
        }
    }

    private var calendarSection: some View {
        settingsCard(title: "캘린더") {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    Image(systemName: isCalendarConnected ? "calendar.badge.checkmark" : "calendar.badge.exclamationmark")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(HaruStyle.ink)

                    VStack(alignment: .leading, spacing: 4) {
                        Text(localized(isCalendarConnected ? "연동됨" : "연동 안 됨"))
                            .font(.system(.body).weight(.semibold))
                            .foregroundStyle(.black)
                        Text(
                            isCalendarConnected
                            ? String(format: localized("%@가 연결되어 있어요."), calendarProvider?.displayName ?? localized("캘린더"))
                            : localized("일정 추가를 사용하려면 캘린더를 연결해 주세요.")
                        )
                            .font(.system(.footnote))
                            .foregroundStyle(Color.black.opacity(0.58))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(18)
                .background(
                    RoundedRectangle(cornerRadius: HaruStyle.cardRadius, style: .continuous)
                        .fill(Color.white.opacity(0.78))
                )

                if isCalendarConnected {
                    if let provider = calendarProvider {
                        Button {
                            connectCalendar(provider == .apple ? .google : .apple)
                        } label: {
                            Label(
                                String(
                                    format: localized("%@로 전환"),
                                    provider == .apple ? "Google Calendar" : "Apple Calendar"
                                ),
                                systemImage: "arrow.triangle.2.circlepath"
                            )
                            .font(.system(.body).weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                        }
                        .disabled(isCalendarConnecting || isCalendarDisconnecting)
                        .foregroundStyle(.black)
                        .background(
                            RoundedRectangle(cornerRadius: HaruStyle.cardRadius, style: .continuous)
                                .fill(Color.white.opacity(0.78))
                        )
                    }

                    Button {
                        disconnectCalendar()
                    } label: {
                        Text(localized(isCalendarDisconnecting ? "해제 중..." : "캘린더 연동 해제"))
                            .font(.system(.body).weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                    }
                    .disabled(isCalendarDisconnecting)
                    .foregroundStyle(Color(red: 0.84, green: 0.16, blue: 0.16))
                    .background(
                        RoundedRectangle(cornerRadius: HaruStyle.cardRadius, style: .continuous)
                            .fill(Color.white.opacity(0.82))
                    )
                } else {
                    calendarConnectButton(provider: .google, systemImage: "g.circle.fill")
                    calendarConnectButton(provider: .apple, systemImage: "apple.logo")
                }

                if let calendarConnectionErrorKey {
                    Text(localized(calendarConnectionErrorKey))
                        .font(.system(.footnote).weight(.semibold))
                        .foregroundStyle(Color.red.opacity(0.8))
                }
            }
        }
    }

    private func calendarConnectButton(
        provider: CalendarProvider,
        systemImage: String
    ) -> some View {
        Button {
            connectCalendar(provider)
        } label: {
            HStack(spacing: 10) {
                if isCalendarConnecting {
                    ProgressView()
                        .tint(.black)
                } else {
                    Image(systemName: systemImage)
                        .font(.system(size: 17, weight: .semibold))
                }
                Text(String(format: localized("%@ 연결하기"), provider.displayName))
                    .font(.system(.body).weight(.semibold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
        }
        .disabled(isCalendarConnecting)
        .foregroundStyle(.black)
        .background(
            RoundedRectangle(cornerRadius: HaruStyle.cardRadius, style: .continuous)
                .fill(Color.white.opacity(0.78))
        )
    }

    private var logoutSection: some View {
        VStack(spacing: 12) {
            Button(localized("로그아웃")) {
                authVM.signOut()
            }
            .font(.system(.body).weight(.semibold))
            .foregroundStyle(Color(red: 0.84, green: 0.16, blue: 0.16))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 17)
            .background(
                RoundedRectangle(cornerRadius: HaruStyle.cardRadius, style: .continuous)
                    .fill(Color.white.opacity(0.82))
            )

            Button(localized(isDeletingAccount ? "탈퇴 중..." : "계정 탈퇴")) {
                showDeleteAccountAlert = true
            }
            .disabled(isDeletingAccount)
            .font(.system(.body).weight(.semibold))
            .foregroundStyle(Color(red: 0.84, green: 0.16, blue: 0.16))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 17)
            .background(
                RoundedRectangle(cornerRadius: HaruStyle.cardRadius, style: .continuous)
                    .fill(Color.white.opacity(0.82))
            )
        }
    }

    private func settingsCard<Content: View>(
        title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(AppLocalizer.string(title, language: env.appLanguage))
                .font(.system(.headline).weight(.semibold))
                .foregroundStyle(.black)

            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(settingsSectionBackground)
    }

    private var settingsSectionBackground: some View {
        RoundedRectangle(cornerRadius: HaruStyle.cardRadius, style: .continuous)
            .fill(.ultraThinMaterial)
            .overlay(
                RoundedRectangle(cornerRadius: HaruStyle.cardRadius, style: .continuous)
                    .stroke(Color.white.opacity(0.55), lineWidth: 1)
            )
    }

    private func localized(_ key: String) -> String {
        AppLocalizer.string(key, language: env.appLanguage)
    }
    
    // MARK: - 설정 관련 helper

    private func saveProfile() {
        let trimmedName = userName.trimmingCharacters(in: .whitespacesAndNewlines)

        let language = selectedLanguage.isEmpty ? "한국어" : selectedLanguage
        let speechStyle = SpeechStyle.value(
            forCallLanguage: language,
            preserving: env.user?.speechStyle,
            currentLanguage: env.user?.language
        )
        let body: [String: Any] = [
            "name": trimmedName,
            "language": language,
            "speechStyle": speechStyle,
            "location": env.user?.location ?? ""
        ]
        
        APIClient.request(path: "/user", method: .PUT, body: body) { (result: Result<UserSettings, Error>) in
            DispatchQueue.main.async {
                switch result {
                case .success(let updated):
                    userName = updated.name ?? ""
                    selectedLanguage = language
                    env.user?.name = updated.name
                    env.user?.language = language
                    env.user?.speechStyle = speechStyle
                    print("✅ 사용자 설정 저장 완료: \(updated)")
                case .failure(let error):
                    print("❌ 사용자 설정 저장 실패: \(error)")
                }
            }
        }
    }
    
    private func loadInitialSettings() {
        self.userName = env.user?.name ?? ""
        self.selectedAppLanguage = env.appLanguage
        self.selectedLanguage = normalizedLanguage(env.user?.language)
    }

    private func normalizedLanguage(_ language: String?) -> String {
        guard let language, !language.isEmpty else { return "한국어" }
        if language.lowercased().contains("english") || language == "영어" {
            return "English"
        }
        if language.lowercased().contains("japanese") || language.contains("일본") || language.contains("日本") {
            return "日本語"
        }
        return "한국어"
    }

    private func loadCalendarStatus() {
        isCalendarStatusLoading = true

        APIClient.request(path: "/user/calendar-status", method: .GET) { (result: Result<CalendarConnectionStatus, Error>) in
            DispatchQueue.main.async {
                isCalendarStatusLoading = false
                switch result {
                case .success(let status):
                    calendarProvider = status.provider.flatMap(CalendarProvider.init(rawValue:))
                    CalendarProviderStore.selected = calendarProvider
                    isCalendarConnected = status.connected
                        && (calendarProvider != .apple || AppleCalendarService.shared.hasFullAccess)
                case .failure(let error):
                    print("❌ 캘린더 상태 확인 실패: \(error)")
                }
            }
        }
    }

    private func loadDailyCallUsage() {
        guard let requestedUserID = Auth.auth().currentUser?.uid else {
            dailyCallUsage = nil
            isDailyCallUsageLoading = false
            return
        }
        isDailyCallUsageLoading = true

        APIClient.request(path: "/alarm/call-usage", method: .GET) { (result: Result<DailyCallUsage, Error>) in
            DispatchQueue.main.async {
                guard Auth.auth().currentUser?.uid == requestedUserID else {
                    return
                }
                isDailyCallUsageLoading = false
                switch result {
                case .success(let usage):
                    dailyCallUsage = usage
                case .failure(let error):
                    dailyCallUsage = nil
                    print("❌ 오늘의 모닝콜 사용량 확인 실패: \(error)")
                }
            }
        }
    }

    private func connectCalendar(_ provider: CalendarProvider) {
        guard !isCalendarConnecting else { return }
        isCalendarConnecting = true
        calendarConnectionErrorKey = nil

        let finish: (CalendarConnectionResult) -> Void = { result in
            DispatchQueue.main.async {
                isCalendarConnecting = false
                switch result {
                case .connected:
                    loadCalendarStatus()
                case .permissionDenied where provider == .apple:
                    appleCalendarPermissionRestricted = false
                    calendarConnectionErrorKey = "Apple Calendar 전체 접근 권한을 허용해 주세요."
                    showAppleCalendarPermissionAlert = true
                case .permissionDenied:
                    calendarConnectionErrorKey = "Google Calendar 접근 권한을 허용해 주세요."
                case .permissionRestricted:
                    appleCalendarPermissionRestricted = true
                    calendarConnectionErrorKey = "이 기기에서는 캘린더 접근이 제한되어 있어요."
                    showAppleCalendarPermissionAlert = true
                case .cancelled:
                    calendarConnectionErrorKey = "Google Calendar 연결을 취소했어요."
                case .failed:
                    calendarConnectionErrorKey = "캘린더 서버에 연결할 수 없어요. 네트워크를 확인한 뒤 다시 시도해 주세요."
                }
            }
        }

        switch provider {
        case .google:
            googleHelper.signInForCalendar(completion: finish)
        case .apple:
            AppleCalendarService.shared.connect(completion: finish)
        }
    }

    private func openCalendarSettings() {
        guard let settingsURL = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(settingsURL)
    }

    private func disconnectCalendar() {
        isCalendarDisconnecting = true

        let path = calendarProvider == .apple ? "/calendar/apple" : "/user/calendar-token"
        APIClient.request(path: path, method: .DELETE) { (result: Result<CalendarConnectionStatus, Error>) in
            DispatchQueue.main.async {
                isCalendarDisconnecting = false
                switch result {
                case .success(let status):
                    isCalendarConnected = status.connected
                    calendarProvider = status.provider.flatMap { CalendarProvider(rawValue: $0) }
                    CalendarProviderStore.selected = calendarProvider
                case .failure(let error):
                    print("❌ 캘린더 연동 해제 실패: \(error)")
                }
            }
        }
    }

    private func deleteAccount() {
        isDeletingAccount = true
        let deletedUserID = Auth.auth().currentUser?.uid

        APIClient.request(path: "/user", method: .DELETE) { (result: Result<AccountDeletionResponse, Error>) in
            DispatchQueue.main.async {
                isDeletingAccount = false

                switch result {
                case .success(let response):
                    guard
                        response.status == "deleted",
                        response.deleted,
                        response.firebaseDeleted
                    else {
                        showDeleteAccountError = true
                        return
                    }

                    if let deletedUserID {
                        FeatureIntroStore.reset(forUserID: deletedUserID)
                    } else {
                        FeatureIntroStore.resetForCurrentUser()
                    }

                    authVM.signOut()
                case .failure(let error):
                    showDeleteAccountError = true
                    print("❌ 계정 탈퇴 실패: \(error)")
                }
            }
        }
    }

}
