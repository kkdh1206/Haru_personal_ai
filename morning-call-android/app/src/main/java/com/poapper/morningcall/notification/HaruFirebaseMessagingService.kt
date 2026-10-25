package com.poapper.morningcall.notification

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.poapper.morningcall.alarm.LocalFallbackScheduler
import com.poapper.morningcall.call.CallManager
import com.poapper.morningcall.data.APIClient
import com.poapper.morningcall.data.AssistantPreferences
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
                val preferences = AssistantPreferences(applicationContext)
                if (auth.isLoggedIn) {
                    APIClient(auth) { preferences.backendUrl }.registerDeviceToken(token)
                }
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val type = data["type"]
        if (type in ASSISTANT_NOTIFICATION_TYPES) {
            val preferences = AssistantPreferences(applicationContext)
            if (preferences.assistantNotificationsEnabled) {
                HaruNotifications.showAssistant(
                    context = this,
                    title = data["title"] ?: message.notification?.title ?: "Haru Assistant",
                    body = data["body"] ?: message.notification?.body ?: "새로운 개인 브리핑이 도착했어요.",
                    notificationKey = data["notificationId"] ?: data["id"],
                )
            }
            return
        }
        if (type == "wake_followup") {
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

    companion object {
        private val ASSISTANT_NOTIFICATION_TYPES = setOf(
            "assistant",
            "assistant_notification",
            "briefing",
            "task_reminder",
            "deadline",
            "opportunity",
        )
    }
}
