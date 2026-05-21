package com.poapper.morningcall.notification

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.poapper.morningcall.alarm.LocalFallbackScheduler
import com.poapper.morningcall.call.CallManager
import com.poapper.morningcall.data.APIClient
import com.poapper.morningcall.data.AuthRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class HaruFirebaseMessagingService : FirebaseMessagingService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        scope.launch {
            runCatching {
                val auth = AuthRepository(applicationContext)
                if (auth.isLoggedIn) APIClient(auth).registerDeviceToken(token)
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        if (data["type"] == "wake_followup") {
            HaruNotifications.showFollowup(
                this,
                data["title"] ?: "Haru",
                data["body"] ?: "전화를 여러 번 드렸는데 연결이 잘 안 돼서 메시지를 남겨요.",
            )
            return
        }

        val alarmId = data["alarmId"]
        if (LocalFallbackScheduler.shouldIgnoreIncomingPush(this, alarmId)) return

        val url = data["lkUrl"]
        val token = data["lkToken"]
        if (url.isNullOrBlank() || token.isNullOrBlank()) return

        val caller = data["caller"] ?: "Haru"
        CallManager.prepareIncoming(applicationContext, url, token, alarmId, caller)
        HaruNotifications.showIncomingCall(this, caller)
    }
}
