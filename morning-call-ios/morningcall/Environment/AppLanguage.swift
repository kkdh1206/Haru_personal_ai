import Foundation

enum SpeechStyle: String, Codable {
    case gyeongsang = "ko-gyeongsang"
    case osaka = "ja-osaka"
    case california = "en-california"

    static func defaultStyle(forCallLanguage language: String) -> SpeechStyle {
        switch languageCode(for: language) {
        case "ja":
            return .osaka
        case "en":
            return .california
        default:
            return .gyeongsang
        }
    }

    static func value(
        forCallLanguage language: String,
        preserving currentStyle: String?,
        currentLanguage: String?
    ) -> String {
        let targetLanguageCode = languageCode(for: language)
        if targetLanguageCode == languageCode(for: currentLanguage),
           let currentStyle,
           let style = SpeechStyle(rawValue: currentStyle),
           style == defaultStyle(forCallLanguage: language) {
            return style.rawValue
        }
        return defaultStyle(forCallLanguage: language).rawValue
    }

    private static func languageCode(for language: String?) -> String {
        guard let language else { return "ko" }
        let normalized = language.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if normalized.contains("japanese")
            || normalized.contains("일본")
            || normalized.contains("日本")
            || normalized.hasPrefix("ja") {
            return "ja"
        }
        if normalized.contains("english")
            || normalized.contains("영어")
            || normalized.hasPrefix("en") {
            return "en"
        }
        return "ko"
    }
}

enum AppLanguage: String, CaseIterable, Identifiable {
    case korean = "ko"
    case english = "en"
    case japanese = "ja"

    var id: String { rawValue }

    var locale: Locale {
        Locale(identifier: localeIdentifier)
    }

    var localeIdentifier: String {
        switch self {
        case .korean:
            return "ko_KR"
        case .english:
            return "en_US"
        case .japanese:
            return "ja_JP"
        }
    }

    var nativeLabel: String {
        switch self {
        case .korean:
            return "한국어"
        case .english:
            return "English"
        case .japanese:
            return "日本語"
        }
    }

    var callLanguageValue: String {
        switch self {
        case .korean:
            return "한국어"
        case .english:
            return "English"
        case .japanese:
            return "日本語"
        }
    }

    var heroDateFormat: String {
        switch self {
        case .korean:
            return "M월 d일 EEEE"
        case .english:
            return "EEEE, MMM d"
        case .japanese:
            return "M月d日 EEEE"
        }
    }

    var monthDayFormat: String {
        switch self {
        case .korean:
            return "M월 d일"
        case .english:
            return "MMM d"
        case .japanese:
            return "M月d日"
        }
    }

    var briefingDateFormat: String {
        switch self {
        case .korean:
            return "M월 d일 (E)"
        case .english:
            return "MMM d (E)"
        case .japanese:
            return "M月d日 (E)"
        }
    }

    var weekdayShortLabels: [Int: String] {
        switch self {
        case .korean:
            return [0: "일", 1: "월", 2: "화", 3: "수", 4: "목", 5: "금", 6: "토"]
        case .english:
            return [0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat"]
        case .japanese:
            return [0: "日", 1: "月", 2: "火", 3: "水", 4: "木", 5: "金", 6: "土"]
        }
    }

    var repeatDayLabels: [(Int, String)] {
        switch self {
        case .korean:
            return [
                (0, "일요일마다"),
                (1, "월요일마다"),
                (2, "화요일마다"),
                (3, "수요일마다"),
                (4, "목요일마다"),
                (5, "금요일마다"),
                (6, "토요일마다"),
            ]
        case .english:
            return [
                (0, "Every Sunday"),
                (1, "Every Monday"),
                (2, "Every Tuesday"),
                (3, "Every Wednesday"),
                (4, "Every Thursday"),
                (5, "Every Friday"),
                (6, "Every Saturday"),
            ]
        case .japanese:
            return [
                (0, "毎週日曜日"),
                (1, "毎週月曜日"),
                (2, "毎週火曜日"),
                (3, "毎週水曜日"),
                (4, "毎週木曜日"),
                (5, "毎週金曜日"),
                (6, "毎週土曜日"),
            ]
        }
    }
}

enum AppLanguageStore {
    private static let key = "haru.app.language"

    static var current: AppLanguage {
        get {
            guard
                let raw = UserDefaults.standard.string(forKey: key),
                let language = AppLanguage(rawValue: raw)
            else {
                return .korean
            }
            return language
        }
        set {
            UserDefaults.standard.set(newValue.rawValue, forKey: key)
        }
    }
}

enum AppLocalizer {
    static func string(_ key: String, language: AppLanguage = AppLanguageStore.current) -> String {
        guard
            let path = Bundle.main.path(forResource: language.rawValue, ofType: "lproj"),
            let bundle = Bundle(path: path)
        else {
            return NSLocalizedString(key, comment: "")
        }

        return NSLocalizedString(key, bundle: bundle, comment: "")
    }
}
