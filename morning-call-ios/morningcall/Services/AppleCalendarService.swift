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

enum CalendarConnectionResult: Equatable {
    case connected
    case permissionDenied
    case permissionRestricted
    case cancelled
    case failed
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

private struct AppleCalendarQueryResponse: Decodable {
    let accepted: Bool
    let received: Int?
}

struct IncomingAppleCalendarEvent {
    let id: String
    let title: String
    let startTime: String
    let endTime: String
    let description: String?
    let location: String?
    let allDay: Bool
    let timeZone: String
}

private struct AppleCalendarDaySnapshot {
    let status: String
    let date: String
    let timeZone: String
    let calendarCount: Int
    let events: [Event]
    let emptyConfirmed: Bool

    func callPayload(requestID: String) -> [String: Any] {
        [
            "type": "calendar.today.result", "requestId": requestID,
            "status": status, "date": date, "timeZone": timeZone,
            "calendarCount": calendarCount, "emptyConfirmed": emptyConfirmed,
            "truncated": events.count > 30,
            "events": events.prefix(30).map { event in
                ["title": String(event.summary.prefix(80)), "start": event.start,
                 "end": event.end, "allDay": event.isAllDay] as [String: Any]
            },
        ]
    }
}

final class AppleCalendarService {
    static let shared = AppleCalendarService()

    private let eventStore = EKEventStore()
    private let stateQueue = DispatchQueue(label: "com.poapper.morningcall.apple-calendar-state")
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

    /// One snapshot for the connected call. No HTTP upload or persistent cache.
    func fetchMorningCallSnapshot(requestID: String, completion: @escaping (Data?) -> Void) {
        let accountID = Auth.auth().currentUser?.uid
        // After reinstall/login the server may still be connected while this
        // account's local provider preference has not yet been loaded by Settings.
        if accountID != nil, CalendarProviderStore.selected == nil {
            APIClient.request(path: "/user/calendar-status", method: .GET) {
                [weak self] (result: Result<AppleCalendarConnectionResponse, Error>) in
                guard let self else { completion(nil); return }
                guard accountID == Auth.auth().currentUser?.uid else { completion(nil); return }
                if case .success(let status) = result,
                   status.connected, status.provider == "apple",
                   CalendarProviderStore.selected == nil {
                    CalendarProviderStore.selected = .apple
                }
                self.readMorningCallSnapshot(requestID: requestID, accountID: accountID, completion: completion)
            }
            return
        }
        readMorningCallSnapshot(requestID: requestID, accountID: accountID, completion: completion)
    }

    private func readMorningCallSnapshot(requestID: String, accountID: String?, completion: @escaping (Data?) -> Void) {
        readTodaySnapshot(accountID: accountID) { snapshot in
            print("📅 Apple Calendar snapshot: status=\(snapshot.status) date=\(snapshot.date) zone=\(snapshot.timeZone) calendars=\(snapshot.calendarCount) events=\(snapshot.events.count) emptyConfirmed=\(snapshot.emptyConfirmed)")
            completion(try? JSONSerialization.data(withJSONObject: snapshot.callPayload(requestID: requestID)))
        }
    }

    /// UI and calls use the same local-day query. A read uses a new store after
    /// authorization, independent of the store used for permission and writes.
    private func readTodaySnapshot(
        accountID: String?,
        attempt: Int = 0,
        completion: @escaping (AppleCalendarDaySnapshot) -> Void
    ) {
        stateQueue.async { [weak self] in
            guard let self else { return }
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = .autoupdatingCurrent
            let start = calendar.startOfDay(for: Date())
            let end = calendar.date(byAdding: .day, value: 1, to: start)!
            func finish(_ status: String, calendars: Int = 0, events: [Event] = []) {
                completion(AppleCalendarDaySnapshot(
                    status: status,
                    date: self.dayString(from: start, timeZone: calendar.timeZone),
                    timeZone: calendar.timeZone.identifier,
                    calendarCount: calendars, events: events,
                    emptyConfirmed: status == "ok" && events.isEmpty && attempt > 0
                ))
            }
            if accountID == nil || accountID != Auth.auth().currentUser?.uid
                || CalendarProviderStore.selected != .apple {
                finish("not_connected")
                return
            }
            guard self.hasFullAccess else { finish("permission_denied"); return }

            let readStore = EKEventStore()
            let calendars = readStore.calendars(for: .event)
            let predicate = readStore.predicateForEvents(withStart: start, end: end, calendars: calendars)
            let events: [Event] = calendars.isEmpty ? [] : readStore.events(matching: predicate)
                .sorted { $0.startDate < $1.startDate }
                .map { event in
                    let values = self.eventValues(event)
                    return Event(id: values.id, summary: values.title, start: values.start, end: values.end)
                }
            if events.isEmpty && attempt == 0 {
                readStore.refreshSourcesIfNecessary()
                self.stateQueue.asyncAfter(deadline: .now() + 0.5) {
                    self.readTodaySnapshot(accountID: accountID, attempt: 1, completion: completion)
                }
                return
            }
            guard accountID == Auth.auth().currentUser?.uid,
                  CalendarProviderStore.selected == .apple else { finish("not_connected"); return }
            guard self.hasFullAccess else { finish("permission_denied"); return }
            // No readable calendars is a loading problem, not an empty day.
            finish(calendars.isEmpty ? "no_calendars" : "ok", calendars: calendars.count, events: events)
        }
    }

