import SwiftUI

struct RoleView: View {
    @Binding var selectedRole: String

    private let roles: [String] = [
        "여자친구",
        "남자친구",
        "활발한 절친",
        "차분한 비서",
        "헬스 트레이너",
        "츤데레 스타일",
        "군대 조교"
    ]

    var body: some View {
        List {
            ForEach(roles, id: \.self) { role in
                Button {
                    selectedRole = role
                } label: {
                    HStack {
                        Text(role)
                        Spacer()
                        if selectedRole == role {
                            Image(systemName: "checkmark")
                                .foregroundColor(.blue)
                        }
                    }
                }
                .foregroundColor(.primary)
            }
        }
        .navigationTitle("역할")
        .navigationBarTitleDisplayMode(.inline)
    }
}
