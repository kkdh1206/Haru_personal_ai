import SwiftUI

struct VoiceView: View {
    @Binding var selectedVoice: String

    private let voices: [String] = [
        "Achernar",
        "Achird",
        "Algenib",
        "Algieba",
        "Alnilam",
        "Aoede",
        "Autonoe",
        "Callirrhoe",
        "Charon",
        "Despina",
        "Enceladus",
        "Erinome",
        "Fenrir",
        "Gacrux",
        "Iapetus",
        "Kore",
        "Laomedeia",
        "Leda",
        "Orus",
        "Pulcherrima",
        "Puck",
        "Rasalgethi",
        "Sadachbia",
        "Sadaltager",
        "Schedar",
        "Sulafat",
        "Umbriel",
        "Vindemiatrix",
        "Zephyr",
        "Zubenelgenubi",
    ]

    var body: some View {
        List {
            ForEach(voices, id: \.self) { voice in
                Button {
                    selectedVoice = voice
                } label: {
                    HStack {
                        Text(voice)
                        Spacer()
                        if selectedVoice == voice {
                            Image(systemName: "checkmark")
                                .foregroundColor(.blue)
                        }
                    }
                }
                .foregroundColor(.primary)
            }
        }
        .navigationTitle("목소리")
        .navigationBarTitleDisplayMode(.inline)
    }
}
