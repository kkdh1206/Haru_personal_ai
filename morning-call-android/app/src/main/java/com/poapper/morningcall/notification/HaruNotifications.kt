package com.poapper.morningcall.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.poapper.morningcall.R
import com.poapper.morningcall.call.IncomingCallActivity

object HaruNotifications {
    const val CALL_CHANNEL_ID = "haru_calls"
    const val FOLLOWUP_CHANNEL_ID = "haru_followups"
    const val FALLBACK_CHANNEL_ID = "haru_fallback_alarms"

    fun ensureChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                CALL_CHANNEL_ID,
                "모닝콜",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Haru 수신 통화 알림"
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            },
        )
        manager.createNotificationChannel(
            NotificationChannel(
                FOLLOWUP_CHANNEL_ID,
                "후속 메시지",
                NotificationManager.IMPORTANCE_HIGH,
            ),
        )
        manager.createNotificationChannel(
            NotificationChannel(
                FALLBACK_CHANNEL_ID,
                "로컬 알람",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "네트워크 지연 시 울리는 Haru 로컬 알람"
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            },
        )
    }

    fun showIncomingCall(context: Context, caller: String) {
        ensureChannels(context)
        val fullScreenIntent = PendingIntent.getActivity(
            context,
            1001,
            Intent(context, IncomingCallActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, CALL_CHANNEL_ID)
            .setSmallIcon(R.drawable.haru_icon)
            .setColor(context.getColor(R.color.notification_color))
            .setContentTitle("$caller 모닝콜")
            .setContentText("일어날 시간이에요.")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(fullScreenIntent, true)
            .setContentIntent(fullScreenIntent)
            .build()

        NotificationManagerCompat.from(context).notify(1001, notification)
    }

    fun showFollowup(context: Context, title: String, body: String) {
        ensureChannels(context)
        val notification = NotificationCompat.Builder(context, FOLLOWUP_CHANNEL_ID)
            .setSmallIcon(R.drawable.haru_icon)
            .setColor(context.getColor(R.color.notification_color))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(1002, notification)
    }

    fun showFallback(context: Context, role: String) {
        ensureChannels(context)
        val intent = PendingIntent.getActivity(
            context,
            1003,
            Intent(context, IncomingCallActivity::class.java).apply {
                putExtra(IncomingCallActivity.EXTRA_FALLBACK_ONLY, true)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, FALLBACK_CHANNEL_ID)
            .setSmallIcon(R.drawable.haru_icon)
            .setColor(context.getColor(R.color.notification_color))
            .setContentTitle("$role 알람")
            .setContentText("일어날 시간이에요.")
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setFullScreenIntent(intent, true)
            .setContentIntent(intent)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(1003, notification)
    }

    fun clearCall(context: Context) {
        NotificationManagerCompat.from(context).cancel(1001)
    }
}
