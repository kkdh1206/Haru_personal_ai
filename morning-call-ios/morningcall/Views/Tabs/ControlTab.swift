import SwiftUI

struct ControlTabView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 14) {
                Image(systemName: "moon.zzz.fill")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundStyle(Color(red: 0.48, green: 0.61, blue: 0.91))

                Text("제어 탭은 잠시 비워두었어요.")
                    .font(.system(.title3).weight(.semibold))

                Text("지금은 기상 화면과 브리핑 화면 중심으로 다듬는 중입니다.")
                    .font(.system(.subheadline))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(24)
            .background(Color(red: 0.96, green: 0.95, blue: 0.92))
            .navigationTitle("제어")
        }
    }
}

