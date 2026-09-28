import SwiftUI

enum HaruStyle {
    static let ink = Color(white: 0.20)
    static let cardRadius: CGFloat = 20
    static let background = Color(red: 0.97, green: 0.96, blue: 0.93)
}

/// Every step shares the same safe-area-aware header, content and action area.
struct OnboardingLayout<Content: View, Actions: View>: View {
    let step: OnboardingStep
    @ViewBuilder let content: () -> Content
    @ViewBuilder let actions: () -> Actions

    var body: some View {
        GeometryReader { proxy in
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 12) {
                    Text(verbatim: "\(step.number) / \(OnboardingStep.steps.count)")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(HaruStyle.ink)
                        .monospacedDigit()
                    HStack(spacing: 6) {
                        ForEach(1...OnboardingStep.steps.count, id: \.self) { index in
                            Capsule()
                                .fill(HaruStyle.ink.opacity(index <= step.number ? 1 : 0.12))
                                .frame(height: 3)
                        }
                    }
                    .accessibilityHidden(true)
                }
                .padding(.horizontal, 20)
                .padding(.top, 16)

                ScrollView(.vertical) {
                    VStack(alignment: .leading, spacing: 24, content: content)
                        .frame(width: max(0, proxy.size.width - 40), alignment: .leading)
                        .padding(.horizontal, 20)
                        .padding(.bottom, 24)
                }
                .scrollIndicators(.hidden)
                .scrollDismissesKeyboard(.interactively)
                .scrollBounceBehavior(.basedOnSize)
            }
            .frame(width: proxy.size.width, alignment: .top)
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 12, content: actions)
                    .font(.body.weight(.semibold))
                    .frame(width: max(0, proxy.size.width - 40))
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                    .padding(.bottom, 16)
                    .background(HaruStyle.background)
            }
        }
        .background(HaruStyle.background.ignoresSafeArea())
        .foregroundStyle(HaruStyle.ink)
        .tint(HaruStyle.ink)
        .symbolRenderingMode(.monochrome)
        .preferredColorScheme(.light)
    }
}

struct OnboardingHeading: View {
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(LocalizedStringKey(title))
                .font(.title.bold())
                .foregroundStyle(HaruStyle.ink)
            Text(LocalizedStringKey(subtitle))
                .font(.subheadline)
                .foregroundStyle(HaruStyle.ink.opacity(0.65))
                .lineSpacing(3)
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct OnboardingInfoRow: View {
    let icon: String
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .medium))
                .foregroundStyle(HaruStyle.ink)
                .frame(width: 28, height: 28)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
                Text(LocalizedStringKey(title))
                    .font(.body.weight(.semibold))
                    .foregroundStyle(HaruStyle.ink)
                Text(LocalizedStringKey(detail))
                    .font(.subheadline)
                    .foregroundStyle(HaruStyle.ink.opacity(0.65))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

extension View {
    func onboardingPanel() -> some View {
        self
            .padding(16)
            .background(Color.white.opacity(0.86), in: RoundedRectangle(
                cornerRadius: HaruStyle.cardRadius, style: .continuous
            ))
    }
}
