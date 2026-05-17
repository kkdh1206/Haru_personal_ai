//
//  RequestLocationView.swift
//  morningcall
//
//  Created by 박원빈 on 7/5/25.
//

import CoreLocation
import SwiftUI

class CurrentLocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    static let shared = CurrentLocationManager()

    private let manager = CLLocationManager()
    private weak var saveEnvironment: AppEnvironment?
    private var shouldSaveToAPI = false

    @Published var cityAndProvince: String? = nil
    @Published var permissionDenied = false
    @Published var isLoading = false
    @Published var authStatus: CLAuthorizationStatus = .notDetermined

    override init() {
        super.init()
        manager.delegate = self
        authStatus = manager.authorizationStatus
    }

    func requestLocationFlow() {
        authStatus = manager.authorizationStatus
        switch authStatus {
        case .notDetermined:
            isLoading = true
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            permissionDenied = false
            isLoading = true
            manager.requestLocation()
        case .denied, .restricted:
            permissionDenied = true
        @unknown default:
            permissionDenied = true
        }
    }

    func refreshAndSaveIfAuthorized(env: AppEnvironment) {
        guard !isLoading else { return }
        authStatus = manager.authorizationStatus
        guard authStatus == .authorizedWhenInUse || authStatus == .authorizedAlways else { return }
        saveEnvironment = env
        shouldSaveToAPI = true
        permissionDenied = false
        isLoading = true
        manager.requestLocation()
    }

    func openAppSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString),
              UIApplication.shared.canOpenURL(url) else { return }
        UIApplication.shared.open(url)
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authStatus = manager.authorizationStatus
        switch authStatus {
        case .denied, .restricted:
            permissionDenied = true
            isLoading = false
        case .authorizedWhenInUse, .authorizedAlways:
            permissionDenied = false
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
                guard let placemark = placemarks?.first else { return }

                let locationName = Self.formatLocation(placemark: placemark)
                self.cityAndProvince = locationName

                if self.shouldSaveToAPI, !locationName.isEmpty {
                    self.saveEnvironment?.user?.location = locationName
                    self.saveLocation(locationName, env: self.saveEnvironment)
                }
                self.shouldSaveToAPI = false
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        DispatchQueue.main.async {
            self.isLoading = false
            self.shouldSaveToAPI = false
        }
        print("위치 가져오기 실패: \(error.localizedDescription)")
    }

    private static func formatLocation(placemark: CLPlacemark) -> String {
        let city = placemark.locality ?? placemark.subLocality ?? ""
        let province = placemark.administrativeArea ?? ""
        return [city, province]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: ", ")
    }

    private func saveLocation(_ location: String, env: AppEnvironment?) {
        APIClient.request(path: "/user/location", method: .PATCH, body: [
            "location": location,
            "timeZone": TimeZone.current.identifier
        ]) { (result: Result<UserInfo, Error>) in
            DispatchQueue.main.async {
                switch result {
                case .success(let user):
                    env?.user?.location = user.location ?? location
                    env?.user?.language = user.language
                case .failure(let error):
                    print("❌ 위치 갱신 실패: \(error)")
                }
            }
        }
    }
}

struct RequestLocationView: View {
    @EnvironmentObject var env: AppEnvironment
    @ObservedObject private var locationManager = CurrentLocationManager.shared
    @State private var showSettingsAlert = false
    @State private var isSaving = false

