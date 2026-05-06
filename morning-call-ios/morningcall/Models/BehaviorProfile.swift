struct BehaviorProfile: Codable {
    var wakeStyle: String
    var retryLimit: Int
    var toneNotes: [String]
    var customNotes: [String]
}

struct BehaviorProfileResponse: Codable {
    let success: Bool
    let message: String
    let data: BehaviorProfile
}

struct ControlCommandResponse: Codable {
    let intent: String
    let success: Bool
    let reply: String
}
