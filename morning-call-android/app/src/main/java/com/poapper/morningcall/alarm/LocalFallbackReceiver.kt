package com.poapper.morningcall.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.poapper.morningcall.notification.HaruNotifications

class LocalFallbackReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val role = intent.getStringExtra(EXTRA_ROLE) ?: "Haru"
        HaruNotifications.showFallback(context, role)
    }

    companion object {
        const val EXTRA_ALARM_ID = "alarmId"
        const val EXTRA_ROLE = "role"
    }
}
