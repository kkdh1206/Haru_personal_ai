import AVFoundation
import SwiftUI
import UIKit
import UserNotifications

private enum OnboardingCallPreferencesStore {
    private static let wakeIntensityKey = "haru.onboarding.wake-intensity"

    static var wakeIntensity: String {
        get {
            UserDefaults.standard.string(forKey: wakeIntensityKey) ?? "gentle"
        }
        set {
            UserDefaults.standard.set(newValue, forKey: wakeIntensityKey)
        }
    }
}

struct OnboardingAlarmSetupView: View {
    @EnvironmentObject private var env: AppEnvironment

    @State private var time = Self.defaultAlarmTime
    @State private var repeatDays: Set<Int> = [1, 2, 3, 4, 5]
    @State private var wakeIntensity = OnboardingCallPreferencesStore.wakeIntensity
    @State private var selectedCharacter = CharacterPreferenceStore.current
    @State private var existingAlarm: Alarm?
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var showSaveError = false

    private static var defaultAlarmTime: Date {
        Calendar.current.date(bySettingHour: 7, minute: 30, second: 0, of: Date()) ?? Date()
    }

    var body: some View {
        ZStack {
            onboardingBackground

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 9) {
                        Text("첫 모닝콜을 설정해볼게요")
                            .font(.system(.largeTitle, design: .rounded).weight(.bold))
                            .foregroundStyle(Color.black.opacity(0.92))

                        Text("원하는 시간과 깨우기 방식을 선택해 주세요.")
                            .font(.system(.subheadline, design: .rounded).weight(.medium))
                            .foregroundStyle(Color.black.opacity(0.60))
                    }

                    VStack(alignment: .leading, spacing: 14) {
                        Label("알람 시간", systemImage: "alarm.fill")
                            .font(.system(.headline, design: .rounded).weight(.semibold))

                        DatePicker("", selection: $time, displayedComponents: .hourAndMinute)
                            .datePickerStyle(.wheel)
                            .labelsHidden()
                            .frame(maxWidth: .infinity)
                            .clipped()
                    }
                    .onboardingPanel()

                    VStack(alignment: .leading, spacing: 16) {
                        Label("반복 요일", systemImage: "repeat")
                            .font(.system(.headline, design: .rounded).weight(.semibold))

                        HStack(spacing: 7) {
                            ForEach([1, 2, 3, 4, 5, 6, 0], id: \.self) { day in
                                Button {
                                    toggle(day)
                                } label: {
                                    Text(weekdayLabel(for: day))
                                        .font(.system(.subheadline, design: .rounded).weight(.bold))
                                        .foregroundStyle(repeatDays.contains(day) ? .white : Color.black.opacity(0.66))
                                        .frame(maxWidth: .infinity)
                                        .frame(height: 40)
                                        .background(
                                            Circle()
                                                .fill(
                                                    repeatDays.contains(day)
                                                    ? Color(red: 0.35, green: 0.52, blue: 0.84)
                                                    : Color.white.opacity(0.72)
                                                )
                                        )
                                }
                                .buttonStyle(.plain)
                            }
                        }

                        if repeatDays.isEmpty {
                            Text("반복할 요일을 한 개 이상 선택해 주세요.")
                                .font(.system(.footnote, design: .rounded).weight(.semibold))
                                .foregroundStyle(Color.red.opacity(0.78))
                        }
                    }
                    .onboardingPanel()

                    VStack(alignment: .leading, spacing: 14) {
                        Label("깨우기 강도", systemImage: "speaker.wave.2.fill")
                            .font(.system(.headline, design: .rounded).weight(.semibold))

                        Picker("깨우기 강도", selection: $wakeIntensity) {
                            Text("다정하게").tag("gentle")
                            Text("강하게").tag("firm")
                        }
                        .pickerStyle(.segmented)
                    }
                    .onboardingPanel()

                    VStack(alignment: .leading, spacing: 14) {
                        Label("목소리와 캐릭터", systemImage: "waveform")
                            .font(.system(.headline, design: .rounded).weight(.semibold))

                        HStack(spacing: 10) {
                            ForEach(CharacterPreference.allCases, id: \.self) { character in
                                Button {
                                    selectedCharacter = character
                                } label: {
                                    VStack(spacing: 8) {
                                        Image(character.assetName(for: .morning))
                                            .resizable()
                                            .scaledToFit()
                                            .frame(height: 72)

                                        Text(character.localizedDisplayName(language: env.appLanguage))
                                            .font(.system(.subheadline, design: .rounded).weight(.bold))
                                            .foregroundStyle(Color.black.opacity(0.82))

                                        Text(character.localizedDescription(language: env.appLanguage))
                                            .font(.system(.caption2, design: .rounded).weight(.medium))
                                            .foregroundStyle(Color.black.opacity(0.54))
                                            .multilineTextAlignment(.center)
                                            .lineLimit(2)
                                            .frame(height: 34, alignment: .top)
                                    }
                                    .frame(maxWidth: .infinity)
                                    .padding(12)
                                    .background(
                                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                                            .fill(
                                                selectedCharacter == character
                                                ? Color.white.opacity(0.96)
                                                : Color.white.opacity(0.58)
                                            )
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                                    .stroke(
                                                        selectedCharacter == character
                                                        ? Color(red: 0.35, green: 0.52, blue: 0.84)
                                                        : Color.clear,
                                                        lineWidth: 2
                                                    )
                                            )
                                    )
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .onboardingPanel()

                    if showSaveError {
                        Text("알람 저장에 실패했어요. 네트워크를 확인하고 다시 시도해 주세요.")
                            .font(.system(.footnote, design: .rounded).weight(.semibold))
                            .foregroundStyle(Color.red.opacity(0.82))
                            .frame(maxWidth: .infinity, alignment: .center)
                    }

                    Button {
                        saveAlarm()
                    } label: {
                        if isSaving {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("알람 저장하고 계속하기")
                        }
                    }
                    .disabled(isSaving || isLoading || repeatDays.isEmpty)
                    .buttonStyle(PrimaryButtonStyle())
                }
                .padding(.horizontal, 22)
                .padding(.top, 64)
                .padding(.bottom, 48)
            }
        }
        .task {
            loadExistingAlarm()
        }
        .preferredColorScheme(.light)
    }

