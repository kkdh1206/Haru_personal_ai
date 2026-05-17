import Foundation
import UserNotifications

final class LocalCallFallbackScheduler {
    static let shared = LocalCallFallbackScheduler()
    static let categoryIdentifier = "HARU_CALL_FALLBACK"
    static let stopActionIdentifier = "HARU_CALL_FALLBACK_STOP"

    private let center = UNUserNotificationCenter.current()
    private let identifierPrefix = "haru.call-fallback."
    private let fallbackDelay: TimeInterval = 60
    private let ringRepeatInterval: TimeInterval = 30
    private let ringCount = 8

    private lazy var storageDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private init() {}

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
    }

    func syncFallbacks(with alarms: [Alarm]) {
        center.getPendingNotificationRequests { [weak self] requests in
            guard let self else { return }

            let existingIds = requests
                .map(\.identifier)
                .filter { $0.hasPrefix(self.identifierPrefix) }

            self.center.removePendingNotificationRequests(withIdentifiers: existingIds)
            self.removeDeliveredFallbacks()

            alarms.forEach { self.scheduleFallback(for: $0) }
        }
    }

    func rescheduleFallback(for alarm: Alarm) {
        cancelFallback(for: alarm.id) { [weak self] in
            self?.scheduleFallback(for: alarm)
        }
    }

    func cancelFallback(for alarmId: String?, completion: (() -> Void)? = nil) {
        guard let alarmId, !alarmId.isEmpty else {
            completion?()
            return
        }

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

    private func scheduleFallback(for alarm: Alarm) {
        guard alarm.isOn else { return }

        if let targetDate = alarm.targetDate, !targetDate.isEmpty {
            scheduleOneTimeFallback(for: alarm, targetDate: targetDate)
            return
        }

        Set(alarm.repeatDays).forEach { day in
            scheduleWeeklyFallback(for: alarm, weekday: day)
        }
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

        for ringIndex in 0..<ringCount {
            let ringDate = fireDate.addingTimeInterval(TimeInterval(ringIndex) * ringRepeatInterval)
            let components = Calendar.current.dateComponents(
                [.year, .month, .day, .hour, .minute, .second],
                from: ringDate
            )

            let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
            addNotification(
                identifier: "\(fallbackPrefix(for: alarm.id))once-\(ringIndex)",
                alarm: alarm,
                trigger: trigger
            )
        }
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

        let firstFireDate = alarmDate.addingTimeInterval(fallbackDelay)

        for ringIndex in 0..<ringCount {
            let ringDate = firstFireDate.addingTimeInterval(TimeInterval(ringIndex) * ringRepeatInterval)
            let components = calendar.dateComponents([.weekday, .hour, .minute, .second], from: ringDate)
            let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)

            addNotification(
                identifier: "\(fallbackPrefix(for: alarm.id))weekday-\(weekday)-\(ringIndex)",
                alarm: alarm,
                trigger: trigger
            )
        }
    }

    private func addNotification(
        identifier: String,
        alarm: Alarm,
        trigger: UNCalendarNotificationTrigger
    ) {
        let content = UNMutableNotificationContent()
        content.title = "\(alarm.role) 전화"
        content.body = "인터넷 전화가 도착하지 않아 로컬 알림을 울렸어요."
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
