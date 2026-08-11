import EventKit
import FirebaseAuth
import Foundation

enum CalendarProvider: String, Codable {
    case google
    case apple

    var displayName: String {
        switch self {
        case .google: return "Google Calendar"
        case .apple: return "Apple Calendar"
        }
    }
}

enum CalendarProviderStore {
    private static let keyPrefix = "haru.calendar-provider"

    private static var key: String? {
        guard let uid = Auth.auth().currentUser?.uid else { return nil }
        return "\(keyPrefix).\(uid)"
    }

    static var selected: CalendarProvider? {
        get {
            guard
                let key,
                let value = UserDefaults.standard.string(forKey: key)
            else { return nil }
            return CalendarProvider(rawValue: value)
        }
        set {
            guard let key else { return }
            if let newValue {
                UserDefaults.standard.set(newValue.rawValue, forKey: key)
            } else {
                UserDefaults.standard.removeObject(forKey: key)
            }
        }
    }
}

extension Notification.Name {
    static let haruCalendarDidSync = Notification.Name("haru.calendar-did-sync")
}

private struct AppleCalendarConnectionResponse: Decodable {
    let connected: Bool
    let provider: String?
}

private struct AppleCalendarSyncResponse: Decodable {
    let synced: Int
    let syncedAt: String
}

private struct PendingAppleCalendarEvent: Decodable {
    let id: String
    let title: String
    let startTime: String
    let endTime: String
    let description: String?
    let location: String?
    let allDay: Bool
    let timeZone: String
}

private struct PendingAppleCalendarCompletionResponse: Decodable {
    let completed: Bool
}

final class AppleCalendarService {
    static let shared = AppleCalendarService()

    private let eventStore = EKEventStore()
    private let stateQueue = DispatchQueue(label: "com.poapper.morningcall.apple-calendar-state")
    private var isSyncing = false
    private var eventStoreObserver: NSObjectProtocol?

    private init() {
        eventStoreObserver = NotificationCenter.default.addObserver(
            forName: .EKEventStoreChanged,
            object: eventStore,
            queue: nil
        ) { [weak self] _ in
            self?.scheduleSyncAfterEventStoreChange()
        }
    }

    var hasFullAccess: Bool {
        EKEventStore.authorizationStatus(for: .event) == .fullAccess
    }

    func connect(completion: @escaping (Bool) -> Void) {
        eventStore.requestFullAccessToEvents { [weak self] granted, error in
            guard let self, granted, error == nil else {
                DispatchQueue.main.async { completion(false) }
                return
            }

            APIClient.request(
                path: "/calendar/apple/connect",
                method: .PUT
            ) { (result: Result<AppleCalendarConnectionResponse, Error>) in
                switch result {
                case .success(let response) where response.connected:
                    CalendarProviderStore.selected = .apple
                    self.syncIfNeeded { _ in
                        DispatchQueue.main.async { completion(true) }
                    }
                case .success, .failure:
                    DispatchQueue.main.async { completion(false) }
                }
            }
        }
    }

    func syncIfNeeded(completion: @escaping (Bool) -> Void = { _ in }) {
        guard CalendarProviderStore.selected == .apple, hasFullAccess else {
            completion(false)
            return
        }

        stateQueue.async { [weak self] in
            guard let self else {
                completion(false)
                return
            }
            guard !self.isSyncing else {
                completion(true)
                return
            }
            self.isSyncing = true
            self.processPendingEvents {
                self.uploadEventSnapshot { success in
                    self.stateQueue.async {
                        self.isSyncing = false
                        DispatchQueue.main.async {
                            if success {
                                NotificationCenter.default.post(name: .haruCalendarDidSync, object: nil)
                            }
                            completion(success)
                        }
                    }
                }
            }
        }
    }

    func handleCalendarPush(completion: @escaping (Bool) -> Void) {
        syncIfNeeded(completion: completion)
    }

