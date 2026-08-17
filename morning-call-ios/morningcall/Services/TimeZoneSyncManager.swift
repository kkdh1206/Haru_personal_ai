import FirebaseAuth
import Foundation

enum TimeZoneSyncManager {
    static func syncCurrentTimeZone() {
        guard Auth.auth().currentUser != nil else { return }

        let timeZone = TimeZone.autoupdatingCurrent.identifier
        APIClient.requestVoid(
            path: "/alarm/time-zone",
            method: .PATCH,
            body: ["timeZone": timeZone]
        ) { result in
            switch result {
            case .success:
                print("🌍 Time zone synchronized: \(timeZone)")
            case .failure(let error):
                print("❌ Time zone synchronization failed: \(error)")
            }
        }
    }
}
