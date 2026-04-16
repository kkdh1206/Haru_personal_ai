//
//  Alarm.swift
//  morningcall
//
//  Created by 박원빈 on 7/12/25.
//

struct Weather: Codable, Hashable {
    var weather: String
    var temperature: Double
    var feels_like: Double
    var icon: String
    var humidity: Double
    var wind_speed: Double
    var city: String
}
