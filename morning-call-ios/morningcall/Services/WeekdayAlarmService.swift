import Foundation

/// Transport is injected so weekday isolation and failure recovery can be tested.
@MainActor
struct WeekdayAlarmRepository {
    var fetch: () async throws -> [Alarm]
    var create: (Alarm) async throws -> Alarm
    var update: (Alarm) async throws -> Alarm
    var delete: (String) async throws -> Void
}

@MainActor
struct WeekdayAlarmService {
    enum ValidationError: Error { case invalidWeekdays }

    let repository: WeekdayAlarmRepository

    func configure(days: Set<Int>, template: Alarm) async throws -> [Alarm] {
        guard !days.isEmpty, days.allSatisfy({ (0...6).contains($0) }) else {
            throw ValidationError.invalidWeekdays
        }
        // Reload on every retry: already saved weekdays are updated, not duplicated.
        var alarms = try await repository.fetch()
        for day in days.sorted() {
            alarms = try await save(day: day, template: template, alarms: alarms)
        }
        // Apply deselections only after all selected weekdays have been saved.
        for day in (0...6).filter({ !days.contains($0) }) {
            for alarm in alarms.filter({ isRecurring($0) && $0.repeatDays.contains(day) }) {
                alarms = try await remove(day: day, alarm: alarm, alarms: alarms)
            }
        }
        return alarms
    }

    func save(day: Int, template: Alarm, alarms: [Alarm]) async throws -> [Alarm] {
        var updated = alarms
        var desired = template
        desired.repeatDays = [day]
        desired.targetDate = nil

        guard let existing = alarms.first(where: { isRecurring($0) && $0.repeatDays.contains(day) }) else {
            updated.append(try await repository.create(desired))
            return updated
        }
        desired.id = existing.id
        if Set(existing.repeatDays) == [day] {
            let saved = try await repository.update(desired)
            return replacing(saved, in: updated)
        }

        // Create first so a failed request never erases the selected weekday.
        let created = try await repository.create(desired)
        var remaining = existing
        remaining.repeatDays.removeAll { $0 == day }
        do {
            let saved = try await repository.update(remaining)
            updated = replacing(saved, in: updated)
            updated.append(created)
            return updated
        } catch {
            // Restore the pre-edit state if splitting the legacy alarm fails.
            try await repository.delete(created.id)
            throw error
        }
    }

    func remove(day: Int, alarm: Alarm, alarms: [Alarm]) async throws -> [Alarm] {
        guard isRecurring(alarm), alarm.repeatDays.contains(day) else { return alarms }
        var remaining = alarm
        remaining.repeatDays.removeAll { $0 == day }
        if remaining.repeatDays.isEmpty {
            try await repository.delete(alarm.id)
            return alarms.filter { $0.id != alarm.id }
        }
        // Legacy multi-day alarms keep every other weekday and its settings.
        let saved = try await repository.update(remaining)
        return replacing(saved, in: alarms)
    }

    private func isRecurring(_ alarm: Alarm) -> Bool {
        (alarm.targetDate ?? "").isEmpty
    }

    private func replacing(_ alarm: Alarm, in alarms: [Alarm]) -> [Alarm] {
        alarms.map { $0.id == alarm.id ? alarm : $0 }
    }
}
