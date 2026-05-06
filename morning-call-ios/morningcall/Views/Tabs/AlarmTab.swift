import SwiftUI

enum AlarmDateFormatter {
    static let time: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.dateFormat = "HH:mm"
        return formatter
    }()

    static let heroDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.dateFormat = "M월 d일 EEEE"
        return formatter
    }()

    static let monthDay: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        formatter.dateFormat = "M월 d일"
        return formatter
    }()

    static let storage: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = .current
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

private struct LocalExceptionMeta: Codable {
    var isSkipped: Bool
    var note: String
}

private enum LocalExceptionStore {
    private static let key = "haru.local.exception.meta"

    static func load(for dateKey: String) -> LocalExceptionMeta {
        guard
            let data = UserDefaults.standard.data(forKey: key),
            let decoded = try? JSONDecoder().decode([String: LocalExceptionMeta].self, from: data)
        else {
            return LocalExceptionMeta(isSkipped: false, note: "")
        }

        return decoded[dateKey] ?? LocalExceptionMeta(isSkipped: false, note: "")
    }

    static func save(_ meta: LocalExceptionMeta, for dateKey: String) {
        var all: [String: LocalExceptionMeta] = [:]
        if
            let data = UserDefaults.standard.data(forKey: key),
            let decoded = try? JSONDecoder().decode([String: LocalExceptionMeta].self, from: data)
        {
            all = decoded
        }

        all[dateKey] = meta
        if let encoded = try? JSONEncoder().encode(all) {
            UserDefaults.standard.set(encoded, forKey: key)
        }
    }
}

struct AlarmTabView: View {
    @State private var alarms: [Alarm] = []
    @State private var isLoading = false
    @State private var editorContext: AlarmEditorContext?
    @State private var showingExceptionSheet = false
    @State private var selectedCharacter = CharacterPreferenceStore.current

    private let weekdayOrder = [1, 2, 3, 4, 5, 6, 0]
    private let weekdayLabels = [
        0: "일",
        1: "월",
        2: "화",
        3: "수",
        4: "목",
        5: "금",
        6: "토",
    ]

    private var recurringAlarms: [Alarm] {
        alarms.filter { ($0.targetDate ?? "").isEmpty }
    }

    private var oneTimeAlarms: [Alarm] {
        alarms.filter { !($0.targetDate ?? "").isEmpty }
    }

    private var nextAlarmSummary: NextAlarmSummary? {
        let calendar = Calendar.current
        let now = Date()

        let candidates: [(Date, Alarm)] = alarms.compactMap { alarm in
            guard alarm.isOn else { return nil }

            if let targetDate = alarm.targetDate, !targetDate.isEmpty {
                guard let candidate = dateForOneTimeAlarm(dateString: targetDate, time: alarm.time) else {
                    return nil
                }
                return candidate > now ? (candidate, alarm) : nil
            }

            let next = nextRecurringDate(for: alarm, after: now, calendar: calendar)
            return next.map { ($0, alarm) }
        }

        guard let earliest = candidates.min(by: { $0.0 < $1.0 }) else {
            return nil
        }

        let components = calendar.dateComponents([.hour, .minute], from: now, to: earliest.0)
        let hours = max(components.hour ?? 0, 0)
        let minutes = max(components.minute ?? 0, 0)
        let countdown = hours > 0
            ? "\(hours)시간 \(minutes)분 뒤"
            : "\(minutes)분 뒤"

        let style = wakeStyleLabel(for: earliest.1.personality, wakeIntensity: earliest.1.wakeIntensity)
        let supporting: String
        if let targetDate = earliest.1.targetDate, !targetDate.isEmpty {
            supporting = "\(AlarmDateFormatter.monthDay.string(from: earliest.0)) 한 번만 울리는 예외 알람이에요."
        } else {
            supporting = "\(style) 톤으로 깨워드릴게요."
        }

        return NextAlarmSummary(
            timeText: earliest.1.time,
            countdownText: countdown,
            supportingText: supporting
        )
    }

