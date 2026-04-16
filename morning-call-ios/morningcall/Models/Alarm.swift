//
//  Alarm.swift
//  morningcall
//
//  Created by 박원빈 on 7/12/25.
//

struct Alarm: Identifiable, Codable, Hashable {
    var id: String
    var time: String
    var isOn: Bool
    var repeatDays: [Int]
    var personality: String
    var voice: String
    var role: String
    var wakeIntensity: String

    enum CodingKeys: String, CodingKey {
        case id = "_id"
        case time, isOn, repeatDays, personality, voice, role, wakeIntensity
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        time = try container.decode(String.self, forKey: .time)
        isOn = try container.decode(Bool.self, forKey: .isOn)
        repeatDays = try container.decodeIfPresent([Int].self, forKey: .repeatDays) ?? []
        wakeIntensity = try container.decodeIfPresent(String.self, forKey: .wakeIntensity) ?? "gentle"
        personality = try container.decodeIfPresent(String.self, forKey: .personality) ?? wakeIntensity
        voice = try container.decodeIfPresent(String.self, forKey: .voice) ?? "Leda"
        role = try container.decodeIfPresent(String.self, forKey: .role) ?? "하루"
    }

    init(
        id: String,
        time: String,
        isOn: Bool,
        repeatDays: [Int],
        personality: String,
        voice: String,
        role: String,
        wakeIntensity: String
    ) {
        self.id = id
        self.time = time
        self.isOn = isOn
        self.repeatDays = repeatDays
        self.personality = personality
        self.voice = voice
        self.role = role
        self.wakeIntensity = wakeIntensity
    }
}
