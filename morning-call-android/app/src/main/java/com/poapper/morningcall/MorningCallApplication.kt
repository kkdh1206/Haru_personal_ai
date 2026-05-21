package com.poapper.morningcall

import android.app.Application
import com.google.firebase.FirebaseApp
import com.poapper.morningcall.alarm.LocalFallbackScheduler
import com.poapper.morningcall.notification.HaruNotifications

class MorningCallApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        FirebaseApp.initializeApp(this)
        HaruNotifications.ensureChannels(this)
        LocalFallbackScheduler.initialize(this)
    }
}