    func connect(completion: @escaping (CalendarConnectionResult) -> Void) {
        switch EKEventStore.authorizationStatus(for: .event) {
        case .fullAccess, .authorized:
            registerConnection(completion: completion)
        case .notDetermined, .writeOnly:
            requestFullAccess(completion: completion)
        case .denied:
            complete(.permissionDenied, completion: completion)
        case .restricted:
            complete(.permissionRestricted, completion: completion)
        @unknown default:
            complete(.failed, completion: completion)
        }
    }

    private func requestFullAccess(
        completion: @escaping (CalendarConnectionResult) -> Void
    ) {
        eventStore.requestFullAccessToEvents { [weak self] granted, error in
            guard let self else {
                DispatchQueue.main.async { completion(.failed) }
                return
            }

            guard granted, error == nil else {
                switch EKEventStore.authorizationStatus(for: .event) {
                case .denied:
                    self.complete(.permissionDenied, completion: completion)
                case .restricted:
                    self.complete(.permissionRestricted, completion: completion)
                default:
                    self.complete(.failed, completion: completion)
                }
                return
            }

            self.registerConnection(completion: completion)
        }
    }

    private func registerConnection(
        completion: @escaping (CalendarConnectionResult) -> Void
    ) {
        APIClient.request(
            path: "/calendar/apple/connect",
            method: .PUT
        ) { [weak self] (result: Result<AppleCalendarConnectionResponse, Error>) in
            guard let self else {
                DispatchQueue.main.async { completion(.failed) }
                return
            }

            switch result {
            case .success(let response) where response.connected:
                DispatchQueue.main.async {
                    CalendarProviderStore.selected = .apple
                    completion(.connected)
                }
            case .success, .failure:
                self.complete(.failed, completion: completion)
            }
        }
    }

    private func complete(
        _ result: CalendarConnectionResult,
        completion: @escaping (CalendarConnectionResult) -> Void
    ) {
        DispatchQueue.main.async {
            completion(result)
        }
    }

    private func scheduleSyncAfterEventStoreChange() {
        guard CalendarProviderStore.selected == .apple else { return }
        stateQueue.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            guard self != nil else { return }
            DispatchQueue.main.async {
                NotificationCenter.default.post(name: .haruCalendarDidSync, object: nil)
            }
        }
    }

    func handleMorningCallQuery(
        requestID: String,
        rangeStart: String,
        rangeEnd: String,
        completion: @escaping (Bool) -> Void
    ) {
        guard
            CalendarProviderStore.selected == .apple,
            hasFullAccess,
            let start = Self.isoFormatterWithFraction.date(from: rangeStart)
                ?? Self.isoFormatter.date(from: rangeStart),
            let end = Self.isoFormatterWithFraction.date(from: rangeEnd)
                ?? Self.isoFormatter.date(from: rangeEnd),
            end > start
        else {
            completion(false)
            return
        }

        stateQueue.async { [weak self] in
            guard let self else {
                completion(false)
                return
            }

            let predicate = self.eventStore.predicateForEvents(
                withStart: start,
                end: end,
                calendars: nil
            )
            let events = self.eventStore.events(matching: predicate)
                .sorted { $0.startDate < $1.startDate }
                .prefix(200)
                .map(self.morningCallEventPayload)

            APIClient.request(
                path: "/calendar/apple/morning-call-events",
                method: .PUT,
                body: [
                    "requestId": requestID,
                    "events": Array(events),
                ]
            ) { (result: Result<AppleCalendarQueryResponse, Error>) in
                switch result {
                case .success(let response):
                    print("✅ 모닝콜용 Apple Calendar 일정 \(response.received ?? 0)개 전달")
                    completion(response.accepted)
                case .failure(let error):
                    print("❌ 모닝콜용 Apple Calendar 조회 전달 실패: \(error)")
                    completion(false)
                }
            }
        }
    }

