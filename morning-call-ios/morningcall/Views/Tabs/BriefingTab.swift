//
//  Untitled.swift
//  morningcall
//
//  Created by 박원빈 on 9/5/25.
//

import SwiftUI

struct BriefingView: View {
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
                    VStack(alignment: .leading) {
                        HStack {
                            Spacer()
                            WeatherSection()
                            Spacer()
                        }
                        Text("오늘의 일정")
                            .font(.title)
                            .fontWeight(.bold)
                            .padding(.top, 24)
                            .padding(.bottom, 16)
                        EventSection()
                    }
                    .listRowSeparator(.hidden)
                    NewsSection()
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                    
                }
            }
            .listRowSeparator(.hidden)
            .listStyle(.plain)
            .navigationTitle(formatter.string(from: now))
        }
    }
}
