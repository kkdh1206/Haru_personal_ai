//
//  SettingView.swift
//  morningcall
//
//  Created by 박원빈 on 9/5/25.
//

import SwiftUI

struct UserSettings: Codable {
    var name: String
    var language: String
}

struct LiveKitInfo: Codable {
    var lkToken: String
    var lkUrl: String
}

struct SettingView: View {
    @State private var alarms: [Alarm] = []
    @State private var editingAlarm: Alarm? = nil
    @State private var showingTestCallSheet = false
    @State private var isLoading = false
    
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var googleHelper = GoogleSignInHelper()
    @EnvironmentObject var env: AppEnvironment

    // 새로 추가되는 상태들
    @State private var userName: String = ""
    @State private var selectedLanguage: String = "한국어"
    @State private var selectedCharacter: CharacterPreference = CharacterPreferenceStore.current

    @State private var isSettingsLoading = false   // 설정용 로딩

    private let languageOptions: [(code: String, label: String)] = [
        ("한국어", "한국어"),
        ("English", "English")
    ]
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                profileSection
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
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { showingTestCallSheet = true }) {
                    Image(systemName: "phone.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.black)
                        .frame(width: 38, height: 38)
                        .background(Color.white.opacity(0.78), in: Circle())
                }
            }
        }
        .sheet(isPresented: $showingTestCallSheet) {
            TestCallView()
        }
        .navigationTitle("설정")
        .navigationBarTitleDisplayMode(.inline)
        .tint(.black)
        .task {
            loadInitialSettings()
        }
        .preferredColorScheme(.light)
    }

    private var profileSection: some View {
        settingsCard(title: "프로필") {
            TextField("이름", text: $userName)
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
            Picker("언어", selection: $selectedLanguage) {
                ForEach(languageOptions, id: \.code) { lang in
                    Text(lang.label)
                        .tag(lang.code)
                }
            }
            .pickerStyle(.segmented)
            .onChange(of: selectedLanguage) { _ in
                saveProfile()
            }
        }
    }

    private var characterSection: some View {
        settingsCard(title: "기상 화면 캐릭터") {
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
                                Text(character.displayName)
                                    .font(.system(.body, design: .rounded).weight(.semibold))
                                    .foregroundStyle(.black)
                                Text(character.description)
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
                Button {
                    googleHelper.signInForCalendar()
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "calendar.badge.plus")
                            .font(.system(size: 19, weight: .semibold))
                        Text("캘린더 연동 다시 하기")
                            .font(.system(.body, design: .rounded).weight(.semibold))
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .bold))
                    }
                    .foregroundStyle(.black)
                    .padding(18)
                    .background(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .fill(Color.white.opacity(0.78))
                    )
                }
                Text("대화 중 약속이 나오면 Haru가 바로 일정에 추가할 수 있어요.")
                    .font(.system(.footnote, design: .rounded))
                    .foregroundStyle(Color.black.opacity(0.58))
            }
        }
    }

    private var logoutSection: some View {
        VStack(spacing: 0) {
            Button("로그아웃") {
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
        }
    }

    private func settingsCard<Content: View>(
        title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
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
        self.selectedLanguage = env.user?.language?.isEmpty == false ? env.user?.language ?? "한국어" : "한국어"
        self.selectedCharacter = CharacterPreferenceStore.current
    }

    private func applyCharacterPreference(_ character: CharacterPreference) {
        selectedCharacter = character
        CharacterPreferenceStore.current = character

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
