//
//  ButtonStyles.swift
//  morningcall
//
//  Created by 박원빈 on 8/25/25.
//

import SwiftUI

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .padding()
            .background(configuration.isPressed ? Color.black.opacity(0.78) : Color.black.opacity(0.88))
            .foregroundColor(.white)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
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
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .fontWeight(.bold)
    }
}
