import SwiftUI

struct AlarmEditView: View {
    @Environment(\.dismiss) var dismiss
    @State private var time = Date()
    @State private var repeatDays: Set<Int> = []
    @State private var wakeIntensity = "gentle"

    let isEditing: Bool
    var onSave: (Date, [Int], String) -> Void
    var onDelete: (() -> Void)?

    init(
        alarm: Alarm? = nil,
        onSave: @escaping (Date, [Int], String) -> Void,
        onDelete: (() -> Void)? = nil
    ) {
        if let alarm = alarm {
            let formatter = DateFormatter()
            formatter.dateFormat = "HH:mm"
            self._time = State(initialValue: formatter.date(from: alarm.time) ?? Date())
            self._repeatDays = State(initialValue: Set(alarm.repeatDays))
            self._wakeIntensity = State(initialValue: alarm.wakeIntensity)
            self.isEditing = true
        } else {
            self._time = State(initialValue: Date())
            self._repeatDays = State(initialValue: [])
            self._wakeIntensity = State(initialValue: "gentle")
            self.isEditing = false
        }
        self.onSave = onSave
        self.onDelete = onDelete
    }

    var body: some View {
        NavigationView {
            List {
                Section {
                    DatePicker("시간", selection: $time, displayedComponents: .hourAndMinute)
                        .datePickerStyle(.wheel)
                        .labelsHidden()
                        .frame(maxWidth: .infinity)
                }
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)

                Section("하루") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("친구처럼 깨워주는 Haru")
                            .font(.headline)
                        Text("일어나야 할 순간엔 다정하게 챙기고, 필요하면 확실하게 밀어줘요.")
                            .font(.subheadline)
                            .foregroundColor(.gray)
                    }
                    .padding(.vertical, 4)
                }

                NavigationLink {
                    RepeatDaysView(selectedDays: $repeatDays)
                } label: {
                    HStack {
                        Text("반복")
                        Spacer()
                        Text(repeatDaysText(repeatDays))
                            .foregroundColor(.gray)
                    }
                }

                NavigationLink {
                    WakeIntensityView(selectedIntensity: $wakeIntensity)
                } label: {
                    HStack {
                        Text("깨우기 강도")
                        Spacer()
                        Text(wakeIntensityText(wakeIntensity))
                            .foregroundColor(.gray)
                    }
                }

                if isEditing, let onDelete = onDelete {
                    Section {
                        Button(role: .destructive) {
                            onDelete()
                            dismiss()
                        } label: {
                            Text("알람 삭제")
                                .frame(maxWidth: .infinity, alignment: .center)
                        }
                    }
                }
            }
            .navigationTitle(isEditing ? "알람 편집" : "알람 추가")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("취소") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("저장") {
                        onSave(time, Array(repeatDays), wakeIntensity)
                        dismiss()
                    }
                    .bold()
                }
            }
        }
    }

    private func repeatDaysText(_ days: Set<Int>) -> String {
        let shortNames = ["일", "월", "화", "수", "목", "금", "토"]
        let sorted = days.sorted()
        return sorted.isEmpty ? "안 함" : sorted.map { shortNames[$0] }.joined(separator: ", ")
    }

    private func wakeIntensityText(_ value: String) -> String {
        value == "firm" ? "강하게" : "다정하게"
    }
}