    private var primaryButtonTitle: String {
        if locationManager.isLoading || isSaving {
            return "위치 확인 중..."
        }
        if locationManager.cityAndProvince != nil {
            return "완료"
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
        ZStack {
            fixedBackground

            GeometryReader { proxy in
                VStack(alignment: .leading, spacing: 0) {
                    Text("2 / 2")
                        .font(.system(.headline, design: .rounded).weight(.semibold))
                        .foregroundStyle(Color.black.opacity(0.56))
                        .frame(maxWidth: .infinity, alignment: .trailing)

                    Spacer(minLength: 0)

                    VStack(alignment: .leading, spacing: 18) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("오늘 날씨를 알려드릴게요")
                                .font(.system(.title, design: .rounded).weight(.bold))
                                .foregroundStyle(Color.black.opacity(0.92))

                            Text("현재 위치는 앱을 열 때마다 한 번씩 갱신돼요.")
                                .font(.system(.subheadline, design: .rounded))
                                .foregroundStyle(Color.black.opacity(0.58))
                        }

                        locationStatusCard
                    }
                    .padding(.bottom, 116)
                }
                .padding(.horizontal, 22)
                .padding(.top, proxy.safeAreaInsets.top + 28)
                .frame(width: proxy.size.width, height: proxy.size.height)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Button(primaryButtonTitle) {
                if locationManager.cityAndProvince != nil {
                    completeOnboarding()
                } else {
                    switch locationManager.authStatus {
                    case .notDetermined, .authorizedWhenInUse, .authorizedAlways:
                        locationManager.requestLocationFlow()
                    case .denied, .restricted:
                        showSettingsAlert = true
                    @unknown default:
                        showSettingsAlert = true
                    }
                }
            }
            .disabled(locationManager.isLoading || isSaving)
            .buttonStyle(PrimaryButtonStyle())
            .padding(.horizontal, 22)
            .padding(.top, 10)
            .padding(.bottom, 30)
        }
        .alert("권한이 필요합니다",
               isPresented: $showSettingsAlert,
               actions: {
                   Button("설정 열기") { locationManager.openAppSettings() }
                   Button("취소", role: .cancel) { }
               },
               message: {
                   Text("설정 > 개인정보 보호 및 보안 > 위치 서비스에서 이 앱의 위치 접근을 허용해주세요.")
               })
        .onAppear {
            if locationManager.authStatus == .authorizedWhenInUse || locationManager.authStatus == .authorizedAlways {
                locationManager.requestLocationFlow()
            }
        }
        .preferredColorScheme(.light)
    }

    private var fixedBackground: some View {
        Image("Background_morning")
            .resizable()
            .scaledToFill()
            .frame(width: UIScreen.main.bounds.width, height: UIScreen.main.bounds.height)
            .clipped()
            .ignoresSafeArea(.all)
    }

    private var locationStatusCard: some View {
        VStack(spacing: 14) {
            Image(systemName: locationManager.cityAndProvince == nil ? "location.circle" : "location.circle.fill")
                .font(.system(size: 44, weight: .semibold))
                .foregroundStyle(Color(red: 0.49, green: 0.39, blue: 0.28))

            if locationManager.isLoading {
                ProgressView("위치 확인 중...")
                    .font(.system(.body, design: .rounded))
                    .tint(Color.black.opacity(0.72))
            } else if let location = locationManager.cityAndProvince, !location.isEmpty {
                Text(location)
                    .font(.system(.title3, design: .rounded).weight(.semibold))
                    .foregroundStyle(Color.black.opacity(0.86))
                    .multilineTextAlignment(.center)
            } else if locationManager.permissionDenied {
                Text("위치 권한이 꺼져 있어요.")
                    .font(.system(.body, design: .rounded).weight(.semibold))
                    .foregroundStyle(Color.red.opacity(0.78))
                    .multilineTextAlignment(.center)
            } else {
                Text("현재 위치 권한이 필요해요.")
                    .font(.system(.body, design: .rounded).weight(.semibold))
                    .foregroundStyle(Color.black.opacity(0.72))
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(Color.white.opacity(0.88))
                .overlay(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(Color.white.opacity(0.72), lineWidth: 1)
                )
        )
    }

    private func completeOnboarding() {
        guard let location = locationManager.cityAndProvince, !location.isEmpty else { return }
        let name = env.user?.name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !name.isEmpty else {
            env.onboardingStep = .enterName
            return
        }

        isSaving = true
        env.user?.location = location

        APIClient.request(path: "/user", method: .PUT, body: [
            "name": name,
            "location": location,
            "language": env.user?.language ?? "한국어"
        ]) { (result: Result<UserInfo, Error>) in
            DispatchQueue.main.async {
                isSaving = false
                switch result {
                case .success(let user):
                    env.user?.name = user.name ?? env.user?.name
                    env.user?.location = user.location ?? location
                    env.user?.language = user.language ?? env.user?.language
                    if (env.user?.name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "").isEmpty {
                        env.onboardingStep = .enterName
                    } else {
                        env.onboardingStep = .completed
                    }
                case .failure(let error):
                    print("❌ 유저 정보 저장 실패: \(error)")
                }
            }
        }
    }
}
