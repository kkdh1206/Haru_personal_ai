//
//  User.swift
//  morningcall
//
//  Created by 박원빈 on 7/5/25.
//

struct User: Codable, Identifiable {
    let id: String
    var name: String?
    var location: String?
    var interest: String?
    var language: String?
}

struct LKInfo: Codable {
    let lkToken: String
    let lkUrl: String
}
