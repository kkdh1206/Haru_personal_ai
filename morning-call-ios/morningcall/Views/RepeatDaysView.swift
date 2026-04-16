//
//  Untitled.swift
//  morningcall
//
//  Created by 박원빈 on 7/12/25.
//

import SwiftUI


struct RepeatDaysView: View {
    @Binding var selectedDays: Set<Int>

    let days = [
        (0, "일요일마다"),
        (1, "월요일마다"),
        (2, "화요일마다"),
        (3, "수요일마다"),
        (4, "목요일마다"),
        (5, "금요일마다"),
        (6, "토요일마다"),
    ]

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
        .navigationTitle("반복")
        .navigationBarTitleDisplayMode(.inline)
    }
}