    private func toggle(_ day: Int) {
        if repeatDays.contains(day) {
            repeatDays.remove(day)
        } else {
            repeatDays.insert(day)
        }
    }

    private func weekdayLabel(for day: Int) -> String {
        env.appLanguage.weekdayShortLabels[day] ?? ""
    }

    private func loadExistingAlarm() {
        APIClient.request(path: "/alarm", method: .GET) { (result: Result<[Alarm], Error>) in
            DispatchQueue.main.async {
                defer { isLoading = false }
                guard case .success(let alarms) = result, let alarm = alarms.first else {
                    return
                }

                existingAlarm = alarm
                time = AlarmDateFormatter.time.date(from: alarm.time) ?? time
                repeatDays = Set(alarm.repeatDays)
                wakeIntensity = alarm.wakeIntensity
                if let savedCharacter = CharacterPreference.allCases.first(
                    where: { $0.roleName == alarm.role }
                ) {
                    selectedCharacter = savedCharacter
                }
            }
        }
    }

    private func saveAlarm() {
        guard !repeatDays.isEmpty else { return }

        showSaveError = false
        isSaving = true
        CharacterPreferenceStore.current = selectedCharacter
        OnboardingCallPreferencesStore.wakeIntensity = wakeIntensity
        AppIconManager.apply(for: selectedCharacter)

        let body: [String: Any?] = [
            "time": AlarmDateFormatter.time.string(from: time),
            "timeZone": TimeZone.current.identifier,
            "repeatDays": Array(repeatDays).sorted(),
            "isOn": true,
            "wakeIntensity": wakeIntensity,
            "personality": wakeIntensity,
            "voice": selectedCharacter.voiceName,
            "role": selectedCharacter.roleName,
        ]
        let path = existingAlarm.map { "/alarm/\($0.id)" } ?? "/alarm"
        let method: HTTPMethod = existingAlarm == nil ? .POST : .PUT

        APIClient.request(path: path, method: method, body: body) { (result: Result<Alarm, Error>) in
            DispatchQueue.main.async {
                isSaving = false
                switch result {
                case .success(let alarm):
                    LocalCallFallbackScheduler.shared.rescheduleFallback(for: alarm)
                    FeatureIntroStore.advance(to: .calendarIntro)
                    env.onboardingStep = .calendarIntro
                case .failure(let error):
                    showSaveError = true
                    print("❌ 온보딩 알람 저장 실패: \(error)")
                }
            }
        }
    }
}

