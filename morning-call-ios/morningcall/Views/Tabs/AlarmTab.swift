import SwiftUI

enum AlarmDateFormatter {
    static let time: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.calendar = .autoupdatingCurrent
        formatter.timeZone = .autoupdatingCurrent
        formatter.dateFormat = "HH:mm"
        return formatter
    }()

    static func heroDate(language: AppLanguage) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = language.locale
        formatter.dateFormat = language.heroDateFormat
        return formatter
    }

    static func monthDay(language: AppLanguage) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = language.locale
        formatter.dateFormat = language.monthDayFormat
        return formatter
    }

    static let storage: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = .autoupdatingCurrent
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}

private struct WeekdaySlot: Identifiable {
    let day: Int
    let label: String
    let alarm: Alarm?

    var id: Int { day }
}

private struct NextAlarmSummary {
    let timeText: String
    let countdownText: String
    let supportingText: String
}

private struct CountdownToken: Identifiable {
    let id: Int
    let value: String
    let isNumber: Bool
}

struct AlarmTabView: View {
    @EnvironmentObject var env: AppEnvironment

    @State private var alarms: [Alarm] = []
    @State private var isLoading = false
    @State private var editorContext: AlarmEditorContext?
    @State private var pendingWeekdaySaves: Set<Int> = []
    @State private var showAlarmSaveError = false
    private let character = CharacterPreference.hari
    @State private var now = Date()

    private let ticker = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private let weekdayOrder = [1, 2, 3, 4, 5, 6, 0]
    private var recurringAlarms: [Alarm] {
        alarms.filter { ($0.targetDate ?? "").isEmpty }
    }

    private var language: AppLanguage {
        env.appLanguage
    }

    private var weekdayLabels: [Int: String] {
        language.weekdayShortLabels
    }

    private var currentDayPeriod: HaruDayPeriod {
        HaruDayPeriod.current(date: now)
    }

