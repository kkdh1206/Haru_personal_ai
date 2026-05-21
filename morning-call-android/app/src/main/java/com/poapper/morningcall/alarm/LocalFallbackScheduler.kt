package com.poapper.morningcall.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.provider.Settings
import com.poapper.morningcall.model.Alarm
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

object LocalFallbackScheduler {
    private const val PREFS = "haru_call_fallback"
    private const val FIRE_DATES = "scheduled_fire_dates"
    private const val IGNORED_IDS = "ignored_alarm_ids"
    private const val CACHED_ALARMS = "cached_alarms"
    private const val FALLBACK_DELAY_MILLIS = 60_000L
    private val json = Json { ignoreUnknownKeys = true }

    fun initialize(context: Context) {
        if (isOnline(context)) markDueFallbacksForPushIgnore(context)
    }

    fun exactAlarmSettingsIntent(context: Context): Intent? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null
        val manager = context.getSystemService(AlarmManager::class.java)
        if (manager.canScheduleExactAlarms()) return null
        return Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    fun sync(context: Context, alarms: List<Alarm>) {
        saveCachedAlarms(context, alarms.filter { it.isOn })
        cancelAll(context)
        alarms.filter { it.isOn }.forEach { schedule(context, it) }
    }

    fun reschedule(context: Context, alarm: Alarm) {
        val updated = cachedAlarms(context)
            .filterNot { it.id == alarm.id }
            .let { if (alarm.isOn) it + alarm else it }
        saveCachedAlarms(context, updated)
        cancel(context, alarm.id)
        if (alarm.isOn) schedule(context, alarm)
    }

    fun cancel(context: Context, alarmId: String) {
        (0..7).forEach { requestCode ->
            alarmManager(context).cancel(pendingIntent(context, alarmId, requestCode, ""))
        }
        removeFireDate(context, alarmId)
        removeIgnoredId(context, alarmId)
    }

    fun shouldIgnoreIncomingPush(context: Context, alarmId: String?): Boolean {
        if (alarmId.isNullOrBlank()) return false
        markDueFallbacksForPushIgnore(context)
        val ignored = ignoredIds(context).toMutableSet()
        if (!ignored.remove(alarmId)) return false
        saveIgnoredIds(context, ignored)
        return true
    }

    private fun schedule(context: Context, alarm: Alarm) {
        val manager = alarmManager(context)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !manager.canScheduleExactAlarms()) {
            return
        }