private struct OnboardingCalendarStatus: Decodable {
    let connected: Bool
    let provider: String?
}

struct CalendarIntroView: View {
    @EnvironmentObject private var env: AppEnvironment
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var googleHelper = GoogleSignInHelper()

    @State private var isConnected = false
    @State private var connectedProvider: CalendarProvider?
    @State private var isLoading = true
    @State private var isConnecting = false
    @State private var connectionErrorKey: String?
    @State private var showAppleCalendarPermissionAlert = false
    @State private var appleCalendarPermissionRestricted = false
    @State private var retryAppleCalendarAfterSettings = false

    var body: some View {
        ZStack {
            onboardingBackground

            GeometryReader { proxy in
                VStack(alignment: .leading, spacing: 0) {
                    Spacer(minLength: 34)

                    VStack(alignment: .leading, spacing: 10) {
                        Image(systemName: "calendar.badge.plus")
                            .font(.system(size: 36, weight: .semibold))
                            .foregroundStyle(Color(red: 0.35, green: 0.52, blue: 0.84))

                        Text("캘린더를 연결할까요?")
                            .font(.system(.largeTitle, design: .rounded).weight(.bold))
                            .foregroundStyle(Color.black.opacity(0.92))

                        Text("Haru가 오늘 일정을 가져와 아침에 브리핑하고, 통화 중 말로 새 일정을 추가할 수 있어요.")
                            .font(.system(.body, design: .rounded).weight(.medium))
                            .foregroundStyle(Color.black.opacity(0.60))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.top, proxy.safeAreaInsets.top + 36)

                    Spacer(minLength: 30)

                    VStack(spacing: 14) {
                        calendarBenefit(
                            icon: "list.bullet.clipboard.fill",
                            title: "오늘 일정을 아침 브리핑에 담아요",
                            description: "첫 일정과 준비할 내용을 모닝콜에서 자연스럽게 알려드려요."
                        )
                        calendarBenefit(
                            icon: "text.bubble.fill",
                            title: "말로 일정을 추가할 수 있어요",
                            description: "통화 중 일정과 시간을 말하면 선택한 캘린더에 추가할 수 있어요."
                        )
                    }

                    Spacer(minLength: 28)

                    if let connectionErrorKey {
                        Text(AppLocalizer.string(connectionErrorKey, language: env.appLanguage))
                            .font(.system(.footnote, design: .rounded).weight(.semibold))
                            .foregroundStyle(Color.red.opacity(0.80))
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.bottom, 12)
                    }

                    if isConnected {
                        Button {
                            continueToTest()
                        } label: {
                            Label("연결됨, 계속하기", systemImage: "checkmark.circle.fill")
                        }
                        .disabled(isLoading || isConnecting)
                        .buttonStyle(PrimaryButtonStyle())
                    } else {
                        VStack(spacing: 12) {
                            calendarConnectButton(provider: .google, systemImage: "g.circle.fill")
                            calendarConnectButton(provider: .apple, systemImage: "apple.logo")
                        }
                    }

                    Button("지금은 건너뛰기") {
                        continueToTest()
                    }
                    .font(.system(.subheadline, design: .rounded).weight(.semibold))
                    .foregroundStyle(Color.black.opacity(0.58))
                    .frame(maxWidth: .infinity)
                    .padding(.top, 14)
                    .padding(.bottom, proxy.safeAreaInsets.bottom + 36)
                }
                .padding(.horizontal, 22)
                .frame(width: proxy.size.width, height: proxy.size.height)
            }
        }
        .task {
            loadCalendarStatus()
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
        }
        .alert(
            AppLocalizer.string("Apple Calendar 권한이 필요해요", language: env.appLanguage),
            isPresented: $showAppleCalendarPermissionAlert
        ) {
            Button(AppLocalizer.string("취소", language: env.appLanguage), role: .cancel) {}
            Button(AppLocalizer.string("설정 열기", language: env.appLanguage)) {
                retryAppleCalendarAfterSettings = true
                openCalendarSettings()
            }
        } message: {
            Text(
                AppLocalizer.string(
                    appleCalendarPermissionRestricted
                    ? "이 기기에서는 캘린더 접근이 제한되어 있어요. 스크린 타임 또는 관리 설정을 확인해 주세요."
                    : "Apple Calendar를 연결하려면 설정에서 캘린더 전체 접근을 허용해 주세요.",
                    language: env.appLanguage
                )
            )
        }
        .preferredColorScheme(.light)
    }

    private func calendarBenefit(icon: String, title: LocalizedStringKey, description: LocalizedStringKey) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 21, weight: .semibold))
                .foregroundStyle(Color(red: 0.35, green: 0.52, blue: 0.84))
                .frame(width: 42, height: 42)
                .background(Color.white.opacity(0.82), in: Circle())

            VStack(alignment: .leading, spacing: 5) {
                Text(title)
                    .font(.system(.body, design: .rounded).weight(.semibold))
                    .foregroundStyle(Color.black.opacity(0.86))
                Text(description)
                    .font(.system(.footnote, design: .rounded).weight(.medium))
                    .foregroundStyle(Color.black.opacity(0.57))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .onboardingPanel()
    }

    private func calendarConnectButton(
        provider: CalendarProvider,
        systemImage: String
    ) -> some View {
        Button {
            connectCalendar(provider)
        } label: {
            HStack(spacing: 9) {
                if isLoading || isConnecting {
                    ProgressView()
                        .tint(.white)
                } else {
                    Image(systemName: systemImage)
                }
                Text(
                    String(
                        format: AppLocalizer.string("%@ 연결하기", language: env.appLanguage),
                        provider.displayName
                    )
                )
            }
        }
        .disabled(isLoading || isConnecting)
        .buttonStyle(PrimaryButtonStyle())
    }

    private func loadCalendarStatus() {
        APIClient.request(path: "/user/calendar-status", method: .GET) { (result: Result<OnboardingCalendarStatus, Error>) in
            DispatchQueue.main.async {
                isLoading = false
                if case .success(let status) = result {
                    connectedProvider = status.provider.flatMap { CalendarProvider(rawValue: $0) }
                    CalendarProviderStore.selected = connectedProvider
                    isConnected = status.connected
                        && (connectedProvider != .apple || AppleCalendarService.shared.hasFullAccess)
                }
            }
        }
    }

    private func connectCalendar(_ provider: CalendarProvider) {
        guard !isConnecting else { return }
        isConnecting = true
        connectionErrorKey = nil

        let finish: (CalendarConnectionResult) -> Void = { result in
            DispatchQueue.main.async {
                isConnecting = false
                switch result {
                case .connected:
                    isConnected = true
                    connectedProvider = provider
                    continueToTest()
                case .permissionDenied where provider == .apple:
                    appleCalendarPermissionRestricted = false
                    connectionErrorKey = "Apple Calendar 전체 접근 권한을 허용해 주세요."
                    showAppleCalendarPermissionAlert = true
                case .permissionDenied:
                    connectionErrorKey = "Google Calendar 접근 권한을 허용해 주세요."
                case .permissionRestricted:
                    appleCalendarPermissionRestricted = true
                    connectionErrorKey = "이 기기에서는 캘린더 접근이 제한되어 있어요."
                    showAppleCalendarPermissionAlert = true
                case .cancelled:
                    connectionErrorKey = "Google Calendar 연결을 취소했어요."
                case .failed:
                    connectionErrorKey = "캘린더 서버에 연결할 수 없어요. 네트워크를 확인한 뒤 다시 시도해 주세요."
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

    private func continueToTest() {
        FeatureIntroStore.advance(to: .testCallSetup)
        env.onboardingStep = .testCallSetup
    }
}

private struct ScheduledTestCallResponse: Decodable {
    let scheduledAt: String
    let jobId: String
    let roomName: String
}

struct OnboardingTestCallView: View {
    @EnvironmentObject private var env: AppEnvironment
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject private var tokenManager = DeviceTokenManager.shared
    @ObservedObject private var callPresentation = CallPresentationStore.shared

    @State private var microphonePermission = AVAudioApplication.shared.recordPermission
    @State private var notificationAuthorization: UNAuthorizationStatus = .notDetermined
    @State private var confirmedDoNotDisturb = false
    @State private var isScheduling = false
    @State private var isFinishing = false
    @State private var showScheduleError = false
    @State private var now = Date()
    @State private var scheduledAt = FeatureIntroStore.testCallScheduledAt

    private var secondsRemaining: Int {
        guard let scheduledAt else { return 10 }
        return max(Int(ceil(scheduledAt.timeIntervalSince(now))), 0)
    }

    private var allRequirementsReady: Bool {
        microphonePermission == .granted
            && notificationPermissionGranted
            && confirmedDoNotDisturb
            && tokenManager.isRegistered
    }

    private var canSchedule: Bool {
        allRequirementsReady
            && !isScheduling
    }

    private var testCallCompleted: Bool {
        callPresentation.lastEndedAlarmID == "onboarding-test"
            || callPresentation.onboardingTestCompleted
            || FeatureIntroStore.testCallCompleted
    }

    private var testCallWaitTimedOut: Bool {
        guard let scheduledAt, !testCallCompleted else { return false }
        return now.timeIntervalSince(scheduledAt) >= 45
    }

    var body: some View {
        ZStack {
            onboardingBackground

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 10) {
                        Image(systemName: scheduledAt == nil ? "phone.badge.checkmark" : "phone.arrow.down.left.fill")
                            .font(.system(size: 36, weight: .semibold))
                            .foregroundStyle(Color(red: 0.35, green: 0.52, blue: 0.84))

                        Text(LocalizedStringKey(scheduledAt == nil ? "실제로 전화를 한번 해드릴게요" : "테스트 전화가 곧 울려요"))
                            .font(.system(.largeTitle, design: .rounded).weight(.bold))
                            .foregroundStyle(Color.black.opacity(0.92))

                        Text(LocalizedStringKey(
                            scheduledAt == nil
                            ? "권한과 설정을 확인하면 10초 후 Haru가 짧은 테스트 전화를 걸어요."
                            : "전화를 받아 목소리를 확인해 주세요. 통화가 끝나면 테스트 완료 화면으로 넘어가요."
                        ))
                        .font(.system(.body, design: .rounded).weight(.medium))
                        .foregroundStyle(Color.black.opacity(0.60))
                        .fixedSize(horizontal: false, vertical: true)
                    }

                    if scheduledAt == nil {
                        VStack(spacing: 12) {
                            readinessRow(
                                icon: microphonePermission == .granted ? "mic.fill" : "mic.slash.fill",
                                title: "마이크 권한",
                                detail: microphonePermission == .granted ? "허용됨" : "설정에서 마이크를 허용해 주세요.",
                                isReady: microphonePermission == .granted
                            )

                            readinessRow(
                                icon: "antenna.radiowaves.left.and.right",
                                title: "전화 수신 연결",
                                detail: tokenManager.isRegistering
                                    ? "전화 수신 토큰을 등록하고 있어요."
                                    : tokenManager.isRegistered
                                        ? "테스트 전화를 받을 준비가 됐어요."
                                        : "기기 연결을 확인하고 있어요.",
                                isReady: tokenManager.isRegistered
                            )

                            Button {
                                requestOrOpenNotificationSettings()
                            } label: {
                                readinessRow(
                                    icon: notificationPermissionGranted ? "bell.badge.fill" : "bell.slash.fill",
                                    title: "알림 권한",
                                    detail: notificationPermissionGranted ? "기본 알람 알림을 받을 수 있어요." : "설정에서 알림을 허용해 주세요.",
                                    isReady: notificationPermissionGranted,
                                    showsSettingsDisclosure: true
                                )
                            }
                            .buttonStyle(.plain)

                            readinessRow(
                                icon: "moon.zzz.fill",
                                title: "테스트 중 방해금지 모드 끄기",
                                detail: "테스트 전화가 울리는지 확인할 때만 잠시 꺼 주세요.",
                                isReady: confirmedDoNotDisturb
                            )

                            Button {
                                confirmedDoNotDisturb.toggle()
                            } label: {
                                HStack(spacing: 9) {
                                    Image(systemName: confirmedDoNotDisturb ? "checkmark.circle.fill" : "circle")
                                        .font(.system(size: 22, weight: .semibold))
                                        .foregroundStyle(
                                            confirmedDoNotDisturb
                                            ? Color(red: 0.20, green: 0.58, blue: 0.34)
                                            : Color.black.opacity(0.30)
                                        )
                                    Text("방해금지 모드를 껐어요")
                                        .font(.system(.subheadline, design: .rounded).weight(.semibold))
                                        .foregroundStyle(Color.black.opacity(0.72))
                                }
                                .frame(maxWidth: .infinity)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }

                        if microphonePermission != .granted {
                            Button("마이크 권한 설정하기") {
                                requestOrOpenMicrophoneSettings()
                            }
                            .font(.system(.subheadline, design: .rounded).weight(.semibold))
                            .foregroundStyle(Color.black.opacity(0.72))
                            .frame(maxWidth: .infinity)
                        }
                    } else {
                        VStack(spacing: 10) {
                            Text(testCallCompleted ? "테스트 통화 발송 완료" : secondsRemaining > 0 ? "\(secondsRemaining)" : "전화 수신 대기 중")
                                .font(.system(size: secondsRemaining > 0 && !testCallCompleted ? 72 : 28, weight: .bold, design: .rounded))
                                .foregroundStyle(Color.black.opacity(0.88))
                                .contentTransition(.numericText())

                            Text(LocalizedStringKey(
                                testCallCompleted
                                    ? "걸려오는 전화를 받아 확인해보세요."
                                    : secondsRemaining > 0
                                        ? "초 뒤에 전화가 울려요"
                                        : "곧 Haru의 전화가 도착합니다."
                            ))
                                .font(.system(.headline, design: .rounded).weight(.semibold))
                                .foregroundStyle(Color.black.opacity(0.58))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 34)
                        .onboardingPanel()
                    }

                    VStack(alignment: .leading, spacing: 11) {
                        Label("일반 모닝콜은 최대 총 3회", systemImage: "phone.badge.clock.fill")
                            .font(.system(.headline, design: .rounded).weight(.semibold))
                            .foregroundStyle(Color.black.opacity(0.84))
                        Text("일어나지 않으면 최초 전화 후 최대 두 번 더 연락해요. 지금 진행하는 테스트 전화는 1회만 울리고 재통화하지 않아요.")
                            .font(.system(.footnote, design: .rounded).weight(.medium))
                            .foregroundStyle(Color.black.opacity(0.57))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .onboardingPanel()

                    if showScheduleError {
                        Text("테스트 전화를 예약하지 못했어요. 기기 연결과 네트워크를 확인한 뒤 다시 시도해 주세요.")
                            .font(.system(.footnote, design: .rounded).weight(.semibold))
                            .foregroundStyle(Color.red.opacity(0.82))
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    if scheduledAt == nil, allRequirementsReady {
                        Button {
                            scheduleTestCall()
                        } label: {
                            if isScheduling {
                                HStack(spacing: 9) {
                                    ProgressView()
                                        .tint(.white)
                                    Text("테스트 통화를 준비 중이에요")
                                }
                            } else {
                                Text("10초 뒤 테스트 전화 받기")
                            }
                        }
                        .disabled(!canSchedule)
                        .buttonStyle(PrimaryButtonStyle())

                        Button("테스트를 건너뛰고 홈으로") {
                            endTestAndFinishOnboarding()
                        }
                        .font(.system(.subheadline, design: .rounded).weight(.semibold))
                        .foregroundStyle(Color.black.opacity(0.56))
                        .frame(maxWidth: .infinity)
                    } else if scheduledAt == nil {
                        Text("위 4가지 항목을 모두 확인하면 테스트 전화를 받거나 건너뛸 수 있어요.")
                            .font(.system(.footnote, design: .rounded).weight(.semibold))
                            .foregroundStyle(Color.black.opacity(0.56))
                            .frame(maxWidth: .infinity)
                            .multilineTextAlignment(.center)
                    } else if testCallCompleted {
                        Button {
                            endTestAndFinishOnboarding()
                        } label: {
                            if isFinishing {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                Text("테스트 완료하고 홈으로")
                            }
                        }
                        .disabled(isFinishing)
                        .buttonStyle(PrimaryButtonStyle())
                    } else if testCallWaitTimedOut {
                        Button("테스트 전화 다시 받기") {
                            retryTestCall()
                        }
                        .buttonStyle(PrimaryButtonStyle())

                        Button("테스트 종료하고 홈으로") {
                            endTestAndFinishOnboarding()
                        }
                        .disabled(isFinishing)
                        .font(.system(.subheadline, design: .rounded).weight(.semibold))
                        .foregroundStyle(Color.black.opacity(0.56))
                        .frame(maxWidth: .infinity)
                    } else {
                        Button("테스트 종료하고 홈으로") {
                            endTestAndFinishOnboarding()
                        }
                        .disabled(isFinishing)
                        .font(.system(.subheadline, design: .rounded).weight(.semibold))
                        .foregroundStyle(Color.black.opacity(0.56))
                        .frame(maxWidth: .infinity)
                    }
                }
                .padding(.horizontal, 22)
                .padding(.top, 64)
                .padding(.bottom, 48)
            }
        }
        .onAppear {
            now = Date()
            callPresentation.refreshOnboardingTestCompletion()
            refreshPermissionStatus()
            DeviceTokenManager.shared.registerTokensToAPI()
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            now = Date()
            callPresentation.refreshOnboardingTestCompletion()
            refreshPermissionStatus()
        }
        .onChange(of: callPresentation.phase) { _, _ in
            now = Date()
        }
        .task {
            while !Task.isCancelled {
                now = Date()
                try? await Task.sleep(nanoseconds: 500_000_000)
            }
        }
        .preferredColorScheme(.light)
    }

    private func readinessRow(
        icon: String,
        title: LocalizedStringKey,
        detail: LocalizedStringKey,
        isReady: Bool,
        showsSettingsDisclosure: Bool = false
    ) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 21, weight: .semibold))
                .foregroundStyle(Color(red: 0.35, green: 0.52, blue: 0.84))
                .frame(width: 42, height: 42)
                .background(Color.white.opacity(0.82), in: Circle())

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(.body, design: .rounded).weight(.semibold))
                    .foregroundStyle(Color.black.opacity(0.86))
                Text(detail)
                    .font(.system(.footnote, design: .rounded).weight(.medium))
                    .foregroundStyle(Color.black.opacity(0.57))
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Image(systemName: isReady ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(
                    isReady
                    ? Color(red: 0.20, green: 0.58, blue: 0.34)
                    : Color(red: 0.88, green: 0.48, blue: 0.20)
                )

            if showsSettingsDisclosure {
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Color.black.opacity(0.28))
            }
        }
        .onboardingPanel()
    }

    private func requestOrOpenMicrophoneSettings() {
        if microphonePermission == .undetermined {
            AVAudioApplication.requestRecordPermission { _ in
                DispatchQueue.main.async {
                    microphonePermission = AVAudioApplication.shared.recordPermission
                }
            }
            return
        }

        guard let settingsURL = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(settingsURL)
    }

    private var notificationPermissionGranted: Bool {
        switch notificationAuthorization {
        case .authorized, .ephemeral:
            return true
        case .denied, .notDetermined, .provisional:
            return false
        @unknown default:
            return false
        }
    }

    private func requestOrOpenNotificationSettings() {
        if notificationAuthorization == .notDetermined {
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
                refreshPermissionStatus()
            }
            return
        }

        guard let settingsURL = URL(string: UIApplication.openNotificationSettingsURLString) else { return }
        UIApplication.shared.open(settingsURL)
    }

    private func refreshPermissionStatus() {
        DispatchQueue.main.async {
            microphonePermission = AVAudioApplication.shared.recordPermission
        }
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                notificationAuthorization = settings.authorizationStatus
            }
        }
    }

    private func scheduleTestCall() {
        isScheduling = true
        showScheduleError = false
        CallPresentationStore.shared.prepareForOnboardingTest()
        DeviceTokenManager.shared.registerTokensToAPI { registered in
            guard registered else {
                DispatchQueue.main.async {
                    isScheduling = false
                    showScheduleError = true
                }
                return
            }

            let character = CharacterPreferenceStore.current
            APIClient.request(
                path: "/alarm/onboarding-test-call",
                method: .POST,
                body: [
                    "wakeIntensity": OnboardingCallPreferencesStore.wakeIntensity,
                    "voice": character.voiceName,
                    "role": character.roleName,
                    "delaySeconds": 10,
                ]
            ) { (result: Result<ScheduledTestCallResponse, Error>) in
                DispatchQueue.main.async {
                    isScheduling = false
                    switch result {
                    case .success(let response):
                        let date = Self.parseISODate(response.scheduledAt)
                            ?? Date().addingTimeInterval(10)
                        scheduledAt = date
                        now = Date()
                        FeatureIntroStore.testCallScheduledAt = date
                        FeatureIntroStore.testCallJobID = response.jobId
                        FeatureIntroStore.testCallRoomName = response.roomName
                    case .failure(let error):
                        showScheduleError = true
                        print("❌ 온보딩 테스트 전화 예약 실패: \(error)")
                    }
                }
            }
        }
    }

    private func retryTestCall() {
        scheduledAt = nil
        FeatureIntroStore.testCallScheduledAt = nil
        scheduleTestCall()
    }

    private func endTestAndFinishOnboarding() {
        guard !isFinishing else { return }
        isFinishing = true

        var cancelBody: [String: Any] = [:]
        if let jobID = FeatureIntroStore.testCallJobID {
            cancelBody["jobId"] = jobID
        }
        if let roomName = FeatureIntroStore.testCallRoomName {
            cancelBody["roomName"] = roomName
        }

        APIClient.requestVoid(
            path: "/alarm/onboarding-test-call",
            method: .DELETE,
            body: cancelBody
        ) { result in
            if case .failure(let error) = result {
                print("❌ 온보딩 테스트 전화 취소 실패: \(error)")
            }
        }

        completeOnboarding()
        Task {
            await CallManager.shared.endCurrentCall()
        }
    }

    private func completeOnboarding() {
        FeatureIntroStore.markCompleted()
        env.onboardingStep = .completed
    }

    private static func parseISODate(_ value: String) -> Date? {
        let fractionalFormatter = ISO8601DateFormatter()
        fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractionalFormatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}

private var onboardingBackground: some View {
    Image("Background_morning")
        .resizable()
        .scaledToFill()
        .frame(width: UIScreen.main.bounds.width, height: UIScreen.main.bounds.height)
        .clipped()
        .ignoresSafeArea()
}

private extension View {
    func onboardingPanel() -> some View {
        padding(16)
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(Color.white.opacity(0.84))
                    .overlay(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .stroke(Color.white.opacity(0.68), lineWidth: 1)
                    )
            )
    }
}
