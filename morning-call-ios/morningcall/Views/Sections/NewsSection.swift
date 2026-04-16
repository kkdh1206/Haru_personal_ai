//
//  WeatherSection.swift
//  morningcall
//
//  Created by 박원빈 on 8/30/25.
//

import SwiftUI

struct NewsSection: View {
    @State private var news: [News] = []
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(alignment: .leading) {
            Text("주요 뉴스")
                .font(.title)
                .fontWeight(.bold)
                .padding(.top, 8)
                .padding(.bottom, 8)

            LazyVStack(spacing: 16) {
                ForEach(news /* 고유 id 권장: ForEach(news, id: \.id) */ , id: \.self) { item in
                    Button {
                        if let url = URL(string: item.link) {
                            openURL(url)
                        }
                    } label: {
                        HStack(alignment: .top, spacing: 10) {
                            Text(item.title)
                                .font(.body)
                                .multilineTextAlignment(.leading)
                                .lineLimit(2)
                            Spacer(minLength: 8)
                            Image(systemName: "arrow.up.right.square")
                                .font(.headline)
                                .foregroundStyle(.secondary)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.ultraThinMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    }
                    .buttonStyle(.plain)                 // 부모 제스처 간섭 최소화
                    .contentShape(Rectangle())           // 터치 영역 = 행 사각형
                }
            }
            .frame(maxWidth: .infinity, alignment: .center)
           
        }
        .task { loadData() }
    }

    private func loadData() {
        let topic = env.user?.interest ?? "korea-top"
        APIClient.request(path: "/information/news/\(topic)", method: .GET) { (result: Result<[News], Error>) in
            DispatchQueue.main.async {
                switch result {
                case .success(let data):
                    self.news = data
                case .failure(let error):
                    print("❌ 뉴스 가져오기 실패: \(error)")
                }
            }
        }
    }
}
