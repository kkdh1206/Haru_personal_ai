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
            return "하루"
        case .hari:
            return "하리"
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
            return "Charon"
        case .hari:
            return "Leda"
        }
    }

    var alternateAppIconName: String? {
        switch self {
        case .haru:
            return nil
        case .hari:
            return "HariAppIcon"
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
            return "차분하고 안정감 있는 톤"
        case .hari:
            return "밝고 명랑한 에너지 톤"
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
