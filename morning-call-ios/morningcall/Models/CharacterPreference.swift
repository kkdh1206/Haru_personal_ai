import Foundation

enum HaruDayPeriod: String {
    case morning
    case afternoon
    case night

    static func current(date: Date = Date(), calendar: Calendar = .autoupdatingCurrent) -> HaruDayPeriod {
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
    case hari

    var displayName: String {
        "하리"
    }

    func localizedDisplayName(language: AppLanguage = AppLanguageStore.current) -> String {
        AppLocalizer.string(displayName, language: language)
    }

    var roleName: String {
        "하리"
    }

    var voiceName: String {
        "Leda"
    }

    var alternateAppIconName: String? {
        nil
    }

    func assetName(for period: HaruDayPeriod = .current()) -> String {
        "Hari_\(period.rawValue)"
    }

    var description: String {
        "밝고 명랑한 에너지 톤"
    }

    func localizedDescription(language: AppLanguage = AppLanguageStore.current) -> String {
        AppLocalizer.string(description, language: language)
    }
}

enum CharacterPreferenceStore {
    private static let key = "haru.selected.character"

    static var current: CharacterPreference {
        get {
            if UserDefaults.standard.string(forKey: key) != CharacterPreference.hari.rawValue {
                UserDefaults.standard.set(CharacterPreference.hari.rawValue, forKey: key)
            }
            return .hari
        }
        set {
            UserDefaults.standard.set(CharacterPreference.hari.rawValue, forKey: key)
        }
    }
}
