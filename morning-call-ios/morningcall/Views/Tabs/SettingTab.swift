//
//  SettingView.swift
//  morningcall
//
//  Created by 박원빈 on 9/5/25.
//

import SwiftUI

struct UserSettings: Codable {
    var name: String
    var language: String       // "ko", "en" 같은 코드
    var topic: String          // "korea-top", "world", ...
    enum CodingKeys: String, CodingKey {
            case name
            case language
            case topic = "interest"   // 서버 JSON 키 -> topic에 매핑
        }
}

struct LiveKitInfo: Codable {
    var lkToken: String
    var lkUrl: String
}

struct SettingView: View {
    @State private var alarms: [Alarm] = []
    @State private var editingAlarm: Alarm? = nil
    @State private var showingTestCallSheet = false
    @State private var isLoading = false
    
    @EnvironmentObject var authVM: AuthViewModel
    @StateObject private var googleHelper = GoogleSignInHelper()
    @EnvironmentObject var env: AppEnvironment

    // 새로 추가되는 상태들
    @State private var userName: String = ""
    @State private var selectedLanguage: String = "한국어"
    @State private var selectedTopic: String = ""   // 하나만 선택

    @State private var isSettingsLoading = false   // 설정용 로딩

    private let languageOptions: [(code: String, label: String)] = [
        ("한국어", "한국어"),
        ("English", "English")
    ]
    
    /// 서버에서 쓰는 topic 코드 (id로 사용)
    private let newsTopics: [String] = [
        "korea-top",
        "world",
        "business",
        "tech",
        "health",
        "sport",
        "entertainment",
        "politics"
    ]
    
    /// 화면에 보여줄 라벨 (원하면 더 이쁘게 매핑 가능)
    private func topicLabel(_ code: String) -> String {
        switch code {
        case "korea-top": return "한국 뉴스"
        case "world": return "세계"
        case "business": return "경제"
        case "tech": return "IT/과학"
        case "health": return "건강"
        case "sport": return "스포츠"
        case "entertainment": return "연예"
        case "politics": return "정치"
        default: return code
        }
    }
    
    var body: some View {
        NavigationView {
            List {
                // 프로필 / 이름 설정
                Section(header: Text("프로필")) {
                    TextField("이름", text: $userName)
                        .textInputAutocapitalization(.never)
                        .onSubmit { saveProfile() }
                }
                // 언어 설정
                Section(header: Text("통화 시 언어")) {
                    Picker("언어", selection: $selectedLanguage) {
                        ForEach(languageOptions, id: \.code) { lang in
                            Text(lang.label)
                                .tag(lang.code)
                        }
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: selectedLanguage) { _ in
                        saveProfile()
                    }
                }
                
                // 뉴스 관심 주제 설정 (단일 선택)
                Section(header: Text("뉴스 관심 주제")) {
                    ForEach(newsTopics, id: \.self) { topic in
                        HStack {
                            Text(topicLabel(topic))
                            Spacer()
                            if selectedTopic == topic {
                                Image(systemName: "checkmark")
                            }
                        }
                        .contentShape(Rectangle())
                        .onTapGesture {
                            toggleTopic(topic)
                        }
                    }
                }

                Section(header: Text("구글 캘린더")) {
                    Button("캘린더 연동 다시 하기") {
                        googleHelper.signInForCalendar()
                    }
                    Text("대화 중 약속이 나오면 Haru가 바로 일정에 추가할 수 있어요.")
                        .font(.caption)
                        .foregroundColor(.gray)
                }

                Button("로그아웃") {
                    authVM.signOut()
                }
                .frame(maxWidth: .infinity, alignment: .center)
                .foregroundColor(.red)
                
                // 캘린더 연동 / 로그아웃
                // TODO: 일정 가져오는 쪽으로 옮겨야될듯...? 일정 조회시 에러 나면 연동하기 버튼 띄우는 쪽으로 -> API 부터 수정해야됨;;
//                    Button("캘린더 연동하기") {
//                        googleHelper.signInForCalendar()
//                    }
//                    .padding(.vertical, 8)
//                    .frame(maxWidth: .infinity, alignment: .center)
//                    
//                    if let token = googleHelper.accessToken {
//                        Text("✅ 연동 완료!")
//                        Text("AccessToken: \(token)")
//                            .font(.caption)
//                            .lineLimit(2)
//                    }
            }
            .listStyle(.insetGrouped)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showingTestCallSheet = true }) {
                        Image(systemName: "phone.fill")
                    }
                }
            }
            .sheet(isPresented: $showingTestCallSheet) {
                TestCallView()
            }
            .navigationTitle("설정")
            .task {
                loadInitialSettings()
            }
        }
    }
    
    // MARK: - 설정 관련 helper
    
    /// 단일 선택: 이미 선택된 걸 다시 누르면 해제, 아니면 교체
    private func toggleTopic(_ topic: String) {
        if selectedTopic == topic {
            selectedTopic = ""
        } else {
            selectedTopic = topic
        }
        saveProfile();
    }
    
    
    private func saveProfile() {
        let body: [String: Any] = [
            "name": userName,
            "language": selectedLanguage,
            "interest": selectedTopic   // ✅ 여기 interest로 보내기
        ]
        
        APIClient.request(path: "/user", method: .PUT, body: body) { (result: Result<UserSettings, Error>) in
            DispatchQueue.main.async {
                switch result {
                case .success(let updated):
                    env.user?.name = userName
                    env.user?.language = selectedLanguage
                    env.user?.interest = selectedTopic
                    print("✅ 사용자 설정 저장 완료: \(updated)")
                case .failure(let error):
                    print("❌ 사용자 설정 저장 실패: \(error)")
                }
            }
        }
    }
    
    private func loadInitialSettings() {
        self.userName = env.user?.name ?? ""
        self.selectedLanguage = env.user?.language ?? ""
        self.selectedTopic = env.user?.interest ?? ""
    }
}
