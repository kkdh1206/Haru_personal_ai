//
//  AlarmTab.swift
//  morningcall
//
//  Created by 박원빈 on 9/5/25.
//

import SwiftUI

struct AlarmTabView: View {
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
    
    var body: some View {
        NavigationView {
            List {
                if isLoading {
                    ProgressView()
                } else {
                    ForEach(alarms) { alarm in
                        Button(action: {
                            editingAlarm = alarm
                        }) {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(alarm.time)
                                        .font(.system(size: 52, weight: .light))
                                        .foregroundColor(alarm.isOn ? .primary : .gray)
                                    if !alarm.repeatDays.isEmpty {
                                        Text(repeatDaysText(alarm.repeatDays))
                                            .font(.subheadline)
                                            .foregroundColor(alarm.isOn ? .primary : .gray)
                                    }
                                }
                                Spacer()
                                Toggle("", isOn: Binding(
                                    get: { alarm.isOn },
                                    set: { isOn in
                                        if let index = alarms.firstIndex(of: alarm) {
                                            alarms[index].isOn = isOn
                                            updateAlarms(alarm: alarms[index])
                                        }
                                    }
                                ))
                                .tint(.blue)
                                .labelsHidden()
                            }
                            .padding(.vertical, 8)
                        }
                    }
                    .onDelete(perform: deleteAlarms)
//                    Section {
//                            Button("캘린더 연동하기") {
//                                            googleHelper.signInForCalendar()
//                                        }
//                                        .padding()
//                                        .background(Color.blue)
//                                        .foregroundColor(.white)
//                                        .clipShape(Capsule())
//
//                                        if let token = googleHelper.accessToken {
//                                            Text("✅ 연동 완료!")
//                                            Text("AccessToken: \(token)")
//                                                .font(.caption)
//                                                .lineLimit(2)
//                                        }
//                        Button("Haru Test Call") {
//                            CallManager().HaruTest() // 근데 동작안하긴함
//                        }
//                        .padding()
//                        .background(Color.black)
//                        .foregroundColor(.white)
//                        .clipShape(Capsule())
//
//                            Button("로그아웃") {
//                                authVM.signOut()
//                            }
//                            .foregroundColor(.red)
//
//                    }
//                    .listRowBackground(Color.clear)
//                    
                }
            }
            .listStyle(.plain)
            .navigationTitle("알람")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showingAddSheet = true }) {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingAddSheet) {
                AlarmEditView { time, repeatDays, wakeIntensity in
                    Task {
                        let formatter = DateFormatter()
                        formatter.dateFormat = "HH:mm"

                        APIClient.request(path: "/alarm", method: .POST, body: [
                            "time": formatter.string(from: time),
                            "timeZone": TimeZone.current.identifier,
                            "repeatDays": repeatDays,
                            "isOn": true,
                            "wakeIntensity": wakeIntensity
                        ]) { (result: Result<Alarm, Error>) in
                            DispatchQueue.main.async {
                                switch result {
                                case .success(let alarm):
                                    alarms.append(alarm)
                                case .failure(let error):
                                    print("❌ 알람 추가 실패: \(error)")
                                }
                            }
                        }
                    }
                }
            }
            .task {
                loadAlarms()
            }
            .sheet(item: $editingAlarm) { alarm in
                AlarmEditView(
                    alarm: alarm,
                    onSave: { updatedTime, updatedRepeatDays, updatedWakeIntensity in
                        if let index = alarms.firstIndex(where: { $0.id == alarm.id }) {
                            let formatter = DateFormatter()
                            formatter.dateFormat = "HH:mm"

                            alarms[index].time = formatter.string(from: updatedTime)
                            alarms[index].repeatDays = updatedRepeatDays
                            alarms[index].wakeIntensity = updatedWakeIntensity
                            alarms[index].personality = updatedWakeIntensity
                            alarms[index].role = "하루"
                            alarms[index].voice = "Leda"

                            updateAlarms(alarm: alarms[index])
                        }
                    },
                    onDelete: {
                        if let index = alarms.firstIndex(where: { $0.id == alarm.id }) {
                            APIClient.requestVoid(path: "/alarm/\(alarms[index].id)", method: .DELETE) { (result: Result<Void, Error>) in
                                DispatchQueue.main.async {
                                    switch result {
                                    case .success():
                                        print("✅ 알람 삭제 완료")
                                    case .failure(let error):
                                        print("❌ 알람 삭제 실패: \(error)")
                                    }
                                }
                            }
                            alarms.remove(at: index)
                        }
                    }
                )
                .id(alarm.id)
            }
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
