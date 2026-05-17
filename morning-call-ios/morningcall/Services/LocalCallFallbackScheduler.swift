import ActivityKit
import AlarmKit
import CryptoKit
import Foundation
import Network
import SwiftUI
import UserNotifications

@available(iOS 26.0, *)
private struct HaruAlarmMetadata: AlarmMetadata {
    let alarmId: String
    let role: String
}

final class LocalCallFallbackScheduler {
    static let shared = LocalCallFallbackScheduler()
    static let categoryIdentifier = "HARU_CALL_FALLBACK"
    static let stopActionIdentifier = "HARU_CALL_FALLBACK_STOP"

    private let center = UNUserNotificationCenter.current()
    private let identifierPrefix = "haru.call-fallback."
    private let fallbackDelay: TimeInterval = 60
    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "haru.local-fallback.network")
    private var isOnline = true
    private var cachedAlarms: [Alarm] = []

    private lazy var storageDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }

            self.monitorQueue.async {
                let wasOnline = self.isOnline
                self.isOnline = path.status == .satisfied

                if self.isOnline {
                    self.cancelAllFallbacks()
                } else if wasOnline {
                    self.replaceScheduledFallbacks(with: self.cachedAlarms)
                }
            }
        }
        monitor.start(queue: monitorQueue)
    }

    func registerNotificationCategory() {
        let stopAction = UNNotificationAction(
            identifier: Self.stopActionIdentifier,
            title: "해제",
            options: []
        )

        let category = UNNotificationCategory(
            identifier: Self.categoryIdentifier,
            actions: [stopAction],
            intentIdentifiers: [],
            options: [.customDismissAction]
        )

        center.setNotificationCategories([category])

        if #available(iOS 26.0, *) {
            Task {
                do {
                    _ = try await ensureAlarmKitAuthorization()
                } catch {
                    print("❌ AlarmKit authorization failed:", error.localizedDescription)
                }
            }
        }
    }

    func syncFallbacks(with alarms: [Alarm]) {
        monitorQueue.async { [weak self] in
            guard let self else { return }
            self.cachedAlarms = alarms

            if self.isOnline {
                self.cancelAllFallbacks()
            } else {
                self.replaceScheduledFallbacks(with: alarms)
            }
        }
    }

    func rescheduleFallback(for alarm: Alarm) {
        monitorQueue.async { [weak self] in
            guard let self else { return }

            self.cachedAlarms.removeAll { $0.id == alarm.id }
            if alarm.isOn {
                self.cachedAlarms.append(alarm)
            }

            self.cancelFallback(for: alarm.id) { [weak self] in
                guard let self, !self.isOnline else { return }
                self.scheduleFallback(for: alarm)
            }
        }
    }

    func cancelFallback(for alarmId: String?, completion: (() -> Void)? = nil) {
        guard let alarmId, !alarmId.isEmpty else {
            completion?()
            return
        }

        cancelAlarmKitFallbacks(for: alarmId)

        let prefix = fallbackPrefix(for: alarmId)
        center.getPendingNotificationRequests { [weak self] requests in
            guard let self else { return }

            let pendingIds = requests
                .map(\.identifier)
                .filter { $0.hasPrefix(prefix) }

            self.center.removePendingNotificationRequests(withIdentifiers: pendingIds)

            self.center.getDeliveredNotifications { notifications in
                let deliveredIds = notifications
                    .map(\.request.identifier)
                    .filter { $0.hasPrefix(prefix) }

                self.center.removeDeliveredNotifications(withIdentifiers: deliveredIds)
                completion?()
            }
        }
    }

    private func replaceScheduledFallbacks(with alarms: [Alarm]) {
        center.getPendingNotificationRequests { [weak self] requests in
            guard let self else { return }

            let existingIds = requests
                .map(\.identifier)
                .filter { $0.hasPrefix(self.identifierPrefix) }

            self.center.removePendingNotificationRequests(withIdentifiers: existingIds)
            self.removeDeliveredFallbacks()
            self.cancelAlarmKitFallbacks(for: alarms)

            alarms.forEach { self.scheduleFallback(for: $0) }
        }
    }

    private func cancelAllFallbacks() {
        center.getPendingNotificationRequests { [weak self] requests in
            guard let self else { return }

            let pendingIds = requests
                .map(\.identifier)
                .filter { $0.hasPrefix(self.identifierPrefix) }

            self.center.removePendingNotificationRequests(withIdentifiers: pendingIds)
            self.removeDeliveredFallbacks()
        }
        cancelAlarmKitFallbacks(for: cachedAlarms)
    }

    private func scheduleFallback(for alarm: Alarm) {
        guard alarm.isOn else { return }

        if #available(iOS 26.0, *) {
            scheduleAlarmKitFallback(for: alarm)
            return
        }

        print("⚠️ AlarmKit requires iOS 26+. Skipping push-style fallback because it cannot behave like a full-screen alarm.")
    }

    private func scheduleNotificationFallback(for alarm: Alarm) {
        guard alarm.isOn else { return }

        if let targetDate = alarm.targetDate, !targetDate.isEmpty {
            scheduleOneTimeFallback(for: alarm, targetDate: targetDate)
            return
        }

        Set(alarm.repeatDays).forEach { day in
            scheduleWeeklyFallback(for: alarm, weekday: day)
        }
    }

    @available(iOS 26.0, *)
    private func scheduleAlarmKitFallback(for alarm: Alarm) {
        Task {
            do {
                let state = try await ensureAlarmKitAuthorization()
                guard state == .authorized else {
                    print("⚠️ AlarmKit is not authorized. Skipping push-style fallback:", state)
                    return
                }

                if let targetDate = alarm.targetDate, !targetDate.isEmpty {
                    try await scheduleAlarmKitOneTimeFallback(for: alarm, targetDate: targetDate)
                    return
                }

                for day in Set(alarm.repeatDays) {
                    try await scheduleAlarmKitWeeklyFallback(for: alarm, weekday: day)
                }
            } catch {
                print("❌ AlarmKit fallback failed:", error.localizedDescription)
            }
        }
    }

    @available(iOS 26.0, *)
    private func ensureAlarmKitAuthorization() async throws -> AlarmManager.AuthorizationState {
        let state = AlarmManager.shared.authorizationState
        if state == .notDetermined {
            return try await AlarmManager.shared.requestAuthorization()
        }
        return state
    }

    @available(iOS 26.0, *)
    private func scheduleAlarmKitOneTimeFallback(for alarm: Alarm, targetDate: String) async throws {
        guard
            let day = storageDateFormatter.date(from: targetDate),
            let alarmDate = date(on: day, time: alarm.time)
        else {
            return
        }

        let fireDate = alarmDate.addingTimeInterval(fallbackDelay)
        guard fireDate > Date() else { return }

        let id = alarmKitId(for: "\(alarm.id).once")
        try? AlarmManager.shared.cancel(id: id)

        _ = try await AlarmManager.shared.schedule(
            id: id,
            configuration: .alarm(
                schedule: .fixed(fireDate),
                attributes: alarmKitAttributes(for: alarm),
                sound: .default
            )
        )
        print("✅ Scheduled AlarmKit one-time fallback:", id)
    }

    @available(iOS 26.0, *)
    private func scheduleAlarmKitWeeklyFallback(for alarm: Alarm, weekday: Int) async throws {
        guard
            (0...6).contains(weekday),
            let weekday = localeWeekday(for: weekday),
            let time = alarmKitTime(from: alarm.time)
        else {
            return
        }

        let id = alarmKitId(for: "\(alarm.id).weekday-\(weekday.rawValue)")
        try? AlarmManager.shared.cancel(id: id)

        _ = try await AlarmManager.shared.schedule(
            id: id,
            configuration: .alarm(
                schedule: .relative(.init(time: time, repeats: .weekly([weekday]))),
                attributes: alarmKitAttributes(for: alarm),
                sound: .default
            )
        )
        print("✅ Scheduled AlarmKit weekly fallback:", id, weekday.rawValue)
    }

    @available(iOS 26.0, *)
    private func alarmKitAttributes(for alarm: Alarm) -> AlarmAttributes<HaruAlarmMetadata> {
        let role = alarm.role.isEmpty ? "Haru" : alarm.role
        let alert = AlarmPresentation.Alert(
            title: "\(role) 알람",
            stopButton: AlarmButton(
                text: "정지",
                textColor: .white,
                systemImageName: "stop.fill"
            )
        )

        return AlarmAttributes(
            presentation: AlarmPresentation(alert: alert),
            metadata: HaruAlarmMetadata(alarmId: alarm.id, role: role),
            tintColor: Color(red: 0.41, green: 0.63, blue: 0.95)
        )
    }

    private func scheduleOneTimeFallback(for alarm: Alarm, targetDate: String) {
        guard
            let day = storageDateFormatter.date(from: targetDate),
            let alarmDate = date(on: day, time: alarm.time)
        else {
            return
        }

        let fireDate = alarmDate.addingTimeInterval(fallbackDelay)
        guard fireDate > Date() else { return }

        let components = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute, .second],
            from: fireDate
        )

        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        addNotification(
            identifier: "\(fallbackPrefix(for: alarm.id))once",
            alarm: alarm,
            trigger: trigger
        )
    }

    private func scheduleWeeklyFallback(for alarm: Alarm, weekday: Int) {
        guard (0...6).contains(weekday) else { return }

        let calendar = Calendar.current
        let now = Date()
        let today = calendar.startOfDay(for: now)
        let todayWeekday = calendar.component(.weekday, from: today) - 1
        let daysUntilWeekday = (weekday - todayWeekday + 7) % 7

        guard
            let representativeDay = calendar.date(byAdding: .day, value: daysUntilWeekday, to: today),
            let alarmDate = date(on: representativeDay, time: alarm.time)
        else {
            return
        }

        let fireDate = alarmDate.addingTimeInterval(fallbackDelay)
        let components = calendar.dateComponents([.weekday, .hour, .minute, .second], from: fireDate)
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)

        addNotification(
            identifier: "\(fallbackPrefix(for: alarm.id))weekday-\(weekday)",
            alarm: alarm,
            trigger: trigger
        )
    }

    private func addNotification(
        identifier: String,
        alarm: Alarm,
        trigger: UNCalendarNotificationTrigger
    ) {
        let content = UNMutableNotificationContent()
        content.title = "\(alarm.role) 알람"
        content.body = "일어날 시간이에요."
        content.sound = UNNotificationSound(named: UNNotificationSoundName("IU_morningcall.wav"))
        content.categoryIdentifier = Self.categoryIdentifier
        content.userInfo = [
            "alarmId": alarm.id,
            "type": "callFallback",
        ]

        if #available(iOS 15.0, *) {
            content.interruptionLevel = .timeSensitive
        }

        let request = UNNotificationRequest(
            identifier: identifier,
            content: content,
            trigger: trigger
        )

        center.add(request) { error in
            if let error {
                print("❌ Failed to schedule call fallback:", error.localizedDescription)
            } else {
                print("✅ Scheduled call fallback:", identifier)
            }
        }
    }

    private func removeDeliveredFallbacks() {
        center.getDeliveredNotifications { [weak self] notifications in
            guard let self else { return }

            let ids = notifications
                .map(\.request.identifier)
                .filter { $0.hasPrefix(self.identifierPrefix) }

            self.center.removeDeliveredNotifications(withIdentifiers: ids)
        }
    }

    private func fallbackPrefix(for alarmId: String) -> String {
        "\(identifierPrefix)\(alarmId)."
    }

    @available(iOS 26.0, *)
    private func alarmKitTime(from time: String) -> AlarmKit.Alarm.Schedule.Relative.Time? {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        guard let hour = parts.first else { return nil }
        let minute = parts.count > 1 ? parts[1] : 0
        return .init(hour: hour, minute: minute)
    }

    @available(iOS 26.0, *)
    private func localeWeekday(for day: Int) -> Locale.Weekday? {
        switch day {
        case 0: return .sunday
        case 1: return .monday
        case 2: return .tuesday
        case 3: return .wednesday
        case 4: return .thursday
        case 5: return .friday
        case 6: return .saturday
        default: return nil
        }
    }

    private func alarmKitId(for key: String) -> UUID {
        let hash = SHA256.hash(data: Data(key.utf8))
        var bytes = Array(hash.prefix(16))
        bytes[6] = (bytes[6] & 0x0F) | 0x50
        bytes[8] = (bytes[8] & 0x3F) | 0x80

        return UUID(uuid: (
            bytes[0], bytes[1], bytes[2], bytes[3],
            bytes[4], bytes[5],
            bytes[6], bytes[7],
            bytes[8], bytes[9],
            bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
        ))
    }

    private func cancelAlarmKitFallbacks(for alarms: [Alarm]) {
        guard #available(iOS 26.0, *) else { return }
        alarms.forEach { cancelAlarmKitFallbacks(for: $0.id) }
    }

    private func cancelAlarmKitFallbacks(for alarmId: String) {
        guard #available(iOS 26.0, *) else { return }

        let keys = ["\(alarmId).once"] + (0...6).compactMap { day -> String? in
            guard let weekday = localeWeekday(for: day) else { return nil }
            return "\(alarmId).weekday-\(weekday.rawValue)"
        }

        keys.forEach { key in
            let id = alarmKitId(for: key)
            try? AlarmManager.shared.stop(id: id)
            try? AlarmManager.shared.cancel(id: id)
        }
    }

    private func date(on day: Date, time: String) -> Date? {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        guard let hour = parts.first else { return nil }

        let minute = parts.count > 1 ? parts[1] : 0
        return Calendar.current.date(
            bySettingHour: hour,
            minute: minute,
            second: 0,
            of: day
        )
    }
}