        val zone = ZoneId.systemDefault()
        val fireTimes = nextAlarmTimes(alarm, zone).map { it + FALLBACK_DELAY_MILLIS }
        fireTimes.forEachIndexed { index, fireAt ->
            rememberFireDate(context, alarm.id, fireAt)
            val intent = pendingIntent(context, alarm.id, index, alarm.role)
            manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAt, intent)
        }
    }

    private fun nextAlarmTimes(alarm: Alarm, zone: ZoneId): List<Long> {
        val time = parseTime(alarm.time)
        val now = LocalDateTime.now(zone)
        if (!alarm.targetDate.isNullOrBlank()) {
            val date = LocalDate.parse(alarm.targetDate)
            val candidate = LocalDateTime.of(date, time)
            return if (candidate.isAfter(now)) listOf(candidate.atZone(zone).toInstant().toEpochMilli()) else emptyList()
        }

        return alarm.repeatDays.distinct().mapNotNull { day ->
            val targetDay = toDayOfWeek(day)
            var date = LocalDate.now(zone)
            while (date.dayOfWeek != targetDay) date = date.plusDays(1)
            var candidate = LocalDateTime.of(date, time)
            if (!candidate.isAfter(now)) candidate = candidate.plusWeeks(1)
            candidate.atZone(zone).toInstant().toEpochMilli()
        }
    }

    private fun cancelAll(context: Context) {
        cachedAlarms(context).forEach { cancel(context, it.id) }
        prefs(context).edit().remove(FIRE_DATES).apply()
    }

    private fun pendingIntent(context: Context, alarmId: String, requestIndex: Int, role: String): PendingIntent {
        val intent = Intent(context, LocalFallbackReceiver::class.java)
            .putExtra(LocalFallbackReceiver.EXTRA_ALARM_ID, alarmId)
            .putExtra(LocalFallbackReceiver.EXTRA_ROLE, role)
        return PendingIntent.getBroadcast(
            context,
            (alarmId.hashCode() * 31) + requestIndex,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun parseTime(time: String): LocalTime {
        val parts = time.split(":").mapNotNull { it.toIntOrNull() }
        return LocalTime.of(parts.getOrElse(0) { 7 }, parts.getOrElse(1) { 30 })
    }

    private fun toDayOfWeek(day: Int): DayOfWeek = when (day) {
        0 -> DayOfWeek.SUNDAY
        1 -> DayOfWeek.MONDAY
        2 -> DayOfWeek.TUESDAY
        3 -> DayOfWeek.WEDNESDAY
        4 -> DayOfWeek.THURSDAY
        5 -> DayOfWeek.FRIDAY
        else -> DayOfWeek.SATURDAY
    }

    private fun markDueFallbacksForPushIgnore(context: Context): Set<String> {
        val now = System.currentTimeMillis()
        val fireDates = fireDates(context).toMutableMap()
        val due = fireDates.filterValues { it <= now }.keys
        if (due.isEmpty()) return emptySet()
        val ignored = ignoredIds(context).toMutableSet()
        due.forEach {
            ignored += it
            fireDates.remove(it)
        }
        prefs(context).edit()
            .putString(FIRE_DATES, json.encodeToString(fireDates))
            .putStringSet(IGNORED_IDS, ignored)
            .apply()
        return due
    }

    private fun rememberFireDate(context: Context, alarmId: String, fireAt: Long) {
        val fireDates = fireDates(context).toMutableMap()
        val existing = fireDates[alarmId]
        if (existing == null || fireAt < existing) fireDates[alarmId] = fireAt
        prefs(context).edit().putString(FIRE_DATES, json.encodeToString(fireDates)).apply()
    }

    private fun removeFireDate(context: Context, alarmId: String) {
        val fireDates = fireDates(context).toMutableMap()
        fireDates.remove(alarmId)
        prefs(context).edit().putString(FIRE_DATES, json.encodeToString(fireDates)).apply()
    }

    private fun fireDates(context: Context): Map<String, Long> {
        val raw = prefs(context).getString(FIRE_DATES, null) ?: return emptyMap()
        return runCatching { json.decodeFromString<Map<String, Long>>(raw) }.getOrDefault(emptyMap())
    }

    private fun ignoredIds(context: Context): Set<String> = prefs(context).getStringSet(IGNORED_IDS, emptySet()).orEmpty()

    private fun saveIgnoredIds(context: Context, values: Set<String>) {
        prefs(context).edit().putStringSet(IGNORED_IDS, values).apply()
    }

    private fun removeIgnoredId(context: Context, alarmId: String) {
        saveIgnoredIds(context, ignoredIds(context) - alarmId)
    }

    private fun saveCachedAlarms(context: Context, alarms: List<Alarm>) {
        prefs(context).edit().putString(CACHED_ALARMS, json.encodeToString(alarms)).apply()
    }

    fun cachedAlarms(context: Context): List<Alarm> {
        val raw = prefs(context).getString(CACHED_ALARMS, null) ?: return emptyList()
        return runCatching { json.decodeFromString<List<Alarm>>(raw) }.getOrDefault(emptyList())
    }

    private fun isOnline(context: Context): Boolean {
        val manager = context.getSystemService(ConnectivityManager::class.java)
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun alarmManager(context: Context): AlarmManager = context.getSystemService(AlarmManager::class.java)

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
