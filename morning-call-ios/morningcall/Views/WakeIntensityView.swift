import SwiftUI

struct WakeIntensityView: View {
    @Binding var selectedIntensity: String

    private let options: [(value: String, title: String, description: String)] = [
        ("gentle", "다정하게", "친구처럼 부드럽게 깨워요"),
        ("firm", "강하게", "확실하게 일어나게 밀어줘요")
    ]

    var body: some View {
        List {
            ForEach(options, id: \.value) { option in
                Button {
                    selectedIntensity = option.value
                } label: {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(option.title)
                            Text(option.description)
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                        Spacer()
                        if selectedIntensity == option.value {
                            Image(systemName: "checkmark")
                                .foregroundColor(.blue)
                        }
                    }
                }
                .foregroundColor(.primary)
            }
        }
        .navigationTitle("깨우기 강도")
        .navigationBarTitleDisplayMode(.inline)
    }
}
