//
//  ButtonStyles.swift
//  morningcall
//
//  Created by 박원빈 on 8/25/25.
//

import SwiftUI

struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity, minHeight: 24)
            .padding(16)
            .background(HaruStyle.ink.opacity(isEnabled ? (configuration.isPressed ? 0.8 : 1) : 0.35))
            .foregroundColor(.white)
            .clipShape(RoundedRectangle(cornerRadius: HaruStyle.cardRadius, style: .continuous))
            .fontWeight(.bold)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .padding()
            .background(configuration.isPressed ? Color.white.opacity(0.72) : Color.white.opacity(0.88))
            .foregroundColor(Color.black.opacity(0.78))
            .clipShape(RoundedRectangle(cornerRadius: HaruStyle.cardRadius, style: .continuous))
            .fontWeight(.bold)
    }
}

struct QuietButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.medium))
            .foregroundStyle(HaruStyle.ink.opacity(isEnabled ? 0.65 : 0.35))
            .frame(maxWidth: .infinity, minHeight: 44)
            .contentShape(Rectangle())
            .opacity(configuration.isPressed ? 0.65 : 1)
    }
}
