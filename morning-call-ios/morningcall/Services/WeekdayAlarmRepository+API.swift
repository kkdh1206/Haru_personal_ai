import Foundation

extension WeekdayAlarmRepository {
    static var live: Self {
        Self(
            fetch: {
                try await withCheckedThrowingContinuation { continuation in
                    APIClient.request(path: "/alarm", method: .GET) { (result: Result<[Alarm], Error>) in
                        continuation.resume(with: result)
                    }
                }
            },
            create: { try await save($0, method: .POST) },
            update: { try await save($0, method: .PUT) },
            delete: { id in
                try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                    APIClient.requestVoid(path: "/alarm/\(id)", method: .DELETE) {
                        continuation.resume(with: $0)
                    }
                }
            }
        )
    }

    private static func save(_ alarm: Alarm, method: HTTPMethod) async throws -> Alarm {
        let body: [String: Any?] = [
            "time": alarm.time,
            "timeZone": TimeZone.autoupdatingCurrent.identifier,
            "repeatDays": alarm.repeatDays,
            "isOn": alarm.isOn,
            "wakeIntensity": alarm.wakeIntensity,
            "personality": alarm.personality,
            "voice": alarm.voice,
            "role": alarm.role,
        ]
        return try await withCheckedThrowingContinuation { continuation in
            APIClient.request(
                path: method == .POST ? "/alarm" : "/alarm/\(alarm.id)",
                method: method,
                body: body
            ) { (result: Result<Alarm, Error>) in
                continuation.resume(with: result)
            }
        }
    }
}
