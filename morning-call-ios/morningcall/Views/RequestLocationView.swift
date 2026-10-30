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
            cityAndProvince = nil
            isLoading = true
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            permissionDenied = false
            isLoading = true
            manager.requestLocation()
        case .denied, .restricted:
            permissionDenied = true
            cityAndProvince = nil
            isLoading = false
        @unknown default:
            permissionDenied = true
            isLoading = false
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

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authStatus = manager.authorizationStatus
        switch authStatus {
        case .denied, .restricted:
            permissionDenied = true
            cityAndProvince = nil
            shouldSaveToAPI = false
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

        CLGeocoder().reverseGeocodeLocation(location, preferredLocale: Locale(identifier: "en_US")) { placemarks, _ in
            DispatchQueue.main.async {
                self.isLoading = false
                defer { self.shouldSaveToAPI = false }
                guard self.manager.authorizationStatus == .authorizedWhenInUse ||
                      self.manager.authorizationStatus == .authorizedAlways else {
                    return
                }
                guard let placemark = placemarks?.first else { return }

                let locationName = Self.formatLocation(placemark: placemark)
                self.cityAndProvince = locationName.isEmpty ? nil : locationName

                if self.shouldSaveToAPI, !locationName.isEmpty {
                    self.saveEnvironment?.user?.location = locationName
                    self.saveLocation(locationName, env: self.saveEnvironment)
                }
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
        let country = placemark.isoCountryCode ?? ""
        return [city, province, country]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: ", ")
    }

    private func saveLocation(_ location: String, env: AppEnvironment?) {
        APIClient.request(path: "/user/location", method: .PATCH, body: [
            "location": location,
            "timeZone": TimeZone.autoupdatingCurrent.identifier
        ]) { (result: Result<UserInfo, Error>) in
            DispatchQueue.main.async {
                switch result {
                case .success(let user):
                    env?.user?.location = user.location ?? location
                    env?.user?.language = user.language
                    env?.user?.speechStyle = user.speechStyle
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
    @State private var hasRequestedLocation = false
    @State private var isSaving = false
    @State private var showSaveError = false

    private var primaryButtonTitle: String {
        if locationManager.isLoading || isSaving {
            return "위치 확인 중..."
        }
        return "다음"
    }

    var body: some View {
        OnboardingLayout(step: .requestLocation) {
            VStack(alignment: .leading, spacing: 24) {
                OnboardingHeading(
                    title: "아침 날씨도 함께 알려드릴까요?",
                    subtitle: "위치를 연결하면 모닝콜에 우리 동네 날씨를 담아드려요."
                )

                locationStatusCard
                Text(LocalizedStringKey(locationManager.authStatus == .notDetermined
                    ? "다음을 누르면 위치 접근 여부를 선택할 수 있어요. 허용하지 않아도 모닝콜을 이용할 수 있어요."
                    : "위치는 날씨 브리핑에 사용해요. 위치 없이도 모닝콜을 이용할 수 있어요."))
                    .font(.footnote)
                    .foregroundStyle(HaruStyle.ink.opacity(0.65))
                if showSaveError {
                    Text("프로필 저장에 실패했어요. 다시 시도해 주세요.")
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
            }
            .frame(maxWidth: .infinity)
        } actions: {
            Button(LocalizedStringKey(primaryButtonTitle)) {
                switch locationManager.authStatus {
                case .notDetermined:
                    // The only pre-permission action always opens the iOS prompt.
                    hasRequestedLocation = true
                    locationManager.requestLocationFlow()
                case .authorizedWhenInUse, .authorizedAlways:
                    if locationManager.cityAndProvince != nil {
                        completeOnboarding()
                    } else if hasRequestedLocation {
                        // GPS/geocoding failure must not block onboarding.
                        env.advanceOnboarding(from: .requestLocation)
                    } else {
                        hasRequestedLocation = true
                        locationManager.requestLocationFlow()
                    }
                case .denied, .restricted:
                    env.advanceOnboarding(from: .requestLocation)
                @unknown default:
                    env.advanceOnboarding(from: .requestLocation)
                }
            }
            .disabled(locationManager.isLoading || isSaving)
            .buttonStyle(PrimaryButtonStyle())
        }
        .onChange(of: locationManager.authStatus) { _, status in
            if status == .denied || status == .restricted {
                env.advanceOnboarding(from: .requestLocation)
            }
        }
        .onAppear {
            switch locationManager.authStatus {
            case .denied, .restricted:
                env.advanceOnboarding(from: .requestLocation)
            case .authorizedWhenInUse, .authorizedAlways:
                hasRequestedLocation = true
                locationManager.requestLocationFlow()
            default:
                break
            }
        }
        .preferredColorScheme(.light)
    }

    private var locationStatusCard: some View {
        HStack(spacing: 12) {
            OnboardingInfoRow(
                icon: "location",
                title: locationManager.cityAndProvince ?? "현재 위치",
                detail: locationManager.cityAndProvince != nil
                    ? "현재 위치는 앱을 열 때마다 한 번씩 갱신돼요."
                    : locationManager.permissionDenied
                        ? "위치 권한이 꺼져 있어요."
                        : "위치 권한을 허용하면 날씨를 확인할 수 있어요."
            )
            if locationManager.isLoading { ProgressView() }
        }
        .onboardingPanel()
    }

    private func completeOnboarding() {
        guard let location = locationManager.cityAndProvince, !location.isEmpty else { return }

        isSaving = true
        showSaveError = false

        APIClient.request(path: "/user/location", method: .PATCH, body: [
            "location": location,
            "timeZone": TimeZone.autoupdatingCurrent.identifier
        ]) { (result: Result<UserInfo, Error>) in
            DispatchQueue.main.async {
                isSaving = false
                switch result {
                case .success(let user):
                    env.user?.location = user.location ?? location
                    env.advanceOnboarding(from: .requestLocation)
                case .failure(let error):
                    showSaveError = true
                    print("❌ 유저 정보 저장 실패: \(error)")
                }
            }
        }
    }
}