    private var nextAlarmSummary: NextAlarmSummary? {
        let calendar = Calendar.autoupdatingCurrent

        let candidates: [(Date, Alarm)] = alarms.compactMap { alarm in
            guard alarm.isOn else { return nil }

            if let targetDate = alarm.targetDate, !targetDate.isEmpty {
                guard let day = AlarmDateFormatter.storage.date(from: targetDate) else { return nil }
                let target = merge(date: day, time: alarm.time)
                return target > now ? (target, alarm) : nil
            } else {
                let next = nextRecurringDate(for: alarm, after: now, calendar: calendar)
                return next.map { ($0, alarm) }
            }
        }

        guard let earliest = candidates.min(by: { $0.0 < $1.0 }) else {
            return nil
        }

        let remaining = max(earliest.0.timeIntervalSince(now), 0)

        return NextAlarmSummary(
            timeText: earliest.1.time,
            countdownText: countdownText(for: remaining),
            supportingText: alarmSupportingText(
                for: earliest.0,
                timeText: earliest.1.time,
                remaining: remaining
            )
        )
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Image(currentDayPeriod.backgroundAssetName)
                    .resizable()
                    .scaledToFill()
                    .ignoresSafeArea()

                GeometryReader { proxy in
                    ZStack(alignment: .topTrailing) {
                        heroSection
                            .padding(.top, proxy.safeAreaInsets.top + 58)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

                        VStack(spacing: 10) {
                            Spacer()
                            weeklySection
                        }
                        .padding(.horizontal, 18)
                        .padding(.bottom, proxy.safeAreaInsets.bottom + 46)

                        NavigationLink {
                            SettingView()
                        } label: {
                            Image(systemName: "gearshape.fill")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(Color.black.opacity(0.78))
                                .frame(width: 48, height: 48)
                                .modifier(SettingsGlassModifier())
                        }
                        .buttonStyle(.plain)
                        .padding(.trailing, 20)
                        .padding(.top, proxy.safeAreaInsets.top + 36)
                    }
                    .frame(width: proxy.size.width, height: proxy.size.height)
                }
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
            .sheet(item: $editorContext) { context in
                AlarmEditView(
                    context: context,
                    onSave: { result in
                        handleSave(for: context, result: result)
                    },
                    onDelete: context.existingAlarm == nil ? nil : {
                        handleDelete(for: context)
                    }
                )
            }
            .task {
                loadAlarms()
            }
            .onReceive(ticker) { date in
                now = date
            }
            .onReceive(NotificationCenter.default.publisher(for: NSNotification.Name.NSSystemTimeZoneDidChange)) { _ in
                loadAlarms()
            }
        }
    }

    private var heroSection: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 14) {
                Text(AlarmDateFormatter.heroDate(language: language).string(from: now))
                    .font(.system(.headline, design: .rounded).weight(.medium))
                    .foregroundStyle(Color.black.opacity(0.55))

                VStack(alignment: .leading, spacing: 8) {
                    Text(localized("다음 모닝콜까지"))
                        .font(.system(.title3, design: .rounded).weight(.semibold))
                        .foregroundStyle(Color.black.opacity(0.78))

                    if let summary = nextAlarmSummary {
                        countdownLabel(summary.countdownText)

                        Text(summary.supportingText)
                            .font(.system(.headline, design: .rounded).weight(.medium))
                            .foregroundStyle(Color.black.opacity(0.58))
                    } else {
                        Text(localized("알람 없음"))
                            .font(.system(size: 42, weight: .bold, design: .rounded))
                            .foregroundStyle(Color.black.opacity(0.92))

                        Text(localized("알람을 추가해서 아침 루틴을 준비해보세요."))
                            .font(.system(.subheadline, design: .rounded))
                            .foregroundStyle(Color.black.opacity(0.58))
                    }
                }
            }

            Spacer(minLength: 12)

            HStack {
                Spacer()

                Image(character.assetName(for: currentDayPeriod))
                    .resizable()
                    .scaledToFit()
                    .frame(width: 210)
                    .shadow(color: Color.black.opacity(0.10), radius: 18, y: 14)

                Spacer()
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 22)
    }

    private var weeklySection: some View {
        HStack(spacing: 0) {
            ForEach(weekdaySlots) { slot in
                WeekdayAlarmCard(
                    slot: slot,
                    isToday: slot.day == todayWeekday,
                    isPending: pendingWeekdaySaves.contains(slot.day),
                    isDisabled: !pendingWeekdaySaves.isEmpty,
                    onTap: {
                        handleWeekdayTap(slot)
                    }
                )
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .fill(Color.white.opacity(0.90))
        )
        .alert(localized("알람 저장 실패"), isPresented: $showAlarmSaveError) {
            Button(localized("확인"), role: .cancel) {}
        } message: {
            Text(localized("알람 저장에 실패했어요. 네트워크를 확인하고 다시 시도해 주세요."))
        }
    }

    private func countdownLabel(_ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            ForEach(countdownTokens(from: text)) { token in
                Text(token.value)
                    .font(
                        token.isNumber
                        ? .system(size: 48, weight: .bold, design: .rounded)
                        : .system(size: 24, weight: .bold, design: .rounded)
                    )
            }
        }
        .foregroundStyle(Color.black.opacity(0.92))
    }

    private func countdownTokens(from text: String) -> [CountdownToken] {
        var tokens: [CountdownToken] = []
        var current = ""
        var currentIsNumber: Bool?

        for character in text {
            let isNumber = character.isNumber
            if currentIsNumber == isNumber {
                current.append(character)
            } else {
                if !current.isEmpty, let type = currentIsNumber {
                    tokens.append(CountdownToken(id: tokens.count, value: current, isNumber: type))
                }
                current = String(character)
                currentIsNumber = isNumber
            }
        }

        if !current.isEmpty, let type = currentIsNumber {
            tokens.append(CountdownToken(id: tokens.count, value: current, isNumber: type))
        }

        return tokens
    }

    private var weekdaySlots: [WeekdaySlot] {
        weekdayOrder.map { day in
            WeekdaySlot(
                day: day,
                label: weekdayLabels[day] ?? "",
                alarm: recurringAlarms.first(where: { $0.repeatDays.contains(day) })
            )
        }
    }

    private var todayWeekday: Int {
        Calendar.autoupdatingCurrent.component(.weekday, from: Date()) - 1
    }

    private func makeWeekdayContext(for day: Int, existingAlarm: Alarm?) -> AlarmEditorContext {
        let time = defaultDate(from: existingAlarm?.time ?? nextAlarmSummary?.timeText ?? "07:30")
        return AlarmEditorContext(
            mode: .weekday(day),
            existingAlarm: existingAlarm,
            title: weekdayAlarmTitle(for: day),
            subtitle: AppLocalizer.string("반복 알람은 빠르게 수정하는 게 중요해요.", language: language),
            defaultTime: time,
            isException: false
        )
    }

    private func handleSave(for context: AlarmEditorContext, result: AlarmEditorResult) {
        switch context.mode {
        case .weekday(let day):
            saveWeekdayAlarm(day: day, context: context, result: result)
        case .exception:
            break
        }
    }

    private func handleDelete(for context: AlarmEditorContext) {
        guard let alarm = context.existingAlarm else { return }
        deleteAlarm(id: alarm.id) {
            loadAlarms()
        }
    }

    private func handleWeekdayToggle(day: Int, value: Bool) {
        guard let alarm = recurringAlarms.first(where: { $0.repeatDays.contains(day) }) else {
            if value {
                createAlarm(
                    time: nextAlarmSummary?.timeText ?? "07:30",
                    repeatDays: [day],
                    targetDate: nil,
                    isOn: true,
                    wakeIntensity: "gentle",
                    personality: "gentle"
                ) { _ in
                    loadAlarms()
                }
            }
            return
        }

        if alarm.repeatDays.count > 1 {
            let updatedDays = value
                ? Array(Set(alarm.repeatDays + [day])).sorted()
                : alarm.repeatDays.filter { $0 != day }

            updateAlarm(
                alarm: alarm,
                time: alarm.time,
                repeatDays: updatedDays,
                targetDate: nil,
                isOn: !updatedDays.isEmpty && alarm.isOn,
                wakeIntensity: alarm.wakeIntensity,
                personality: alarm.personality
            ) { _ in
                loadAlarms()
            }
            return
        }

        updateAlarm(
            alarm: alarm,
            time: alarm.time,
            repeatDays: [day],
            targetDate: nil,
            isOn: value,
            wakeIntensity: alarm.wakeIntensity,
            personality: alarm.personality
        ) { _ in
            loadAlarms()
        }
    }

    private func handleWeekdayTap(_ slot: WeekdaySlot) {
        guard pendingWeekdaySaves.isEmpty else { return }
        editorContext = makeWeekdayContext(for: slot.day, existingAlarm: slot.alarm)
    }

    private func saveWeekdayAlarm(day: Int, context: AlarmEditorContext, result: AlarmEditorResult) {
        guard pendingWeekdaySaves.isEmpty else { return }

        let time = AlarmDateFormatter.time.string(from: result.time)
        let wakeIntensity = wakeIntensityValue(for: result.wakeStyle)
        let personality = result.wakeStyle
        let previousAlarms = alarms

        applyOptimisticWeekdaySave(
            day: day,
            existing: context.existingAlarm,
            time: time,
            wakeIntensity: wakeIntensity,
            personality: personality
        )
        pendingWeekdaySaves.insert(day)

        let finish: (Result<Alarm, Error>) -> Void = { result in
            pendingWeekdaySaves.remove(day)
            switch result {
            case .success(let savedAlarm):
                alarms.removeAll {
                    $0.id.hasPrefix("pending-") && $0.repeatDays.contains(day)
                }
                replaceAlarm(savedAlarm)
                loadAlarms()
            case .failure(let error):
                alarms = previousAlarms
                showAlarmSaveError = true
                print("❌ 알람 저장 실패: \(error)")
                loadAlarms()
            }
        }

        if let existing = context.existingAlarm {
            if existing.repeatDays == [day] || Set(existing.repeatDays) == Set([day]) {
                updateAlarm(
                    alarm: existing,
                    time: time,
                    repeatDays: [day],
                    targetDate: nil,
                    isOn: true,
                    wakeIntensity: wakeIntensity,
                    personality: personality
                ) { finish($0) }
            } else {
                let remainingDays = existing.repeatDays.filter { $0 != day }
                updateAlarm(
                    alarm: existing,
                    time: existing.time,
                    repeatDays: remainingDays,
                    targetDate: nil,
                    isOn: existing.isOn,
                    wakeIntensity: existing.wakeIntensity,
                    personality: existing.personality
                ) { updateResult in
                    guard case .success = updateResult else {
                        finish(updateResult)
                        return
                    }
                    createAlarm(
                        time: time,
                        repeatDays: [day],
                        targetDate: nil,
                        isOn: true,
                        wakeIntensity: wakeIntensity,
                        personality: personality
                    ) { finish($0) }
                }
            }
        } else {
            createAlarm(
                time: time,
                repeatDays: [day],
                targetDate: nil,
                isOn: true,
                wakeIntensity: wakeIntensity,
                personality: personality
            ) { finish($0) }
        }
    }

    private func applyOptimisticWeekdaySave(
        day: Int,
        existing: Alarm?,
        time: String,
        wakeIntensity: String,
        personality: String
    ) {
        if var existing {
            if existing.repeatDays.count == 1, existing.repeatDays.contains(day) {
                existing.time = time
                existing.isOn = true
                existing.wakeIntensity = wakeIntensity
                existing.personality = personality
                replaceAlarm(existing)
                return
            }

            var remainingAlarm = existing
            remainingAlarm.repeatDays.removeAll { $0 == day }
            replaceAlarm(remainingAlarm)
        }

        alarms.append(
            Alarm(
                id: "pending-\(UUID().uuidString)",
                time: time,
                isOn: true,
                repeatDays: [day],
                personality: personality,
                voice: character.voiceName,
                role: character.roleName,
                wakeIntensity: wakeIntensity
            )
        )
    }

    private func replaceAlarm(_ alarm: Alarm) {
        guard let index = alarms.firstIndex(where: { $0.id == alarm.id }) else {
            alarms.append(alarm)
            return
        }
        alarms[index] = alarm
    }

    private func loadAlarms() {
        isLoading = true

        APIClient.request(path: "/alarm", method: .GET) { (result: Result<[Alarm], Error>) in
            DispatchQueue.main.async {
                switch result {
                case .success(let data):
                    alarms = data
                    LocalCallFallbackScheduler.shared.syncFallbacks(with: data)
                case .failure(let error):
                    print("❌ 알람 가져오기 실패: \(error)")
                }
                isLoading = false
            }
        }
    }

    private func createAlarm(
        time: String,
        repeatDays: [Int],
        targetDate: String?,
        isOn: Bool,
        wakeIntensity: String,
        personality: String,
        completion: @escaping (Result<Alarm, Error>) -> Void
    ) {
        let character = CharacterPreference.hari
        var body: [String: Any] = [
            "time": time,
            "timeZone": TimeZone.autoupdatingCurrent.identifier,
            "repeatDays": repeatDays,
            "isOn": isOn,
            "wakeIntensity": wakeIntensity,
            "personality": personality,
            "voice": character.voiceName,
            "role": character.roleName,
        ]
        if let targetDate {
            body["targetDate"] = targetDate
        }

        APIClient.request(path: "/alarm", method: .POST, body: body) { (result: Result<Alarm, Error>) in
            DispatchQueue.main.async {
                if case .success(let alarm) = result {
                    LocalCallFallbackScheduler.shared.rescheduleFallback(for: alarm)
                }
                completion(result)
            }
        }
    }

    private func updateAlarm(
        alarm: Alarm,
        time: String,
        repeatDays: [Int],
        targetDate: String?,
        isOn: Bool,
        wakeIntensity: String,
        personality: String,
        completion: @escaping (Result<Alarm, Error>) -> Void
    ) {
        let character = CharacterPreference.hari
        var body: [String: Any] = [
            "time": time,
            "timeZone": TimeZone.autoupdatingCurrent.identifier,
            "repeatDays": repeatDays,
            "isOn": isOn,
            "wakeIntensity": wakeIntensity,
            "personality": personality,
            "voice": character.voiceName,
            "role": character.roleName,
        ]
        if let targetDate {
            body["targetDate"] = targetDate
        }

        APIClient.request(
            path: "/alarm/\(alarm.id)",
            method: .PUT,
            body: body
        ) { (result: Result<Alarm, Error>) in
            DispatchQueue.main.async {
                if case .success(let updatedAlarm) = result {
                    LocalCallFallbackScheduler.shared.rescheduleFallback(for: updatedAlarm)
                }
                completion(result)
            }
        }
    }

    private func deleteAlarm(id: String, completion: @escaping () -> Void) {
        APIClient.requestVoid(path: "/alarm/\(id)", method: .DELETE) { (result: Result<Void, Error>) in
            DispatchQueue.main.async {
                if case .success = result {
                    LocalCallFallbackScheduler.shared.cancelFallback(for: id)
                }
                completion()
            }
        }
    }

    private func nextRecurringDate(for alarm: Alarm, after now: Date, calendar: Calendar) -> Date? {
        guard !alarm.repeatDays.isEmpty else { return nil }

        for offset in 0..<8 {
            guard let date = calendar.date(byAdding: .day, value: offset, to: now) else { continue }
            let weekday = calendar.component(.weekday, from: date) - 1
            guard alarm.repeatDays.contains(weekday) else { continue }

            let candidate = merge(date: date, time: alarm.time)
            if candidate > now {
                return candidate
            }
        }

        return nil
    }

    private func merge(date: Date, time: String) -> Date {
        let calendar = Calendar.autoupdatingCurrent
        let components = time.split(separator: ":").compactMap { Int($0) }
        let hour = components.first ?? 7
        let minute = components.count > 1 ? components[1] : 30
        return calendar.date(bySettingHour: hour, minute: minute, second: 0, of: date) ?? date
    }

    private func defaultDate(from time: String) -> Date {
        AlarmDateFormatter.time.date(from: time) ?? merge(date: Date(), time: time)
    }

    private func countdownText(for interval: TimeInterval) -> String {
        let totalSeconds = max(Int(ceil(interval)), 0)

        if totalSeconds == 0 {
            return AppLocalizer.string("곧", language: language)
        }

        let days = totalSeconds / (24 * 60 * 60)
        let hours = (totalSeconds % (24 * 60 * 60)) / (60 * 60)
        let minutes = (totalSeconds % (60 * 60)) / 60
        let seconds = totalSeconds % 60

        if days > 0 {
            return hours > 0
                ? countdownText(days: days, hours: hours, minutes: minutes, seconds: seconds)
                : countdownText(days: days, minutes: minutes, seconds: seconds)
        }

        if hours > 0 {
            return countdownText(hours: hours, minutes: minutes, seconds: seconds)
        }

        return minutes > 0
            ? countdownText(minutes: minutes, seconds: seconds)
            : countdownText(seconds: seconds)
    }

    private func alarmSupportingText(for date: Date, timeText: String, remaining: TimeInterval) -> String {
        if remaining > 24 * 60 * 60 {
            return AppLocalizer.string("내일은 알람이 없어요.", language: language)
        }

        let calendar = Calendar.autoupdatingCurrent
        let dayText: String
        if calendar.isDateInToday(date) {
            dayText = AppLocalizer.string("오늘", language: language)
        } else if calendar.isDateInTomorrow(date) {
            dayText = AppLocalizer.string("내일", language: language)
        } else {
            dayText = AlarmDateFormatter.monthDay(language: language).string(from: date)
        }

        return String(
            format: AppLocalizer.string("alarm_supporting_text_format", language: language),
            dayText,
            timeText
        )
    }

    private func wakeStyleLabel(for personality: String, wakeIntensity: String) -> String {
        switch personality {
        case "aggressive":
            return AppLocalizer.string("강하게", language: language)
        case "normal":
            return AppLocalizer.string("보통", language: language)
        default:
            switch wakeIntensity {
            case "firm":
                return AppLocalizer.string("강하게", language: language)
            default:
                return AppLocalizer.string("부드럽게", language: language)
            }
        }
    }

    private func weekdayAlarmTitle(for day: Int) -> String {
        String(
            format: AppLocalizer.string("weekday_alarm_title_format", language: language),
            weekdayLabels[day] ?? ""
        )
    }

    private func countdownText(days: Int, hours: Int, minutes: Int, seconds: Int) -> String {
        String(
            format: AppLocalizer.string("countdown_days_hours_minutes_seconds_format", language: language),
            days,
            hours,
            minutes,
            seconds
        )
    }

    private func countdownText(days: Int, minutes: Int, seconds: Int) -> String {
        String(
            format: AppLocalizer.string("countdown_days_minutes_seconds_format", language: language),
            days,
            minutes,
            seconds
        )
    }

    private func countdownText(hours: Int, minutes: Int, seconds: Int) -> String {
        String(
            format: AppLocalizer.string("countdown_hours_minutes_seconds_format", language: language),
            hours,
            minutes,
            seconds
        )
    }

    private func countdownText(minutes: Int, seconds: Int) -> String {
        String(
            format: AppLocalizer.string("countdown_minutes_seconds_format", language: language),
            minutes,
            seconds
        )
    }

    private func countdownText(seconds: Int) -> String {
        String(
            format: AppLocalizer.string("countdown_seconds_format", language: language),
            seconds
        )
    }

    private func localized(_ key: String) -> String {
        AppLocalizer.string(key, language: language)
    }

    private func wakeIntensityValue(for wakeStyle: String) -> String {
        switch wakeStyle {
        case "aggressive":
            return "firm"
        default:
            return "gentle"
        }
    }
}

