//
//  WeatherSection.swift
//  morningcall
//
//  Created by 박원빈 on 8/30/25.
//

import SwiftUI

struct WeatherSection: View {
    @State private var weather: Weather? = nil
    @EnvironmentObject var env: AppEnvironment

    var body: some View {
        VStack(alignment: .leading) {
//            Text("오늘의 날씨")
//                .font(.title)
//                .fontWeight(.bold)
//                .padding(.top, 8)
//                .padding(.bottom, 16)
            if let w = weather {
                VStack(alignment: .center, spacing: 4) {
                    Text(env.user?.location ?? "서울특별시")
                        .font(.headline)
                        .padding(.top, 16)
                        .padding(.bottom, 8)
                    // 온도 반올림하여 정수 표시
                    Text("\(Int(w.temperature.rounded()))°C")
                        .font(.system(size: 52, weight: .bold))
                        .fontWeight(.bold)
                    HStack(spacing: 8) {
                        // OpenWeatherMap 아이콘
                        if let url = URL(string: "https://openweathermap.org/img/wn/\(w.icon)@2x.png") {
                            AsyncImage(url: url) { phase in
                                switch phase {
                                case .empty:
                                    ProgressView()
                                        .frame(width: 40, height: 40)
                                case .success(let image):
                                    image
                                        .resizable()
                                        .scaledToFit()
                                        .frame(width: 40, height: 40)
                                case .failure(_):
                                    Image(systemName: "cloud")
                                        .font(.title2)
                                        .frame(width: 40, height: 40)
                                @unknown default:
                                    EmptyView()
                                }
                            }
                        }
                        Text(w.weather)
                            .font(.headline)
                            .fontWeight(.bold)
                            .padding(.trailing, 8)
                    }
                }
                .frame(alignment: .center) // 가운데 정렬
            }
        }
        .task {
            loadData()
        }
    }

    private func loadData() {
        guard let loc = env.user?.location, !loc.isEmpty else { return }

        APIClient.request(path: "/information/weather/\(loc)", method: .GET) { (result: Result<Weather, Error>) in
            DispatchQueue.main.async {
                switch result {
                case .success(let data):
                    self.weather = data
                case .failure(let error):
                    print("❌ 날씨 가져오기 실패: \(error)")
                }
            }
        }
    }
}
