import SwiftUI

struct AlarmEditorContext: Identifiable {
    enum Mode {
        case weekday(Int)
        case exception(Date)
    }

    let mode: Mode
    let existingAlarm: Alarm?
    let title: String
    let subtitle: String
    let defaultTime: Date
    let isException: Bool

    var id: String {
        switch mode {
        case .weekday(let day):
            return "weekday-\(day)-\(existingAlarm?.id ?? "new")"
        case .exception(let date):
            return "exception-\(date.timeIntervalSince1970)-\(existingAlarm?.id ?? "new")"
        }
    }

    var storageKey: String {
        switch mode {
        case .weekday(let day):
            return existingAlarm?.id ?? "weekday-\(day)"
        case .exception(let date):
            return "exception-\(AlarmDateFormatter.storage.string(from: date))"
        }
    }
}

struct AlarmEditorResult {
    let time: Date
    let wakeStyle: String
    let snoozeMinutes: Int
    let note: String
    let isSkipped: Bool
}

fileprivate struct AlarmPresentationSettings: Codable {
    var wakeStyle: String
    var snoozeMinutes: Int
    var note: String

    static let `default` = AlarmPresentationSettings(
        wakeStyle: "gentle",
        snoozeMinutes: 5,
        note: ""
    )
}

fileprivate enum AlarmPresentationStore {
    private static let defaultsKey = "haru.alarm.presentation.settings"

    static func load(for key: String) -> AlarmPresentationSettings {
        guard
            let data = UserDefaults.standard.data(forKey: defaultsKey),
            let all = try? JSONDecoder().decode([String: AlarmPresentationSettings].self, from: data)
        else {
            return .default
        }

        return all[key] ?? .default
    }

    static func save(_ settings: AlarmPresentationSettings, for key: String) {
        var all: [String: AlarmPresentationSettings] = [:]
        if
            let data = UserDefaults.standard.data(forKey: defaultsKey),
            let decoded = try? JSONDecoder().decode([String: AlarmPresentationSettings].self, from: data)
        {
            all = decoded
        }

        all[key] = settings

        if let encoded = try? JSONEncoder().encode(all) {
            UserDefaults.standard.set(encoded, forKey: defaultsKey)
        }
    }
}

struct AlarmEditView: View {
    @Environment(\.dismiss) private var dismiss

    private let context: AlarmEditorContext
    private let onSave: (AlarmEditorResult) -> Void
    private let onDelete: (() -> Void)?

    @State private var time: Date
    @State private var wakeStyle: String
    @State private var snoozeMinutes: Int
    @State private var note: String
    @State private var isSkipped: Bool

    init(
        context: AlarmEditorContext,
        onSave: @escaping (AlarmEditorResult) -> Void,
        onDelete: (() -> Void)? = nil
    ) {
        self.context = context
        self.onSave = onSave
        self.onDelete = onDelete

        let stored = AlarmPresentationStore.load(for: context.storageKey)
        let initialStyle = context.existingAlarm?.personality ?? stored.wakeStyle
        self._time = State(initialValue: context.defaultTime)
        self._wakeStyle = State(initialValue: Self.normalizeWakeStyle(initialStyle))
        self._snoozeMinutes = State(initialValue: stored.snoozeMinutes)
        self._note = State(initialValue: stored.note)
        self._isSkipped = State(initialValue: false)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    headerCard
                    timeSection
                    wakeStyleSection

                    if let onDelete {
                        Button(role: .destructive) {
                            onDelete()
                            dismiss()
                        } label: {
                            Text(context.isException ? "예외 알람 삭제" : "이 요일 알람 삭제")
                                .font(.system(.body, design: .rounded).weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                                .background(
                                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                                        .fill(Color.white.opacity(0.82))
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 20)
                .padding(.bottom, 32)
            }
            .background(Color(red: 0.97, green: 0.96, blue: 0.93))
            .navigationTitle(context.title)
            .navigationBarTitleDisplayMode(.inline)
            .tint(.black)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("취소") { dismiss() }
                        .foregroundStyle(.black)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("저장") {
                        let settings = AlarmPresentationSettings(
                            wakeStyle: wakeStyle,
                            snoozeMinutes: snoozeMinutes,
                            note: note
                        )
                        AlarmPresentationStore.save(settings, for: context.storageKey)
                        onSave(
                            AlarmEditorResult(
                                time: time,
                                wakeStyle: wakeStyle,
                                snoozeMinutes: snoozeMinutes,
                                note: note,
                                isSkipped: isSkipped
                            )
                        )
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .foregroundStyle(.black)
                }
            }
        }
        .preferredColorScheme(.light)
    }

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(context.subtitle)
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(Color.black.opacity(0.58))