    private func scheduleSyncAfterEventStoreChange() {
        guard CalendarProviderStore.selected == .apple else { return }
        stateQueue.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.syncIfNeeded()
        }
    }

    private func processPendingEvents(completion: @escaping () -> Void) {
        APIClient.request(
            path: "/calendar/apple/pending",
            method: .GET
        ) { [weak self] (result: Result<[PendingAppleCalendarEvent], Error>) in
            guard let self else {
                completion()
                return
            }
            self.stateQueue.async {
                switch result {
                case .success(let events):
                    self.processPendingEvents(events, index: 0, completion: completion)
                case .failure(let error):
                    print("❌ Apple Calendar 대기 일정 조회 실패: \(error)")
                    completion()
                }
            }
        }
    }

    private func processPendingEvents(
        _ events: [PendingAppleCalendarEvent],
        index: Int,
        completion: @escaping () -> Void
    ) {
        guard index < events.count else {
            completion()
            return
        }

        let pending = events[index]
        do {
            let identifier = try savePendingEvent(pending)
            completePendingEvent(pending.id, success: true, eventIdentifier: identifier) {
                self.processPendingEvents(events, index: index + 1, completion: completion)
            }
        } catch {
            completePendingEvent(
                pending.id,
                success: false,
                errorMessage: error.localizedDescription
            ) {
                self.processPendingEvents(events, index: index + 1, completion: completion)
            }
        }
    }

    private func savePendingEvent(_ pending: PendingAppleCalendarEvent) throws -> String? {
        guard
            let calendar = eventStore.defaultCalendarForNewEvents,
            calendar.allowsContentModifications
        else {
            throw AppleCalendarError.noWritableCalendar
        }
        guard
            let startDate = parse(pending.startTime, allDay: pending.allDay, timeZone: pending.timeZone),
            let endDate = parse(pending.endTime, allDay: pending.allDay, timeZone: pending.timeZone)
        else {
            throw AppleCalendarError.invalidDate
        }

        let marker = "[Haru-ID:\(pending.id)]"
        if let existing = existingEvent(with: marker, startDate: startDate, endDate: endDate) {
            return existing.eventIdentifier
        }

        let event = EKEvent(eventStore: eventStore)
        event.calendar = calendar
        event.title = pending.title
        event.startDate = startDate
        event.endDate = endDate
        event.isAllDay = pending.allDay
        event.location = pending.location
        event.timeZone = TimeZone(identifier: pending.timeZone)
        event.notes = [pending.description, marker]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n\n")

        try eventStore.save(event, span: .thisEvent, commit: true)
        return event.eventIdentifier
    }

    private func existingEvent(with marker: String, startDate: Date, endDate: Date) -> EKEvent? {
        let predicate = eventStore.predicateForEvents(
            withStart: startDate.addingTimeInterval(-86_400),
            end: endDate.addingTimeInterval(86_400),
            calendars: nil
        )
        return eventStore.events(matching: predicate).first { $0.notes?.contains(marker) == true }
    }

    private func completePendingEvent(
        _ id: String,
        success: Bool,
        eventIdentifier: String? = nil,
        errorMessage: String? = nil,
        completion: @escaping () -> Void
    ) {
        var body: [String: Any?] = ["success": success]
        body["eventIdentifier"] = eventIdentifier
        body["errorMessage"] = errorMessage

        APIClient.request(
            path: "/calendar/apple/pending/\(id)",
            method: .PATCH,
            body: body
        ) { (result: Result<PendingAppleCalendarCompletionResponse, Error>) in
            if case .failure(let error) = result {
                print("❌ Apple Calendar 일정 처리 응답 실패: \(error)")
            }
            self.stateQueue.async {
                completion()
            }
        }
    }

    private func uploadEventSnapshot(completion: @escaping (Bool) -> Void) {
        let calendar = Calendar.autoupdatingCurrent
        let now = Date()
        let start = calendar.date(byAdding: .day, value: -1, to: calendar.startOfDay(for: now)) ?? now
        let end = calendar.date(byAdding: .day, value: 45, to: start) ?? now.addingTimeInterval(45 * 86_400)
        let predicate = eventStore.predicateForEvents(withStart: start, end: end, calendars: nil)
        let events = eventStore.events(matching: predicate)
        let payload = events.prefix(2000).map(eventPayload)

        APIClient.request(
            path: "/calendar/apple/events",
            method: .PUT,
            body: ["events": payload]
        ) { (result: Result<AppleCalendarSyncResponse, Error>) in
            switch result {
            case .success(let response):
                print("✅ Apple Calendar 일정 \(response.synced)개 동기화")
                completion(true)
            case .failure(let error):
                print("❌ Apple Calendar 동기화 실패: \(error)")
                completion(false)
            }
        }
    }

    private func eventPayload(_ event: EKEvent) -> [String: Any] {
        let startValue = event.isAllDay
            ? dayString(from: event.startDate, timeZone: event.timeZone)
            : Self.isoFormatter.string(from: event.startDate)
        let endValue = event.isAllDay
            ? dayString(from: event.endDate, timeZone: event.timeZone)
            : Self.isoFormatter.string(from: event.endDate)
        let occurrenceKey = Self.isoFormatter.string(from: event.startDate)

        return [
            "externalId": "\(event.calendarItemIdentifier)|\(occurrenceKey)",
            "title": event.title?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                ? event.title!
                : "(제목 없음)",
            "startTime": startValue,
            "endTime": endValue,
            "description": sanitizedNotes(event.notes),
            "location": event.location ?? "",
            "allDay": event.isAllDay,
            "calendarTitle": event.calendar.title
        ]
    }

    private func sanitizedNotes(_ notes: String?) -> String {
        guard let notes else { return "" }
        return notes
            .replacingOccurrences(
                of: #"\n*\[Haru-ID:[^\]]+\]"#,
                with: "",
                options: .regularExpression
            )
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func dayString(from date: Date, timeZone: TimeZone?) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone ?? .autoupdatingCurrent
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private func parse(_ value: String, allDay: Bool, timeZone: String) -> Date? {
        if allDay {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(identifier: timeZone) ?? .autoupdatingCurrent
            formatter.dateFormat = "yyyy-MM-dd"
            return formatter.date(from: value)
        }
        if let date = Self.isoFormatterWithFraction.date(from: value) {
            return date
        }
        return Self.isoFormatter.date(from: value)
    }

    private static let isoFormatter = ISO8601DateFormatter()
    private static let isoFormatterWithFraction: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}

private enum AppleCalendarError: LocalizedError {
    case invalidDate
    case noWritableCalendar

    var errorDescription: String? {
        switch self {
        case .invalidDate:
            return "일정의 날짜나 시간을 해석할 수 없습니다."
        case .noWritableCalendar:
            return "일정을 저장할 수 있는 Apple Calendar가 없습니다."
        }
    }
}
