package com.poapper.morningcall.alarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        LocalFallbackScheduler.sync(context, LocalFallbackScheduler.cachedAlarms(context))
    }
}