    var body: some View {
        NavigationStack {
            GeometryReader { geometry in
                ZStack {
                    heroSection
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

                    VStack(spacing: 10) {
                        Spacer()
                        weeklySection
                        exceptionHandle
                    }
                    .padding(.horizontal, 18)
//                    .padding(.bottom, max(geometry.safeAreaInsets.bottom, 16))
                }
                .background(
                    Image("Background")
                        .resizable()
                        .scaledToFill()
                        .ignoresSafeArea()
                )
            }
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        SettingView()
                    } label: {
                        Image(systemName: "gearshape.fill")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 34, height: 34)
                            .background(Color.black.opacity(0.18), in: Circle())
                    }
                }
            }
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
            .sheet(isPresented: $showingExceptionSheet) {
                ExceptionCalendarSheet(
                    oneTimeAlarms: oneTimeAlarms,
                    onEditDate: { date, existingAlarm in
                        editorContext = makeExceptionContext(for: date, existingAlarm: existingAlarm)
                    }
                )
                .presentationDetents([.fraction(0.42), .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(.white)
            }
            .task {
                selectedCharacter = CharacterPreferenceStore.current
                loadAlarms()
            }
            .onAppear {
                selectedCharacter = CharacterPreferenceStore.current
            }
        }
    }

    private var heroSection: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 8) {
                Text(AlarmDateFormatter.heroDate.string(from: Date()))
                    .font(.system(.headline, design: .rounded).weight(.medium))
                    .foregroundStyle(Color.black.opacity(0.55))

                VStack(alignment: .leading, spacing: 8) {
                    Text("다음 기상까지")
                        .font(.system(.title3, design: .rounded).weight(.semibold))
                        .foregroundStyle(Color.black.opacity(0.78))

                    if let summary = nextAlarmSummary {
                        Text(summary.timeText)
                            .font(.system(size: 54, weight: .bold, design: .rounded))
                            .foregroundStyle(Color.black.opacity(0.92))

                        Text("다음 기상까지 \(summary.countdownText)")
                            .font(.system(.headline, design: .rounded).weight(.semibold))
                            .foregroundStyle(Color.black.opacity(0.88))

                        Text(summary.supportingText)
                            .font(.system(.subheadline, design: .rounded))
                            .foregroundStyle(Color.black.opacity(0.58))
                    } else {
                        Text("알람 없음")
                            .font(.system(size: 42, weight: .bold, design: .rounded))
                            .foregroundStyle(Color.black.opacity(0.92))

                        Text("이번 주 알람을 추가해서 아침 루틴을 준비해보세요.")
                            .font(.system(.subheadline, design: .rounded))
                            .foregroundStyle(Color.black.opacity(0.58))
                    }
                }
            }

            Spacer(minLength: 12)

            HStack {
                Spacer()

                Image(selectedCharacter.assetName)
                    .resizable()
                    .scaledToFit()
                    .frame(width: selectedCharacter == .haru ? 246 : 210)
                    .shadow(color: Color.black.opacity(0.10), radius: 18, y: 14)

                Spacer()
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 22)
        .padding(.top, 18)
    }

    private var weeklySection: some View {
        HStack(spacing: 0) {
            ForEach(weekdaySlots) { slot in
                WeekdayAlarmCard(
                    slot: slot,
                    isToday: slot.day == todayWeekday,
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
    }

    private var exceptionHandle: some View {
        Button {
            showingExceptionSheet = true
        } label: {
            HStack(spacing: 10) {
                Text("예외 캘린더")
                    .font(.system(.subheadline, design: .rounded).weight(.semibold))
                    .foregroundStyle(Color.black.opacity(0.76))

                Image(systemName: "chevron.up")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Color.black.opacity(0.68))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(Color.white.opacity(0.88))
            )
        }
        .buttonStyle(.plain)
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
        Calendar.current.component(.weekday, from: Date()) - 1
    }

    private func makeWeekdayContext(for day: Int, existingAlarm: Alarm?) -> AlarmEditorContext {
        let weekdayName = weekdayLabels[day] ?? ""
        let time = defaultDate(from: existingAlarm?.time ?? nextAlarmSummary?.timeText ?? "07:30")
        return AlarmEditorContext(
            mode: .weekday(day),
            existingAlarm: existingAlarm,
            title: "\(weekdayName)요일 알람",
            subtitle: "반복 알람은 빠르게 수정하는 게 중요해요.",
            defaultTime: time,
            isException: false
        )
    }

    private func makeExceptionContext(for date: Date, existingAlarm: Alarm?) -> AlarmEditorContext {
        AlarmEditorContext(
            mode: .exception(date),
            existingAlarm: existingAlarm,
            title: "예외 설정",
            subtitle: "\(AlarmDateFormatter.monthDay.string(from: date))만 따로 조정해요.",
            defaultTime: defaultDate(from: existingAlarm?.time ?? nextAlarmSummary?.timeText ?? "07:30"),
            isException: true
        )
    }

    private func handleSave(for context: AlarmEditorContext, result: AlarmEditorResult) {
        switch context.mode {
        case .weekday(let day):
            saveWeekdayAlarm(day: day, context: context, result: result)
        case .exception(let date):
            saveExceptionAlarm(date: date, context: context, result: result)
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
            ) {
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
        ) {
            loadAlarms()
        }
    }

    private func handleWeekdayTap(_ slot: WeekdaySlot) {
        guard let alarm = slot.alarm else {
            editorContext = makeWeekdayContext(for: slot.day, existingAlarm: nil)
            return
        }

        if alarm.isOn {
            handleWeekdayToggle(day: slot.day, value: false)
            return
        }

        editorContext = makeWeekdayContext(for: slot.day, existingAlarm: alarm)
    }

    private func saveWeekdayAlarm(day: Int, context: AlarmEditorContext, result: AlarmEditorResult) {
        let time = AlarmDateFormatter.time.string(from: result.time)
        let wakeIntensity = result.wakeStyle == "aggressive" ? "firm" : "gentle"
        let personality = result.wakeStyle

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
                ) {
                    loadAlarms()
                }
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
                ) {
                    createAlarm(
                        time: time,
                        repeatDays: [day],
                        targetDate: nil,
                        isOn: true,
                        wakeIntensity: wakeIntensity,
                        personality: personality
                    ) { _ in
                        loadAlarms()
                    }
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
            ) { _ in
                loadAlarms()
            }
        }
    }

    private func saveExceptionAlarm(date: Date, context: AlarmEditorContext, result: AlarmEditorResult) {
        let dateKey = AlarmDateFormatter.storage.string(from: date)
        LocalExceptionStore.save(
            LocalExceptionMeta(isSkipped: result.isSkipped, note: result.note),
            for: dateKey
        )

        if result.isSkipped {
            if let existing = context.existingAlarm {
                deleteAlarm(id: existing.id) {
                    loadAlarms()
                }
            } else {
                loadAlarms()
            }
            return
        }

        let time = AlarmDateFormatter.time.string(from: result.time)
        let wakeIntensity = result.wakeStyle == "aggressive" ? "firm" : "gentle"
        let personality = result.wakeStyle

        if let existing = context.existingAlarm {
            updateAlarm(
                alarm: existing,
                time: time,
                repeatDays: [],
                targetDate: dateKey,
                isOn: true,
                wakeIntensity: wakeIntensity,
                personality: personality
            ) {
                loadAlarms()
            }
        } else {
            createAlarm(
                time: time,
                repeatDays: [],
                targetDate: dateKey,
                isOn: true,
                wakeIntensity: wakeIntensity,
                personality: personality
            ) { _ in
                loadAlarms()
            }
        }
    }

    private func loadAlarms() {
        isLoading = true

        APIClient.request(path: "/alarm", method: .GET) { (result: Result<[Alarm], Error>) in
            DispatchQueue.main.async {
                switch result {
                case .success(let data):
                    alarms = data
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
        var body: [String: Any] = [
            "time": time,
            "timeZone": TimeZone.current.identifier,
            "repeatDays": repeatDays,
            "isOn": isOn,
            "wakeIntensity": wakeIntensity,
            "personality": personality,
            "voice": "Leda",
            "role": "하루",
        ]
        if let targetDate {
            body["targetDate"] = targetDate
        }

        APIClient.request(path: "/alarm", method: .POST, body: body) { (result: Result<Alarm, Error>) in
            DispatchQueue.main.async {
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
        completion: @escaping () -> Void
    ) {
        var body: [String: Any] = [
            "time": time,
            "timeZone": TimeZone.current.identifier,
            "repeatDays": repeatDays,
            "isOn": isOn,
            "wakeIntensity": wakeIntensity,
            "personality": personality,
            "voice": "Leda",
            "role": "하루",
        ]
        if let targetDate {
            body["targetDate"] = targetDate
        }

        APIClient.request(
            path: "/alarm/\(alarm.id)",
            method: .PUT,
            body: body
        ) { (_: Result<Alarm, Error>) in
            DispatchQueue.main.async {
                completion()
            }
        }
    }

    private func deleteAlarm(id: String, completion: @escaping () -> Void) {
        APIClient.requestVoid(path: "/alarm/\(id)", method: .DELETE) { (_: Result<Void, Error>) in
            DispatchQueue.main.async {
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

    private func dateForOneTimeAlarm(dateString: String, time: String) -> Date? {
        guard let day = AlarmDateFormatter.storage.date(from: dateString) else { return nil }
        let calendar = Calendar.current
        let localDay = calendar.date(bySettingHour: 12, minute: 0, second: 0, of: day) ?? day
        return merge(date: localDay, time: time)
    }

    private func merge(date: Date, time: String) -> Date {
        let calendar = Calendar.current
        let components = time.split(separator: ":").compactMap { Int($0) }
        let hour = components.first ?? 7
        let minute = components.count > 1 ? components[1] : 30
        return calendar.date(bySettingHour: hour, minute: minute, second: 0, of: date) ?? date
    }

    private func defaultDate(from time: String) -> Date {
        AlarmDateFormatter.time.date(from: time) ?? merge(date: Date(), time: time)
    }

    private func wakeStyleLabel(for personality: String, wakeIntensity: String) -> String {
        switch personality {
        case "aggressive":
            return "강하게"
        case "normal":
            return "보통"
        default:
            return wakeIntensity == "firm" ? "강하게" : "부드럽게"
        }
    }
}

private struct WeekdayAlarmCard: View {
    let slot: WeekdaySlot
    let isToday: Bool
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
        .onTapGesture(perform: onTap)
    }
}

private struct ExceptionCalendarSheet: View {
    let oneTimeAlarms: [Alarm]
    let onEditDate: (Date, Alarm?) -> Void

    @State private var selectedDate = Date()

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                DatePicker(
                    "예외 날짜",
                    selection: $selectedDate,
                    displayedComponents: .date
                )
                .datePickerStyle(.graphical)
                .padding(.horizontal, 10)
                .foregroundStyle(.black)

                VStack(spacing: 12) {
                    selectedDateSummary

                    if !oneTimeAlarms.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                ForEach(oneTimeAlarms, id: \.id) { alarm in
                                    if let date = AlarmDateFormatter.storage.date(from: alarm.targetDate ?? "") {
                                        Button {
                                            selectedDate = date
                                            onEditDate(date, alarm)
                                        } label: {
                                            VStack(alignment: .leading, spacing: 4) {
                                                Text(AlarmDateFormatter.monthDay.string(from: date))
                                                    .font(.system(.subheadline, design: .rounded).weight(.semibold))
                                                    .foregroundStyle(.black)
                                                Text(alarm.isOn ? alarm.time : "쉬기")
                                                    .font(.system(.footnote, design: .rounded))
                                                    .foregroundStyle(Color.black.opacity(0.58))
                                            }
                                            .padding(14)
                                            .background(
                                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                                    .fill(Color.white.opacity(0.82))
                                            )
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                            .padding(.horizontal, 4)
                        }
                    }
                }

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 18)
            .padding(.top, 14)
            .background(Color.white)
            .navigationTitle("예외 캘린더")
            .navigationBarTitleDisplayMode(.inline)
            .tint(.black)
        }
        .background(Color.white)
        .preferredColorScheme(.light)
    }

    private var selectedDateSummary: some View {
        let key = AlarmDateFormatter.storage.string(from: selectedDate)
        let existingAlarm = oneTimeAlarms.first(where: { $0.targetDate == key })
        let localMeta = LocalExceptionStore.load(for: key)

        return VStack(alignment: .leading, spacing: 10) {
            Text(AlarmDateFormatter.monthDay.string(from: selectedDate))
                .font(.system(.headline, design: .rounded).weight(.semibold))
                .foregroundStyle(.black)

            Text(
                localMeta.isSkipped
                ? "이 날은 알람 쉬기로 표시되어 있어요."
                : existingAlarm != nil
                    ? "\(existingAlarm?.time ?? "")에 따로 울리는 예외 알람이 있어요."
                    : "기본 루틴과 다르게 조정할 일이 있으면 이 날짜만 따로 설정하세요."
            )
            .font(.system(.footnote, design: .rounded))
            .foregroundStyle(Color.black.opacity(0.58))

            if !localMeta.note.isEmpty {
                Text(localMeta.note)
                    .font(.system(.footnote, design: .rounded))
                    .foregroundStyle(.black)
                    .padding(.top, 4)
            }

            Button {
                onEditDate(selectedDate, existingAlarm)
            } label: {
                Text("이 날짜 수정")
                    .font(.system(.body, design: .rounded).weight(.semibold))
                    .foregroundStyle(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(Color(red: 0.48, green: 0.61, blue: 0.91).opacity(0.12))
                    )
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color.white)
                .shadow(color: Color.black.opacity(0.06), radius: 12, y: 6)
        )
    }
}
