import SwiftUI

struct SubscriptionPaywallView: View {
    @EnvironmentObject var subscriptionManager: SubscriptionManager
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    Image(systemName: "sunrise.fill")
                        .font(.system(size: 54, weight: .semibold))
                        .foregroundStyle(Color(red: 0.95, green: 0.57, blue: 0.22))

                    VStack(spacing: 8) {
                        Text(localized("하루 플러스"))
                            .font(.system(size: 32, weight: .bold, design: .rounded))
                        Text(localized("매일 아침, AI가 직접 전화해 깨워드려요."))
                            .font(.system(.body, design: .rounded))
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }

                    VStack(alignment: .leading, spacing: 16) {
                        benefit("phone.fill", "매일 개인화된 AI 모닝콜")
                        benefit("arrow.clockwise", "필요할 때 최대 2회 재통화")
                        benefit("cloud.sun.fill", "날씨와 오늘 일정 브리핑")
                    }
                    .padding(22)
                    .background(RoundedRectangle(cornerRadius: 24).fill(Color.white.opacity(0.86)))

                    VStack(spacing: 8) {
                        Text(localized("신규 이용자 3일 무료 체험"))
                            .font(.system(.title3, design: .rounded).weight(.bold))
                        Text("\(subscriptionManager.localizedMonthlyPrice)\(localized("/월"))")
                            .font(.system(.title2, design: .rounded).weight(.bold))
                        Text(localized("신규 이용자는 무료 체험 종료 후 자동으로 갱신돼요. 언제든 취소할 수 있어요."))
                            .font(.system(.footnote, design: .rounded))
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }

                    Button {
                        subscriptionManager.purchaseMonthly()
                    } label: {
                        HStack {
                            if subscriptionManager.isLoading { ProgressView().tint(.white) }
                            Text(localized("구독 시작하기"))
                                .font(.system(.headline, design: .rounded).weight(.bold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 17)
                    }
                    .disabled(subscriptionManager.isLoading)
                    .foregroundStyle(.white)
                    .background(RoundedRectangle(cornerRadius: 20).fill(Color.black.opacity(0.9)))

                    Button(localized("구매 복원")) {
                        subscriptionManager.restorePurchases()
                    }
                    .disabled(subscriptionManager.isLoading)

                    if let error = subscriptionManager.errorMessage {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                    }

                    Text(localized("구독에는 매일 1회의 모닝콜과 필요할 때 재통화가 포함됩니다."))
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)

                    HStack(spacing: 18) {
                        Link(localized("이용약관"), destination: URL(string: "https://morningcall.poapper.com/terms")!)
                        Link(localized("개인정보 처리방침"), destination: URL(string: "https://morningcall.poapper.com/privacy")!)
                    }
                    .font(.caption)
                }
                .padding(22)
            }
            .background(Color(red: 0.97, green: 0.96, blue: 0.93).ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(localized("닫기")) { dismiss() }
                }
            }
        }
    }

    private func benefit(_ icon: String, _ title: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon).frame(width: 28).foregroundStyle(Color(red: 0.47, green: 0.61, blue: 0.92))
            Text(localized(title)).font(.system(.body, design: .rounded).weight(.semibold))
        }
    }

    private func localized(_ key: String) -> String {
        NSLocalizedString(key, comment: "")
    }
}
