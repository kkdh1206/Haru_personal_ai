import UIKit

enum AppIconManager {
    static func applyStoredPreference() {
        apply(for: CharacterPreferenceStore.current)
    }

    static func apply(for character: CharacterPreference, completion: ((Bool) -> Void)? = nil) {
        guard UIApplication.shared.supportsAlternateIcons else {
            completion?(false)
            return
        }

        let iconName = character.alternateAppIconName
        guard UIApplication.shared.alternateIconName != iconName else {
            completion?(true)
            return
        }

        DispatchQueue.main.async {
            UIApplication.shared.setAlternateIconName(iconName) { error in
                if let error {
                    print("❌ 앱 아이콘 변경 실패: \(error.localizedDescription)")
                    completion?(false)
                } else {
                    completion?(true)
                }
            }
        }
    }
}
