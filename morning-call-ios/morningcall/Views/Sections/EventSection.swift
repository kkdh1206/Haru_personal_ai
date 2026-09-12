//
//  WeatherSection.swift
//  morningcall
//
//  Created by 박원빈 on 8/30/25.
//

import SwiftUI
import FirebaseAuth

private struct EventCalendarStatus: Decodable {
    let connected: Bool
    let provider: CalendarProvider?
}

struct EventSection: View {
    @State private var events: [Event] = []
    @State private var isLoading = true
    @State private var loadFailed = false
    @State private var loadRequestID = UUID()
    @Environment(\.scenePhase) private var scenePhase
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
                    if isLoading {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    } else if loadFailed {
                        Button { loadData() } label: {
                            Label(localized("일정을 확인하지 못했어요. 눌러서 다시 조회해 주세요."), systemImage: "arrow.clockwise")
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                    } else if events.isEmpty {
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
        .task(id: env.user?.id) { loadData() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { loadData() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .haruCalendarDidSync)) { _ in
            loadData()
        }
    }

    private func localized(_ key: String) -> String {
        AppLocalizer.string(key, language: env.appLanguage)
    }

    // MARK: - Networking
    private func loadData() {
        let requestID = UUID()
        loadRequestID = requestID
        isLoading = true
        loadFailed = false
        guard let accountID = Auth.auth().currentUser?.uid else {
            events = []
            isLoading = false
            loadFailed = true
            return
        }
        let finish: (Result<[Event], Error>) -> Void = { result in
            DispatchQueue.main.async {
                guard loadRequestID == requestID, Auth.auth().currentUser?.uid == accountID else { return }
                isLoading = false
                switch result {
                case .success(let data):
                    apply(data)
                case .failure(let error):
                    print("❌ 일정 가져오기 실패: \(error)")
                    loadFailed = true
                }
            }
        }
        func fetch(_ provider: CalendarProvider) {
            if provider == .apple {
                AppleCalendarService.shared.fetchTodayEvents(completion: finish)
            } else {
                APIClient.request(path: "/calendar/today", method: .GET, completion: finish)
            }
        }
        if let provider = CalendarProviderStore.selected {
            fetch(provider)
            return
        }
        // A fresh login may not have opened Settings yet. Do not send Apple
        // users to the server's intentionally empty /calendar/today endpoint.
        APIClient.request(path: "/user/calendar-status", method: .GET) { (result: Result<EventCalendarStatus, Error>) in
            DispatchQueue.main.async {
                guard loadRequestID == requestID, Auth.auth().currentUser?.uid == accountID else { return }
                switch result {
                case .success(let status):
                    guard status.connected, let provider = status.provider else {
                        finish(.failure(APIError.noData))
                        return
                    }
                    CalendarProviderStore.selected = CalendarProviderStore.selected ?? provider
                    fetch(CalendarProviderStore.selected ?? provider)
                case .failure(let error):
                    finish(.failure(error))
                }
            }
        }
    }

    private func apply(_ data: [Event]) {
        let sorted = data.sorted { a, b in
            if a.isAllDay != b.isAllDay { return a.isAllDay && !b.isAllDay }
            let aStart = a.startDate ?? .distantFuture
            let bStart = b.startDate ?? .distantFuture
            return aStart < bStart
        }
        events = sorted
    }
}