    func fetchTodayEvents(completion: @escaping (Result<[Event], Error>) -> Void) {
        readTodaySnapshot(accountID: Auth.auth().currentUser?.uid) { snapshot in
            DispatchQueue.main.async {
                if snapshot.status == "ok" {
                    completion(.success(snapshot.events))
                } else {
                    completion(.failure(AppleCalendarError.readUnavailable(snapshot.status)))
                }
            }
        }
    }

    func handleCreateEventPush(
        _ incoming: IncomingAppleCalendarEvent,
        completion: @escaping (Bool) -> Void
    ) {
        guard CalendarProviderStore.selected == .apple, hasFullAccess else {
            completion(false)
            return
        }

        stateQueue.async { [weak self] in
            guard let self else {
                completion(false)
                return
            }
            do {
                _ = try self.saveIncomingEvent(incoming)
                DispatchQueue.main.async {
                    NotificationCenter.default.post(name: .haruCalendarDidSync, object: nil)
                }
                completion(true)
            } catch {
                print("❌ Apple Calendar 일정 추가 실패: \(error)")
                completion(false)
            }
        }
    }

    private func saveIncomingEvent(_ incoming: IncomingAppleCalendarEvent) throws -> String? {
        guard
            let calendar = eventStore.defaultCalendarForNewEvents,
            calendar.allowsContentModifications
        else {
            throw AppleCalendarError.noWritableCalendar
        }
        guard
            let startDate = parse(incoming.startTime, allDay: incoming.allDay, timeZone: incoming.timeZone),
            let endDate = parse(incoming.endTime, allDay: incoming.allDay, timeZone: incoming.timeZone),
            endDate > startDate
        else {
            throw AppleCalendarError.invalidDate
        }

        let marker = "[Haru-ID:\(incoming.id)]"
        if let existing = existingEvent(with: marker, startDate: startDate, endDate: endDate) {
            return existing.eventIdentifier
        }

        let event = EKEvent(eventStore: eventStore)
        event.calendar = calendar
        event.title = incoming.title
        event.startDate = startDate
        event.endDate = endDate
        event.isAllDay = incoming.allDay
        event.location = incoming.location
        event.timeZone = TimeZone(identifier: incoming.timeZone)
        event.notes = [incoming.description, marker]
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

    private func eventValues(_ event: EKEvent) -> (id: String, title: String, start: String, end: String) {
        let startValue = event.isAllDay
            ? dayString(from: event.startDate, timeZone: event.timeZone)
            : Self.isoFormatter.string(from: event.startDate)
        let endValue = event.isAllDay
            ? dayString(from: event.endDate, timeZone: event.timeZone)
            : Self.isoFormatter.string(from: event.endDate)
        let occurrenceKey = Self.isoFormatter.string(from: event.startDate)

        return (
            id: "\(event.calendarItemIdentifier)|\(occurrenceKey)",
            title: event.title?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                ? event.title!
                : "(제목 없음)",
            start: startValue,
            end: endValue
        )
    }

    private func morningCallEventPayload(_ event: EKEvent) -> [String: Any] {
        let values = eventValues(event)

        return [
            "externalId": values.id,
            "title": values.title,
            "startTime": values.start,
            "endTime": values.end,
            "location": event.location ?? "",
            "allDay": event.isAllDay
        ]
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
    case readUnavailable(String)

    var errorDescription: String? {
        switch self {
        case .invalidDate:
            return "일정의 날짜나 시간을 해석할 수 없습니다."
        case .noWritableCalendar:
            return "일정을 저장할 수 있는 Apple Calendar가 없습니다."
        case .readUnavailable(let status):
            return "Apple Calendar 조회를 완료하지 못했습니다 (\(status))."
        }
    }
}
