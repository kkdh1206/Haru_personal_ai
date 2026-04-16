//
//  morningcallApp.swift
//  morningcall
//
//  Created by 박원빈 on 6/16/25.
//

import SwiftUI

@main
struct morningcallApp: App {
    @UIApplicationDelegateAdaptor(PushDelegate.self) var pushDelegate
    @StateObject var env = AppEnvironment()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(CallManager.shared)
                .environmentObject(env)
        }
    }
}
