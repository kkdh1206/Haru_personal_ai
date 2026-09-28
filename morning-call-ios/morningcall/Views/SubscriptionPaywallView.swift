import SwiftUI

struct SubscriptionPaywallView: View {
    @EnvironmentObject var subscriptionManager: SubscriptionManager
    @EnvironmentObject var env: AppEnvironment
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            GeometryReader { proxy in
                ScrollView(.vertical) {
                    VStack(alignment: .leading, spacing: 24) {
                        OnboardingHeading(
                            title: "하루 플러스",
                            subtitle: "매일 아침, AI가 직접 전화해 깨워드려요."
                        )

                        planCard
                        benefits

                        if let error = subscriptionManager.errorMessage {
                            VStack(alignment: .leading, spacing: 8) {
                                Text(localized(error))
                                    .font(.footnote)
                                    .foregroundStyle(.red)
                                if subscriptionManager.monthlyProduct == nil {
                                    Button("다시 시도") { subscriptionManager.refresh() }
                                        .font(.subheadline.weight(.semibold))
                                }
                            }
                        }
                    }
                    .frame(width: max(0, proxy.size.width - 40), alignment: .leading)
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 24)
                }
                .scrollIndicators(.hidden)
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    purchaseActions
                        .frame(width: max(0, proxy.size.width - 40))
                        .padding(.horizontal, 20)
                        .padding(.top, 12)
                        .padding(.bottom, 12)
                        .background(HaruStyle.background)
                }
            }
            .background(HaruStyle.background.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(localized("닫기")) { dismiss() }
                        .font(.subheadline.weight(.medium))
                }
            }
            .navigationBarTitleDisplayMode(.inline)
        }
        .tint(HaruStyle.ink)
        .foregroundStyle(HaruStyle.ink)
        .environment(\.locale, env.appLanguage.locale)
        .preferredColorScheme(.light)
        .task { subscriptionManager.refresh() }
    }

    private var planCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 8) {
                Image(systemName: "sunrise.fill")
                    .foregroundStyle(Color(red: 0.95, green: 0.57, blue: 0.22))
                Text("월간 구독")
                    .font(.subheadline.weight(.semibold))
            }

            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(subscriptionManager.localizedMonthlyPrice)
                    .font(.largeTitle.bold())
                Text("/월")
                    .font(.body)
                    .foregroundStyle(HaruStyle.ink.opacity(0.65))
            }

            if subscriptionManager.isEligibleForTrial {
                Text("신규 이용자 3일 무료 체험")
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(HaruStyle.ink.opacity(0.06), in: Capsule())
            }

            Text(LocalizedStringKey(subscriptionManager.isEligibleForTrial
                ? "무료 체험 종료 후 위 가격으로 매월 자동 갱신돼요. 언제든 취소할 수 있어요."
                : "매월 자동 갱신되며, 언제든 취소할 수 있어요."))
                .font(.footnote)
                .foregroundStyle(HaruStyle.ink.opacity(0.65))
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(.white.opacity(0.86), in: RoundedRectangle(cornerRadius: HaruStyle.cardRadius))
    }

    private var benefits: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("구독에 포함돼요")
                .font(.headline)
            OnboardingInfoRow(
                icon: "phone",
                title: "매일 개인화된 AI 모닝콜",
                detail: "정한 시간에 전화로 하루를 시작해요."
            )
            OnboardingInfoRow(
                icon: "arrow.clockwise",
                title: "필요할 때 최대 2회 재통화",
                detail: "첫 전화를 놓쳐도 다시 깨워드려요."
            )
            OnboardingInfoRow(
                icon: "cloud.sun",
                title: "날씨와 오늘 일정 브리핑",
                detail: "연결한 위치와 캘린더로 아침을 준비해요."
            )
        }
    }

    private var purchaseActions: some View {
        VStack(spacing: 4) {
            Button {
                subscriptionManager.purchaseMonthly()
            } label: {
                HStack(spacing: 8) {
                    if subscriptionManager.isLoading || subscriptionManager.isLoadingProduct {
                        ProgressView().tint(.white)
                    }
                    Text(LocalizedStringKey(subscriptionManager.isLoadingProduct ? "상품 불러오는 중..." : "구독 시작하기"))
                }
            }
            .disabled(subscriptionManager.isLoading || subscriptionManager.isLoadingProduct || subscriptionManager.monthlyProduct == nil)
            .buttonStyle(PrimaryButtonStyle())

            Button("구매 복원") { subscriptionManager.restorePurchases() }
                .disabled(subscriptionManager.isLoading)
                .buttonStyle(QuietButtonStyle())

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 20) { legalLinks }
                VStack(spacing: 8) { legalLinks }
            }
            .font(.caption)
            .foregroundStyle(HaruStyle.ink.opacity(0.6))
            .padding(.bottom, 4)
        }
    }

    @ViewBuilder private var legalLinks: some View {
        Link(localized("이용약관"), destination: URL(string: "https://morningcall.poapper.com/terms")!)
        Link(localized("개인정보 처리방침"), destination: URL(string: "https://morningcall.poapper.com/privacy")!)
    }

    private func localized(_ key: String) -> String {
        AppLocalizer.string(key, language: env.appLanguage)
    }
}
