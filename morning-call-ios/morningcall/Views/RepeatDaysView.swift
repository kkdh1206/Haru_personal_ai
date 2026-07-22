//
//  Untitled.swift
//  morningcall
//
//  Created by 박원빈 on 7/12/25.
//

import SwiftUI


struct RepeatDaysView: View {
    @EnvironmentObject var env: AppEnvironment

    @Binding var selectedDays: Set<Int>

    private var days: [(Int, String)] {
        env.appLanguage.repeatDayLabels
    }

    var body: some View {
        List {
            ForEach(days, id: \.0) { dayIndex, label in
                Button(action: {
                    if selectedDays.contains(dayIndex) {
                        selectedDays.remove(dayIndex)
                    } else {
                        selectedDays.insert(dayIndex)
                    }
                }) {
                    HStack {
                        Text(label)
                        Spacer()
                        if selectedDays.contains(dayIndex) {
                            Image(systemName: "checkmark")
                                .foregroundColor(.blue)
                        }
                    }
                }
                .foregroundColor(.primary)
            }
        }
        .navigationTitle(localized("반복"))
        .navigationBarTitleDisplayMode(.inline)
    }

    private func localized(_ key: String) -> String {
        AppLocalizer.string(key, language: env.appLanguage)
    }
}
