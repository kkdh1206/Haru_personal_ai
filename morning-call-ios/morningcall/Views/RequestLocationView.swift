//
//  RequestLocationView.swift
//  morningcall
//
//  Created by 박원빈 on 7/5/25.
//

import CoreLocation
import SwiftUI

class LocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    @Published var cityAndProvince: String? = nil
    @Published var permissionDenied = false
    @Published var isLoading = false
    @Published var authStatus: CLAuthorizationStatus = .notDetermined

    override init() {
        super.init()
        manager.delegate = self
        authStatus = manager.authorizationStatus
    }

    // 단일 진입점: 상태에 따라 권한/위치 요청
    func requestLocationFlow() {
        switch manager.authorizationStatus {
        case .notDetermined:
            isLoading = true
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            isLoading = true
            manager.requestLocation()
        case .denied, .restricted:
            permissionDenied = true
        @unknown default:
            permissionDenied = true
        }
    }

    func openAppSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString),
              UIApplication.shared.canOpenURL(url) else { return }
        UIApplication.shared.open(url)
    }

    // MARK: - CLLocationManagerDelegate (iOS 14+ 권장)
    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authStatus = manager.authorizationStatus
        switch authStatus {
        case .denied, .restricted:
            permissionDenied = true
            isLoading = false
        case .authorizedWhenInUse, .authorizedAlways:
            // 권한이 방금 허용되면 즉시 위치 요청
            isLoading = true
            manager.requestLocation()
        case .notDetermined:
            break
        @unknown default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.first else {
            isLoading = false
            return
        }
        CLGeocoder().reverseGeocodeLocation(location) { placemarks, _ in
            DispatchQueue.main.async {
                self.isLoading = false
                if let p = placemarks?.first {
                    let city = p.locality ?? ""
                    let province = p.administrativeArea ?? ""
                    self.cityAndProvince = "\(city), \(province)"
                }
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        DispatchQueue.main.async { self.isLoading = false }
        print("위치 가져오기 실패: \(error.localizedDescription)")
    }
}


struct RequestLocationView: View {
    @EnvironmentObject var env: AppEnvironment
    @StateObject private var locationManager = LocationManager()
    @State private var showSettingsAlert = false

    // 버튼 라벨 결정 로직
    private var primaryButtonTitle: String {
        if locationManager.isLoading {
            return "위치 확인 중..."
        }
        if locationManager.cityAndProvince != nil {
            return "계속"
        }
        switch locationManager.authStatus {
        case .notDetermined:
            return "권한 허용하기"
        case .authorizedWhenInUse, .authorizedAlways:
            return "위치 가져오기"
        case .denied, .restricted:
            return "설정에서 권한 켜기"
        @unknown default:
            return "권한 설정"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Step 2/3")
                .font(.headline)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .foregroundColor(.blue)

            Spacer()
            Text("내 위치 기반으로 날씨를 알려드릴게요")
                .font(.title).fontWeight(.bold)
            if locationManager.isLoading {
                ProgressView("위치 확인 중...")
                    .frame(maxWidth: .infinity, alignment: .center)
            } else if let location = locationManager.cityAndProvince {
                Text("\(location)")
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .center)
                    .background(Color.gray.opacity(0.1))
                    .cornerRadius(16)
            } else if locationManager.permissionDenied {
                Text("위치 권한이 거부되었습니다. 설정에서 허용해주세요.")
                    .foregroundColor(.red)
            }

            Spacer()

            // ✅ 하나로 합친 메인 버튼
            Button(primaryButtonTitle) {
                if locationManager.cityAndProvince != nil {
                    // 위치 이미 확보 → 다음 단계
                    env.user?.location = locationManager.cityAndProvince
                    env.onboardingStep = .selectInterests
                } else {
                    // 아직 위치 없음 → 상태에 맞게 처리
                    switch locationManager.authStatus {
                    case .notDetermined:
                        locationManager.requestLocationFlow()
                    case .authorizedWhenInUse, .authorizedAlways:
                        locationManager.requestLocationFlow()
                    case .denied, .restricted:
                        // 설정으로 유도
                        showSettingsAlert = true
                    @unknown default:
                        showSettingsAlert = true
                    }
                }
            }
            .disabled(locationManager.isLoading)
            .buttonStyle(PrimaryButtonStyle())
            .alert("권한이 필요합니다",
                   isPresented: $showSettingsAlert,
                   actions: {
                       Button("설정 열기") { locationManager.openAppSettings() }
                       Button("취소", role: .cancel) { }
                   },
                   message: {
                       Text("‘설정 > 개인정보 보호 및 보안 > 위치 서비스’에서 이 앱의 위치 접근을 허용해주세요.")
                   })

            // 선택적: 건너뛰기 유지
            Button("건너뛰기") {
                env.onboardingStep = .selectInterests
            }
            .buttonStyle(SecondaryButtonStyle())
        }
        .padding()
    }
}
