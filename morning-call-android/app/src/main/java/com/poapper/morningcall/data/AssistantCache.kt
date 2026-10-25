package com.poapper.morningcall.data

import android.content.Context
import com.poapper.morningcall.model.AssistantBriefing
import com.poapper.morningcall.model.AssistantTask
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

data class CachedAssistantDashboard(
    val briefing: AssistantBriefing?,
    val tasks: List<AssistantTask>,
    val briefingSavedAtMillis: Long?,
    val tasksSavedAtMillis: Long?,
)

class AssistantCache(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(
        PREFERENCES_NAME,
        Context.MODE_PRIVATE,
    )
    private val json = Json { ignoreUnknownKeys = true }

    fun load(userId: String): CachedAssistantDashboard {
        val briefingRaw = preferences.getString(key(userId, "briefing"), null)
        val briefing = briefingRaw?.let { raw ->
            runCatching { json.decodeFromString(AssistantBriefing.serializer(), raw) }.getOrNull()
        }
        val tasksRaw = preferences.getString(key(userId, "tasks"), null)
        val tasks = tasksRaw?.let { raw ->
            runCatching {
                json.decodeFromString(ListSerializer(AssistantTask.serializer()), raw)
            }.getOrNull()
        }.orEmpty()
        val legacySavedAt = preferences.getLong(key(userId, "saved_at"), 0L).takeIf { it > 0L }
        val briefingSavedAt = preferences
            .getLong(key(userId, "briefing_saved_at"), 0L)
            .takeIf { it > 0L }
            ?: legacySavedAt.takeIf { briefingRaw != null }
        val tasksSavedAt = preferences
            .getLong(key(userId, "tasks_saved_at"), 0L)
            .takeIf { it > 0L }
            ?: legacySavedAt.takeIf { tasksRaw != null }
        return CachedAssistantDashboard(briefing, tasks, briefingSavedAt, tasksSavedAt)
    }

    fun saveBriefing(
        userId: String,
        briefing: AssistantBriefing,
        savedAtMillis: Long = System.currentTimeMillis(),
    ) {
        preferences.edit()
            .putString(key(userId, "briefing"), json.encodeToString(AssistantBriefing.serializer(), briefing))
            .putLong(key(userId, "briefing_saved_at"), savedAtMillis)
            .apply()
    }

    fun saveTasks(
        userId: String,
        tasks: List<AssistantTask>,
        savedAtMillis: Long = System.currentTimeMillis(),
    ) {
        preferences.edit()
            .putString(
                key(userId, "tasks"),
                json.encodeToString(ListSerializer(AssistantTask.serializer()), tasks),
            )
            .putLong(key(userId, "tasks_saved_at"), savedAtMillis)
            .apply()
    }

    fun clear(userId: String) {
        preferences.edit()
            .remove(key(userId, "briefing"))
            .remove(key(userId, "tasks"))
            .remove(key(userId, "briefing_saved_at"))
            .remove(key(userId, "tasks_saved_at"))
            .remove(key(userId, "saved_at"))
            .apply()
    }

    private fun key(userId: String, suffix: String) = "${userId}_$suffix"

    companion object {
        private const val PREFERENCES_NAME = "haru_assistant_cache"
    }
}
