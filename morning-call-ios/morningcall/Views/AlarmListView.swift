//
//  AlarmListView.swift
//  morningcall
//
//  Created by 박원빈 on 7/12/25.
//

import SwiftUI

struct AlarmListView: View {
    @State private var alarms: [Alarm] = []
    @State private var editingAlarm: Alarm? = nil
    @State private var showingAddSheet = false
    @State private var isLoading = false
    
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var googleHelper = GoogleSignInHelper()
    @EnvironmentObject var env: AppEnvironment

    let now: Date = Date()
    let formatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = .current          // 👉 시스템 로케일 따라감
        f.dateFormat = "M월 d일 (E)" // 포맷만 지정
        return f
    }()
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
                    AlarmTabView()
                        .tabItem {
                            Label("알람", systemImage: "alarm.fill")
                        }
                        .tag(0)

                    BriefingView()
                        .tabItem {
                            Label("브리핑", systemImage: "text.rectangle.page.fill")
                        }
                        .tag(1)

                    SettingView() // 여기에 이제 설정 페이지를 연결해주자 유저설정페이지를 연결
                        .tabItem {
                            Label("설정", systemImage: "gearshape.fill")
                        }
                        .tag(2)
                }
    }
    
    private func updateAlarms(alarm: Alarm) {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        
        APIClient.request(path: "/alarm/\(alarm.id)", method: .PUT, body: [
            "time": alarm.time,
            "timeZone": TimeZone.current.identifier,
            "repeatDays": alarm.repeatDays,
            "isOn": alarm.isOn,
            "wakeIntensity": alarm.wakeIntensity
        ]) { (result: Result<Alarm, Error>) in
            DispatchQueue.main.async {
                switch result {
                case .success(_):
                    print("✅ 알람 수정 완료")
                case .failure(let error):
                    print("❌ 알람 편집 실패: \(error)")
                }
            }
        }
    }

    private func deleteAlarms(at offsets: IndexSet) {
        for index in offsets {
            let alarmToDelete = alarms[index]
            let id = alarmToDelete.id
            
            APIClient.requestVoid(path: "/alarm/\(id)", method: .DELETE) { (result: Result<Void, Error>) in
                DispatchQueue.main.async {
                    switch result {
                    case .success():
                        print("✅ 알람 삭제 완료")
                    case .failure(let error):
                        print("❌ 알람 삭제 실패: \(error)")
                    }
                }
            }
        }
        alarms.remove(atOffsets: offsets)
    }
    
    private func repeatDaysText(_ days: [Int]) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "ko_KR")
        let shortWeekdays = formatter.shortWeekdaySymbols ?? []
        return days.sorted().map { shortWeekdays[$0] }.joined(separator: ", ")
    }

    private func loadAlarms() {
        isLoading = true

        APIClient.request(path: "/alarm", method: .GET) { (result: Result<[Alarm], Error>) in
            DispatchQueue.main.async {
                switch result {
                case .success(let data):
                    self.alarms = data
                case .failure(let error):
                    print("❌ 알람 가져오기 실패: \(error)")
                }
                self.isLoading = false
            }
        }
    }
}
