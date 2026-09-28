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
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var showSaveError = false

    private static var defaultAlarmTime: Date {
        Calendar.autoupdatingCurrent.date(bySettingHour: 7, minute: 30, second: 0, of: Date()) ?? Date()
    }

    var body: some View {
        OnboardingLayout(step: .alarmSetup) {
            OnboardingHeading(
                title: "몇 시에 깨워드릴까요?",
                subtitle: "원하는 시간과 깨우기 방식을 선택해 주세요."
            )

            VStack(alignment: .leading, spacing: 14) {
                Text("알람 시간")
                    .font(.system(.headline).weight(.semibold))

                DatePicker("", selection: $time, displayedComponents: .hourAndMinute)
                    .datePickerStyle(.wheel)
                    .labelsHidden()
                    .frame(maxWidth: .infinity)
                    .clipped()
            }
            .onboardingPanel()

            VStack(alignment: .leading, spacing: 16) {
                Text("반복 요일")
                    .font(.system(.headline).weight(.semibold))

                HStack(spacing: 7) {
                    ForEach([1, 2, 3, 4, 5, 6, 0], id: \.self) { day in
                        Button {
                            toggle(day)
                        } label: {
                            Text(weekdayLabel(for: day))
                                .font(.system(.subheadline).weight(.bold))
                                .foregroundStyle(repeatDays.contains(day) ? .white : Color.black.opacity(0.66))
                                .frame(maxWidth: .infinity)
                                .frame(height: 40)
                                .background(
                                    Circle()
                                        .fill(
                                            repeatDays.contains(day)
                                            ? HaruStyle.ink
                                            : Color.white.opacity(0.72)
                                        )
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }

                if repeatDays.isEmpty {
                    Text("반복할 요일을 한 개 이상 선택해 주세요.")
                        .font(.system(.footnote).weight(.semibold))
                        .foregroundStyle(Color.red.opacity(0.78))
                }
            }
            .onboardingPanel()

            VStack(alignment: .leading, spacing: 14) {
                Text("깨우기 강도")
                    .font(.system(.headline).weight(.semibold))

                Picker("깨우기 강도", selection: $wakeIntensity) {
                    Text("다정하게").tag("gentle")
                    Text("강하게").tag("firm")
                }
                .pickerStyle(.segmented)
            }
            .onboardingPanel()

            if showSaveError {
                Text("알람 저장에 실패했어요. 네트워크를 확인하고 다시 시도해 주세요.")
                    .font(.system(.footnote).weight(.semibold))
                    .foregroundStyle(Color.red.opacity(0.82))
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        } actions: {
            Button {
                saveAlarm()
            } label: {
                if isSaving {
                    ProgressView()
                        .tint(.white)
                } else {
                    Text("다음")
                }
            }
            .disabled(isSaving || isLoading || repeatDays.isEmpty)
            .buttonStyle(PrimaryButtonStyle())
        }
        .disabled(isLoading || isSaving)
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
                switch result {
                case .success(let alarms):
                    let recurring = alarms.filter { ($0.targetDate ?? "").isEmpty }
                    guard let alarm = recurring.first else { return }
                    time = AlarmDateFormatter.time.date(from: alarm.time) ?? time
                    repeatDays = Set(recurring.flatMap(\.repeatDays))
                    wakeIntensity = alarm.wakeIntensity
                case .failure:
                    showSaveError = true
                }
            }
        }
    }

    private func saveAlarm() {
        guard !repeatDays.isEmpty else { return }

        showSaveError = false
        isSaving = true
        let character = CharacterPreference.hari
        CharacterPreferenceStore.current = character
        OnboardingCallPreferencesStore.wakeIntensity = wakeIntensity
        AppIconManager.apply(for: character)

        let template = Alarm(
            id: "", time: AlarmDateFormatter.time.string(from: time),
            isOn: true, repeatDays: [], personality: wakeIntensity,
            voice: character.voiceName, role: character.roleName,
            wakeIntensity: wakeIntensity
        )
        let selectedDays = repeatDays
        Task { @MainActor in
            defer { isSaving = false }
            do {
                let alarms = try await WeekdayAlarmService(repository: .live)
                    .configure(days: selectedDays, template: template)
                LocalCallFallbackScheduler.shared.syncFallbacks(with: alarms)
                env.advanceOnboarding(from: .alarmSetup)
            } catch {
                showSaveError = true
                // Partial saves remain recoverable; retry reads their IDs first.
                if let alarms = try? await WeekdayAlarmRepository.live.fetch() {
                    LocalCallFallbackScheduler.shared.syncFallbacks(with: alarms)
                }
                print("❌ 온보딩 알람 저장 실패: \(error)")
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
        OnboardingLayout(step: .calendarIntro) {
            OnboardingHeading(
                title: "오늘 일정도 함께 챙겨요",
                subtitle: "캘린더를 연결하면 아침에 일정을 듣고, 통화 중 새 일정을 추가할 수 있어요."
            )

            VStack(spacing: 12) {
                calendarConnectButton(provider: .google, systemImage: "g.circle")
                calendarConnectButton(provider: .apple, systemImage: "apple.logo")
            }

            Text("연결은 선택이에요. 나중에 설정에서 바꿀 수 있어요.")
                .font(.footnote)
                .foregroundStyle(HaruStyle.ink.opacity(0.65))

            if let connectionErrorKey {
                Text(AppLocalizer.string(connectionErrorKey, language: env.appLanguage))
                    .font(.system(.footnote).weight(.semibold))
                    .foregroundStyle(Color.red.opacity(0.80))
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 12)
            }
        } actions: {
            Button(LocalizedStringKey(isConnected ? "다음" : "나중에 설정하기")) {
                continueToTest()
            }
            .disabled(isConnecting)
            .buttonStyle(PrimaryButtonStyle())
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

    private func calendarConnectButton(provider: CalendarProvider, systemImage: String) -> some View {
        Button {
            connectCalendar(provider)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .font(.system(size: 22, weight: .medium))
                    .frame(width: 28)
                Text(provider.displayName)
                    .font(.body.weight(.semibold))
                Spacer(minLength: 8)
                if isConnecting {
                    ProgressView()
                } else {
                    Image(systemName: isConnected && connectedProvider == provider ? "checkmark.circle.fill" : "chevron.right")
                        .font(.system(size: 18, weight: .medium))
                }
            }
            .frame(maxWidth: .infinity, minHeight: 32)
            .onboardingPanel()
            .contentShape(RoundedRectangle(cornerRadius: HaruStyle.cardRadius))
        }
        .buttonStyle(.plain)
        .disabled(isLoading || isConnecting)
        .foregroundStyle(HaruStyle.ink)
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
        env.advanceOnboarding(from: .calendarIntro)
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
        OnboardingLayout(step: .testCallSetup) {
            OnboardingHeading(
                title: testCallCompleted ? "테스트 통화를 마쳤어요" : scheduledAt == nil ? "마지막으로 통화를 확인해요" : "테스트 전화가 곧 울려요",
                subtitle: testCallCompleted
                    ? "이제 설정한 시간에 하루가 전화드릴게요."
                    : scheduledAt == nil
                        ? "아래 항목을 확인하면 10초 뒤 테스트 전화를 받을 수 있어요."
                        : "전화를 받아 목소리를 확인해 주세요. 통화가 끝나면 테스트 완료 화면으로 넘어가요."
            )

            if scheduledAt == nil {
                VStack(spacing: 12) {
                    Button { requestOrOpenMicrophoneSettings() } label: {
                        readinessRow(
                            icon: "mic",
                            title: "마이크 권한",
                            detail: microphonePermission == .granted ? "허용됨" : "눌러서 마이크 사용을 허용해 주세요.",
                            isReady: microphonePermission == .granted,
                            showsSettingsDisclosure: microphonePermission != .granted
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(microphonePermission == .granted)

                    Button { requestOrOpenNotificationSettings() } label: {
                        readinessRow(
                            icon: "bell",
                            title: "알림 권한",
                            detail: notificationPermissionGranted ? "기본 알람 알림을 받을 수 있어요." : "눌러서 알림을 허용해 주세요.",
                            isReady: notificationPermissionGranted,
                            showsSettingsDisclosure: !notificationPermissionGranted
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(notificationPermissionGranted)

                    Button { confirmedDoNotDisturb.toggle() } label: {
                        readinessRow(
                            icon: "moon",
                            title: "방해금지 모드 확인",
                            detail: "집중 모드를 끈 뒤 눌러서 확인해 주세요.",
                            isReady: confirmedDoNotDisturb
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(confirmedDoNotDisturb ? .isSelected : [])
                }

                if !tokenManager.isRegistered {
                    HStack(spacing: 8) {
                        if tokenManager.isRegistering { ProgressView() }
                        Text("전화 수신 연결을 확인하고 있어요.")
                            .font(.footnote)
                    }
                    .foregroundStyle(HaruStyle.ink.opacity(0.65))
                }
            } else {
                VStack(spacing: 10) {
                    Text(LocalizedStringKey(testCallCompleted ? "테스트 완료" : secondsRemaining > 0 ? "\(secondsRemaining)" : "전화 수신 대기 중"))
                        .font(.system(size: secondsRemaining > 0 && !testCallCompleted ? 72 : 28, weight: .bold))
                        .foregroundStyle(Color.black.opacity(0.88))
                        .contentTransition(.numericText())

                    Text(LocalizedStringKey(
                        testCallCompleted
                            ? "이제 설정한 시간에 하루가 전화드릴게요."
                            : secondsRemaining > 0
                                ? "초 뒤에 전화가 울려요"
                                : "곧 Haru의 전화가 도착합니다."
                    ))
                        .font(.system(.headline).weight(.semibold))
                        .foregroundStyle(Color.black.opacity(0.58))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 34)
                .onboardingPanel()
            }

            if showScheduleError {
                Text("테스트 전화를 예약하지 못했어요. 기기 연결과 네트워크를 확인한 뒤 다시 시도해 주세요.")
                    .font(.system(.footnote).weight(.semibold))
                    .foregroundStyle(Color.red.opacity(0.82))
                    .fixedSize(horizontal: false, vertical: true)
            }
        } actions: {
            if scheduledAt == nil {
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
                .disabled(isScheduling || isFinishing)
                .buttonStyle(QuietButtonStyle())
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
                .buttonStyle(QuietButtonStyle())
            } else {
                Button("테스트 종료하고 홈으로") {
                    endTestAndFinishOnboarding()
                }
                .disabled(isFinishing)
                .buttonStyle(QuietButtonStyle())
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
        title: String,
        detail: String,
        isReady: Bool,
        showsSettingsDisclosure: Bool = false
    ) -> some View {
        HStack(spacing: 12) {
            OnboardingInfoRow(icon: icon, title: title, detail: detail)

            Image(systemName: isReady ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(
                    isReady
                    ? HaruStyle.ink
                    : HaruStyle.ink.opacity(0.4)
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

            let character = CharacterPreference.hari
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
        guard scheduledAt != nil else {
            completeOnboarding()
            return
        }

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
