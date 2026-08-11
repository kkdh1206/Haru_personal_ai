//
//  WeatherSection.swift
//  morningcall
//
//  Created by 박원빈 on 8/30/25.
//

import SwiftUI

struct EventSection: View {
    @State private var events: [Event] = []
    @EnvironmentObject var env: AppEnvironment
    let date: Date = Date()

    var body: some View {
        VStack(alignment: .leading) {
//            Text("오늘의 일정")
//                .font(.title)
//                .fontWeight(.bold)
//                .padding(.top, 8)
//                .padding(.bottom, 16)
            HStack(alignment: .top, spacing: 20) {
//                VStack(spacing: 2) {
//                    Text(Self.weekdayFormatter.string(from: date)) // 예: "토"
//                        .font(.caption.weight(.bold))
//                        .minimumScaleFactor(0.8)
//                    Text(Self.dayFormatter.string(from: date)) // 예: "16"
//                        .font(.title.weight(.bold))
//                }
//                .padding(.vertical, 16)
//                .padding(.horizontal, 24)
//                .background(.ultraThinMaterial)
//                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                VStack {
                    if events.isEmpty {
                        HStack(spacing: 8) {
                            Image(systemName: "calendar.badge.clock")
                                .foregroundStyle(.secondary)
                            Text(localized("오늘 일정이 없습니다"))
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 12)
                    } else {
                        VStack(spacing: 10) {
                            ForEach(events, id: \.id) { ev in
                                HStack(alignment: .top, spacing: 12) {
                                    Image(systemName: ev.isAllDay ? "calendar" : "clock")
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(ev.summary)
                                            .font(.headline)
                                            .lineLimit(1)
                                        Text(ev.localizedTimeText(language: env.appLanguage))
                                            .font(.subheadline)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                }
                                if ev.id != events.last?.id { Divider().opacity(0.2) }
                            }
                        }
                    }
                }
            }
        }
        .task { loadData() }
        .onReceive(NotificationCenter.default.publisher(for: .haruCalendarDidSync)) { _ in
            loadData()
        }
    }

    private func localized(_ key: String) -> String {
        AppLocalizer.string(key, language: env.appLanguage)
    }

    // MARK: - Networking
    private func loadData() {
        APIClient.request(path: "/calendar/today", method: .GET) { (result: Result<[Event], Error>) in
            DispatchQueue.main.async {
                switch result {
                case .success(let data):
                    // 정렬: 종일 먼저, 그 다음 시작 시간(파싱 실패 시 뒤로)
                    let sorted = data.sorted { a, b in
                        if a.isAllDay != b.isAllDay { return a.isAllDay && !b.isAllDay }
                        let aStart = a.startDate ?? .distantFuture
                        let bStart = b.startDate ?? .distantFuture
                        return aStart < bStart
                    }
                    self.events = sorted
                case .failure(let error):
                    print("❌ 일정 가져오기 실패: \(error)")
                    self.events = []
                }
            }
        }
    }
}
