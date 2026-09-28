import Foundation

private enum TestFailure: Error { case expected, assertion(String) }

@MainActor
private final class MemoryRepository {
    var alarms: [Alarm]
    var nextID = 0
    var failCreateAt: Int?
    var failUpdate = false
    var failDelete = false

    init(_ alarms: [Alarm] = []) { self.alarms = alarms }

    var repository: WeekdayAlarmRepository {
        WeekdayAlarmRepository(
            fetch: { self.alarms },
            create: { alarm in
                self.nextID += 1
                if self.failCreateAt == self.nextID { throw TestFailure.expected }
                var created = alarm
                created.id = "created-\(self.nextID)"
                self.alarms.append(created)
                return created
            },
            update: { alarm in
                if self.failUpdate { throw TestFailure.expected }
                self.alarms = self.alarms.map { $0.id == alarm.id ? alarm : $0 }
                return alarm
            },
            delete: { id in
                if self.failDelete { throw TestFailure.expected }
                self.alarms.removeAll { $0.id == id }
            }
        )
    }
}

@main
struct WeekdayAlarmTests {
    @MainActor
    static func main() async throws {
        func alarm(_ id: String = "legacy", days: [Int] = [1, 2, 3, 4, 5]) -> Alarm {
            Alarm(id: id, time: "07:30", isOn: true, repeatDays: days,
                  personality: "gentle", voice: "Leda", role: "하리", wakeIntensity: "gentle")
        }
        func expect(_ condition: Bool, _ message: String) throws {
            if !condition { throw TestFailure.assertion(message) }
        }
        let template = alarm("template")

        let fresh = MemoryRepository()
        let service = WeekdayAlarmService(repository: fresh.repository)
        let weekdays: Set<Int> = [1, 2, 3, 4, 5]
        _ = try await service.configure(days: weekdays, template: template)
        try expect(fresh.alarms.count == 5 && Set(fresh.alarms.map(\.id)).count == 5,
                   "Onboarding must create five independent alarm IDs")
        try expect(fresh.alarms.allSatisfy { $0.repeatDays.count == 1 }, "Each alarm must have one weekday")
        _ = try await service.configure(days: weekdays, template: template)
        try expect(fresh.alarms.count == 5, "Retry must not duplicate alarms")
        let monday = fresh.alarms.first { $0.repeatDays == [1] }!
        _ = try await service.remove(day: 1, alarm: monday, alarms: fresh.alarms)
        try expect(fresh.alarms.count == 4 && Set(fresh.alarms.flatMap(\.repeatDays)) == [2, 3, 4, 5],
                   "Deleting Monday must preserve Tuesday through Friday")
        print("PASS independent onboarding, idempotent retry, weekday deletion")

        let legacy = MemoryRepository([template])
        let legacyService = WeekdayAlarmService(repository: legacy.repository)
        _ = try await legacyService.remove(day: 3, alarm: template, alarms: legacy.alarms)
        try expect(legacy.alarms.count == 1 && legacy.alarms[0].repeatDays == [1, 2, 4, 5],
                   "Legacy deletion must remove only the selected weekday")
        var edited = template
        edited.time = "09:00"
        _ = try await legacyService.save(day: 2, template: edited, alarms: legacy.alarms)
        try expect(legacy.alarms.first { $0.repeatDays == [2] }?.time == "09:00", "Edit must split Tuesday")
        try expect(legacy.alarms.first { $0.id == template.id }?.time == "07:30", "Other weekdays keep their time")
        print("PASS legacy grouped deletion and editing")

        let failing = MemoryRepository([template])
        failing.failUpdate = true
        do {
            _ = try await WeekdayAlarmService(repository: failing.repository)
                .save(day: 1, template: edited, alarms: failing.alarms)
            throw TestFailure.assertion("Expected split failure")
        } catch TestFailure.expected {}
        try expect(failing.alarms == [template], "Failed split must preserve original and remove new alarm")
        print("PASS failed split rollback")

        let partial = MemoryRepository()
        partial.failCreateAt = 3
        let partialService = WeekdayAlarmService(repository: partial.repository)
        do {
            _ = try await partialService.configure(days: weekdays, template: template)
            throw TestFailure.assertion("Expected partial save failure")
        } catch TestFailure.expected {}
        try expect(partial.alarms.count == 2, "Two successful saves must remain recoverable")
        partial.failCreateAt = nil
        _ = try await partialService.configure(days: weekdays, template: template)
        try expect(partial.alarms.count == 5 && Set(partial.alarms.flatMap(\.repeatDays)) == weekdays,
                   "Partial save retry must complete without duplicates")
        print("PASS partial onboarding save and retry")

        var dated = alarm("dated", days: [])
        dated.targetDate = "2026-10-01"
        let migration = MemoryRepository([template, dated])
        _ = try await WeekdayAlarmService(repository: migration.repository)
            .configure(days: [1, 4], template: edited)
        try expect(migration.alarms.contains(dated), "Dated alarms must be preserved")
        let recurring = migration.alarms.filter { $0.targetDate == nil }
        try expect(recurring.count == 2 && Set(recurring.flatMap(\.repeatDays)) == [1, 4],
                   "Resuming onboarding must split legacy alarms and respect deselected days")
        print("PASS legacy onboarding migration, deselection and dated alarm preservation")

        let failedDelete = MemoryRepository([monday])
        failedDelete.failDelete = true
        do {
            _ = try await WeekdayAlarmService(repository: failedDelete.repository)
                .remove(day: 1, alarm: monday, alarms: failedDelete.alarms)
            throw TestFailure.assertion("Expected delete failure")
        } catch TestFailure.expected {}
        try expect(failedDelete.alarms == [monday], "Failed delete must retain the alarm")
        print("PASS delete failure preserves alarm")
    }
}