            Text(displayTime)
                .font(.system(size: 42, weight: .semibold, design: .rounded))
                .foregroundStyle(Color.black.opacity(0.92))

            if context.isException {
                Toggle("이 날은 알람 쉬기", isOn: $isSkipped)
                    .tint(Color(red: 0.47, green: 0.61, blue: 0.92))
                    .padding(.top, 8)
                    .foregroundStyle(.black)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(24)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 28, style: .continuous)
                        .stroke(Color.white.opacity(0.6), lineWidth: 1)
                )
        )
    }

    private var timeSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("시간 변경")
                .font(.system(.headline, design: .rounded).weight(.semibold))
                .foregroundStyle(.black)

            DatePicker(
                "",
                selection: $time,
                displayedComponents: .hourAndMinute
            )
            .datePickerStyle(.wheel)
            .labelsHidden()
            .frame(maxWidth: .infinity)
            .clipped()
            .padding(.horizontal, 4)
            .disabled(isSkipped)
        }
        .padding(22)
        .background(sectionBackground)
    }

    private var wakeStyleSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("깨우기 방식")
                .font(.system(.headline, design: .rounded).weight(.semibold))
                .foregroundStyle(.black)

            VStack(spacing: 12) {
                wakeStyleRow(
                    id: "gentle",
                    title: "부드럽게",
                    detail: "잔잔한 톤으로 천천히 깨워요."
                )
                wakeStyleRow(
                    id: "aggressive",
                    title: "강하게",
                    detail: "지금은 꼭 일어나야 할 때라는 느낌으로 깨워요."
                )
            }
        }
        .padding(22)
        .background(sectionBackground)
    }

    private func wakeStyleRow(id: String, title: String, detail: String) -> some View {
        Button {
            wakeStyle = id
        } label: {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.system(.body, design: .rounded).weight(.semibold))
                        .foregroundStyle(.black)
                    Text(detail)
                        .font(.system(.footnote, design: .rounded))
                        .foregroundStyle(Color.black.opacity(0.58))
                        .multilineTextAlignment(.leading)
                }

                Spacer()

                Image(systemName: wakeStyle == id ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(
                        wakeStyle == id
                        ? Color(red: 0.47, green: 0.61, blue: 0.92)
                        : Color.secondary.opacity(0.45)
                    )
            }
            .padding(18)
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(wakeStyle == id ? Color.white.opacity(0.9) : Color.white.opacity(0.58))
            )
        }
        .buttonStyle(.plain)
        .disabled(isSkipped)
    }

    private var sectionBackground: some View {
        RoundedRectangle(cornerRadius: 28, style: .continuous)
            .fill(.ultraThinMaterial)
            .overlay(
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .stroke(Color.white.opacity(0.55), lineWidth: 1)
            )
    }

    private var displayTime: String {
        AlarmDateFormatter.time.string(from: time)
    }

    private static func normalizeWakeStyle(_ value: String) -> String {
        switch value {
        case "aggressive", "gentle":
            return value
        case "normal":
            return "gentle"
        case "firm":
            return "aggressive"
        default:
            return "gentle"
        }
    }
}
