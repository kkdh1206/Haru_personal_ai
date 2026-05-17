import Foundation

enum HaruDayPeriod: String {
    case morning
    case afternoon
    case night

    static func current(date: Date = Date(), calendar: Calendar = .current) -> HaruDayPeriod {
        let hour = calendar.component(.hour, from: date)
        switch hour {
        case 5..<12:
            return .morning
        case 12..<18:
            return .afternoon
        default:
            return .night
        }
    }

    var backgroundAssetName: String {
        "Background_\(rawValue)"
    }
}

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

    var roleName: String {
        switch self {
        case .haru:
            return "하루"
        case .hari:
            return "하리"
        }
    }

    var voiceName: String {
        switch self {
        case .haru:
            return "Rasalgethi"
        case .hari:
            return "Leda"
        }
    }

    func assetName(for period: HaruDayPeriod = .current()) -> String {
        switch self {
        case .haru:
            return "Haru_\(period.rawValue)"
        case .hari:
            return "Hari_\(period.rawValue)"
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
