import Foundation

enum CharacterPreference: String, CaseIterable, Codable {
    case haru
    case hari

    var displayName: String {
        switch self {
        case .haru:
            return "Haru"
        case .hari:
            return "Hari"
        }
    }

    var assetName: String {
        switch self {
        case .haru:
            return "haru"
        case .hari:
            return "Hari"
        }
    }

    var description: String {
        switch self {
        case .haru:
            return "차분하고 포근한 분위기의 기본 캐릭터"
        case .hari:
            return "조금 더 가볍고 말랑한 분위기의 캐릭터"
        }
    }
}

enum CharacterPreferenceStore {
    private static let key = "haru.selected.character"

    static var current: CharacterPreference {
        get {
            guard
                let raw = UserDefaults.standard.string(forKey: key),
                let value = CharacterPreference(rawValue: raw)
            else {
                return .haru
            }
            return value
        }
        set {
            UserDefaults.standard.set(newValue.rawValue, forKey: key)
        }
    }
}

