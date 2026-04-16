//
//  Alarm.swift
//  morningcall
//
//  Created by 박원빈 on 7/12/25.
//
import SwiftUI

struct Event: Identifiable, Hashable, Decodable {
    let id: String
    let summary: String
    let start: String   // "2025-09-01" 또는 "2025-09-01T19:00:00+09:00"
    let end: String     // "2025-09-01T20:00:00+09:00" 등

    /// 날짜만 오면 종일
    var isAllDay: Bool { !start.contains("T") && !end.contains("T") }

    /// 파싱된 시작/끝 (오프셋 포함한 문자열은 그 오프셋으로 파싱됨)
    var startDate: Date? { Self.parseDateFlexible(start) ?? Self.parseYyyyMMddToLocalMidnight(start) }
    var endDate: Date?   { Self.parseDateFlexible(end)   ?? Self.parseYyyyMMddToLocalMidnight(end) }

    /// 표시용 텍스트
    var timeText: String {
        guard let s = startDate, let e = endDate else { return "" }
        if isAllDay { return "종일" }

        // 같은 날이면 시간만, 아니면 날짜+시간 범위
        let cal = Calendar.autoupdatingCurrent
        if cal.isDate(s, inSameDayAs: e) {
            return "\(Self.hm.string(from: s))–\(Self.hm.string(from: e))"
        } else {
            return Self.intervalFormatter.string(from: s, to: e)
        }
    }

    // MARK: - Parsing
    /// ISO-8601(오프셋 포함/미포함, 소수초 유무) 유연 파서
    private static func parseDateFlexible(_ s: String) -> Date? {
        // 1) withFractionalSeconds 포함
        if let d = isoWithFraction.date(from: s) { return d }
        // 2) 기본 InternetDateTime
        if let d = isoNoFraction.date(from: s) { return d }
        return nil
    }

    /// "yyyy-MM-dd" → 사용자의 현재 타임존 로컬 자정
    private static func parseYyyyMMddToLocalMidnight(_ s: String) -> Date? {
        guard let d = yyyyMMdd.date(from: s) else { return nil }
        // yyyyMMdd가 00:00로 파싱되지만, timeZone은 .autoupdatingCurrent라서
        // 로컬 자정으로 해석됨
        return d
    }

    // MARK: - Formatters
    private static let isoWithFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds, .withColonSeparatorInTimeZone]
        // timeZone 지정 안 함: 문자열의 오프셋을 그대로 사용
        return f
    }()
    private static let isoNoFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withColonSeparatorInTimeZone]
        return f
    }()
    private static let yyyyMMdd: DateFormatter = {
        let f = DateFormatter()
        f.locale = .autoupdatingCurrent
        f.timeZone = .autoupdatingCurrent
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()
    private static let hm: DateFormatter = {
        let f = DateFormatter()
        f.locale = .autoupdatingCurrent
        f.timeZone = .autoupdatingCurrent
        f.dateFormat = "HH:mm"
        return f
    }()
    private static let intervalFormatter: DateIntervalFormatter = {
        let f = DateIntervalFormatter()
        f.locale = .autoupdatingCurrent
        f.timeZone = .autoupdatingCurrent
        f.dateStyle = .short
        f.timeStyle = .short
        return f
    }()
}
