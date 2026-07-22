//
//  SettingView.swift
//  morningcall
//
//  Created by 박원빈 on 9/5/25.
//

import SwiftUI
import FirebaseAuth

struct UserSettings: Codable {
    var name: String
    var language: String
}

private struct CalendarConnectionStatus: Decodable {
    let connected: Bool
}

struct SettingView: View {
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var googleHelper = GoogleSignInHelper()
    @EnvironmentObject var env: AppEnvironment

    @State private var userName: String = ""
    @State private var selectedAppLanguage: AppLanguage = AppLanguageStore.current
    @State private var selectedLanguage: String = "한국어"
    @State private var selectedCharacter: CharacterPreference = CharacterPreferenceStore.current
    @State private var isCalendarConnected = false
    @State private var isCalendarStatusLoading = false
    @State private var isCalendarDisconnecting = false
    @State private var isCalendarConnecting = false
    @State private var showDeleteAccountAlert = false
    @State private var isDeletingAccount = false

    private let languageOptions: [(code: String, label: String)] = [
        ("한국어", "한국어"),
        ("English", "영어"),
        ("日本語", "일본어")
    ]
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                profileSection
                appLanguageSection
                callSection
                characterSection
                calendarSection
                logoutSection
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 36)
        }
        .background(Color(red: 0.97, green: 0.96, blue: 0.93).ignoresSafeArea())
        .navigationTitle(localized("설정"))
        .navigationBarTitleDisplayMode(.inline)
        .tint(.black)
        .task {
            loadInitialSettings()
            loadCalendarStatus()
        }
        .alert(localized("계정 탈퇴"), isPresented: $showDeleteAccountAlert) {
            Button(localized("취소"), role: .cancel) {}
            Button(localized("탈퇴"), role: .destructive) {
                deleteAccount()
            }
        } message: {
            Text(localized("계정과 알람이 삭제됩니다. 이 작업은 되돌릴 수 없어요."))
        }
        .preferredColorScheme(.light)
    }

    private var profileSection: some View {
        settingsCard(title: "프로필") {
            TextField(localized("이름"), text: $userName)
                .font(.system(.body, design: .rounded).weight(.semibold))
                .foregroundStyle(.black)
                .textInputAutocapitalization(.never)
                .submitLabel(.done)
                .onSubmit { saveProfile() }
                .padding(18)
                .background(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(Color.white.opacity(0.78))
                )
        }
    }

    private var callSection: some View {
        settingsCard(title: "통화 시 언어") {
            HStack(spacing: 12) {
                Image(systemName: "globe")
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(Color.black.opacity(0.7))

                Text(localized("선택 언어"))
                    .font(.system(.body, design: .rounded).weight(.semibold))
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
                RoundedRectangle(cornerRadius: 22, style: .continuous)
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
                    .foregroundStyle(Color.black.opacity(0.7))

                Text(localized("화면 표시 언어"))
                    .font(.system(.body, design: .rounded).weight(.semibold))
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
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(Color.white.opacity(0.78))
            )
            .onChange(of: selectedAppLanguage) { language in
                env.updateAppLanguage(language)
            }
        }
    }

    private var characterSection: some View {
        settingsCard(title: "통화 시 캐릭터") {
            VStack(spacing: 12) {
                ForEach(CharacterPreference.allCases, id: \.rawValue) { character in
                    Button {
                        applyCharacterPreference(character)
                    } label: {
                        HStack(spacing: 14) {
                            Image(character.assetName())
                                .resizable()
                                .scaledToFit()
                                .frame(width: 44, height: 44)

                            VStack(alignment: .leading, spacing: 4) {
                                Text(character.localizedDisplayName(language: env.appLanguage))
                                    .font(.system(.body, design: .rounded).weight(.semibold))
                                    .foregroundStyle(.black)
                                Text(character.localizedDescription(language: env.appLanguage))
                                    .font(.system(.footnote, design: .rounded))
                                    .foregroundStyle(Color.black.opacity(0.58))
                                    .multilineTextAlignment(.leading)
                            }

                            Spacer()

                            Image(systemName: selectedCharacter == character ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundStyle(
                                    selectedCharacter == character
                                    ? Color(red: 0.47, green: 0.61, blue: 0.92)
                                    : Color.secondary.opacity(0.45)
                                )
                        }
                        .padding(18)
                        .background(
                            RoundedRectangle(cornerRadius: 22, style: .continuous)
                                .fill(selectedCharacter == character ? Color.white.opacity(0.9) : Color.white.opacity(0.58))
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var calendarSection: some View {
        settingsCard(title: "구글 캘린더") {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    Image(systemName: isCalendarConnected ? "calendar.badge.checkmark" : "calendar.badge.exclamationmark")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(isCalendarConnected ? Color(red: 0.2, green: 0.55, blue: 0.32) : Color.black.opacity(0.68))

                    VStack(alignment: .leading, spacing: 4) {
                        Text(localized(isCalendarConnected ? "연동됨" : "연동 안 됨"))
                            .font(.system(.body, design: .rounded).weight(.semibold))
                            .foregroundStyle(.black)
                        Text(localized(isCalendarConnected ? "Google Calendar가 연결되어 있어요." : "일정 추가를 사용하려면 캘린더를 연결해 주세요."))
                            .font(.system(.footnote, design: .rounded))
                            .foregroundStyle(Color.black.opacity(0.58))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(18)
                .background(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(Color.white.opacity(0.78))
                )

                if isCalendarConnected {
                    Button {
                        disconnectCalendar()
                    } label: {
                        Text(localized(isCalendarDisconnecting ? "해제 중..." : "캘린더 연동 해제"))
                            .font(.system(.body, design: .rounded).weight(.semibold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                    }
                    .disabled(isCalendarDisconnecting)
                    .foregroundStyle(Color(red: 0.84, green: 0.16, blue: 0.16))
                    .background(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .fill(Color.white.opacity(0.82))
                    )
                } else {
                    Button {
                        connectCalendar()
                    } label: {
                        HStack(spacing: 10) {
                            if isCalendarConnecting {
                                ProgressView()
                                    .tint(.black)
                            } else {
                                Image(systemName: "link")
                                    .font(.system(size: 17, weight: .semibold))
                            }
                            Text(localized(isCalendarConnecting ? "연동 중..." : "캘린더 연동하기"))
                                .font(.system(.body, design: .rounded).weight(.semibold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                    }
                    .disabled(isCalendarConnecting)
                    .foregroundStyle(.black)
                    .background(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .fill(Color.white.opacity(0.78))
                    )
                }
            }
        }
    }

    private var logoutSection: some View {
        VStack(spacing: 12) {
            Button(localized("로그아웃")) {
                authVM.signOut()
            }
            .font(.system(.body, design: .rounded).weight(.semibold))
            .foregroundStyle(Color(red: 0.84, green: 0.16, blue: 0.16))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 17)
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(Color.white.opacity(0.82))
            )

            Button(localized(isDeletingAccount ? "탈퇴 중..." : "계정 탈퇴")) {
                showDeleteAccountAlert = true
            }
            .disabled(isDeletingAccount)
            .font(.system(.body, design: .rounded).weight(.semibold))
            .foregroundStyle(Color(red: 0.84, green: 0.16, blue: 0.16))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 17)
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
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
                .font(.system(.headline, design: .rounded).weight(.semibold))
                .foregroundStyle(.black)

            content()
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(settingsSectionBackground)
    }

    private var settingsSectionBackground: some View {
        RoundedRectangle(cornerRadius: 28, style: .continuous)
            .fill(.ultraThinMaterial)
            .overlay(
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .stroke(Color.white.opacity(0.55), lineWidth: 1)
            )
    }

    private func localized(_ key: String) -> String {
        AppLocalizer.string(key, language: env.appLanguage)
    }
    
    // MARK: - 설정 관련 helper

    private func saveProfile() {
        let trimmedName = userName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            userName = env.user?.name ?? ""
            return
        }

        let language = selectedLanguage.isEmpty ? "한국어" : selectedLanguage
        let body: [String: Any] = [
            "name": trimmedName,
            "language": language,
            "location": env.user?.location ?? ""
        ]
        
        APIClient.request(path: "/user", method: .PUT, body: body) { (result: Result<UserSettings, Error>) in
            DispatchQueue.main.async {
                switch result {
                case .success(let updated):
                    userName = trimmedName
                    selectedLanguage = language
                    env.user?.name = trimmedName
                    env.user?.language = language
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
        self.selectedCharacter = CharacterPreferenceStore.current
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
                    isCalendarConnected = status.connected
                case .failure(let error):
                    print("❌ 캘린더 상태 확인 실패: \(error)")
                }
            }
        }
    }

    private func connectCalendar() {
        isCalendarConnecting = true
        googleHelper.signInForCalendar { success in
            DispatchQueue.main.async {
                isCalendarConnecting = false
                if success {
                    loadCalendarStatus()
                }
            }
        }
    }

    private func disconnectCalendar() {
        isCalendarDisconnecting = true

        APIClient.request(path: "/user/calendar-token", method: .DELETE) { (result: Result<CalendarConnectionStatus, Error>) in
            DispatchQueue.main.async {
                isCalendarDisconnecting = false
                switch result {
                case .success(let status):
                    isCalendarConnected = status.connected
                case .failure(let error):
                    print("❌ 캘린더 연동 해제 실패: \(error)")
                }
            }
        }
    }

    private func deleteAccount() {
        isDeletingAccount = true

        APIClient.requestVoid(path: "/user", method: .DELETE) { result in
            DispatchQueue.main.async {
                switch result {
                case .success:
                    guard let currentUser = Auth.auth().currentUser else {
                        authVM.signOut()
                        return
                    }

                    currentUser.delete { error in
                        if let error {
                            print("❌ Firebase 계정 삭제 실패: \(error)")
                        }
                        DispatchQueue.main.async {
                            authVM.signOut()
                        }
                    }
                case .failure(let error):
                    isDeletingAccount = false
                    print("❌ 계정 탈퇴 실패: \(error)")
                }
            }
        }
    }

    private func applyCharacterPreference(_ character: CharacterPreference) {
        selectedCharacter = character
        CharacterPreferenceStore.current = character
        AppIconManager.apply(for: character)

        APIClient.request(path: "/alarm", method: .GET) { (result: Result<[Alarm], Error>) in
            guard case .success(let alarms) = result else { return }

            alarms.forEach { alarm in
                var body: [String: Any] = [
                    "time": alarm.time,
                    "timeZone": TimeZone.current.identifier,
                    "repeatDays": alarm.repeatDays,
                    "isOn": alarm.isOn,
                    "wakeIntensity": alarm.wakeIntensity,
                    "personality": alarm.personality,
                    "voice": character.voiceName,
                    "role": character.roleName,
                ]

                if let targetDate = alarm.targetDate, !targetDate.isEmpty {
                    body["targetDate"] = targetDate
                }

                APIClient.request(
                    path: "/alarm/\(alarm.id)",
                    method: .PUT,
                    body: body
                ) { (updateResult: Result<Alarm, Error>) in
                    if case .success(let updatedAlarm) = updateResult {
                        LocalCallFallbackScheduler.shared.rescheduleFallback(for: updatedAlarm)
                    }
                }
            }
        }
    }
}