private struct SettingsGlassModifier: ViewModifier {
    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content
                .glassEffect(.regular.interactive(), in: Circle())
        } else {
            content
                .background(.ultraThinMaterial, in: Circle())
        }
    }
}

private struct WeekdayAlarmCard: View {
    let slot: WeekdaySlot
    let isToday: Bool
    let isPending: Bool
    let isDisabled: Bool
    let onTap: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            Text(slot.label)
                .font(.system(.subheadline, design: .rounded).weight(.semibold))
                .foregroundStyle(isToday ? .white : Color.black.opacity(0.72))

            Text(slot.alarm?.time ?? "OFF")
                .font(.system(.caption, design: .rounded).weight(.bold))
                .foregroundStyle(
                    isToday
                    ? .white
                    : (slot.alarm == nil ? Color.black.opacity(0.35) : Color.black.opacity(0.88))
                )
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .padding(.horizontal, 4)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(isToday ? Color(red: 0.41, green: 0.63, blue: 0.95).opacity(0.92) : Color.clear)
        )
        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(alignment: .topTrailing) {
            if isPending {
                ProgressView()
                    .controlSize(.mini)
                    .padding(3)
            }
        }
        .opacity(isDisabled && !isPending ? 0.62 : 1)
        .allowsHitTesting(!isDisabled)
        .onTapGesture(perform: onTap)
    }
}
