package com.poapper.morningcall.data

import com.poapper.morningcall.model.AssistantBriefing
import com.poapper.morningcall.model.AssistantChatHistoryItem
import com.poapper.morningcall.model.AssistantChatResponse
import com.poapper.morningcall.model.AssistantStatus
import com.poapper.morningcall.model.AssistantTask
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope

data class AssistantDashboardResult(
    val briefing: AssistantBriefing?,
    val tasks: List<AssistantTask>,
    val isStale: Boolean,
    val error: String?,
    val updatedAtMillis: Long?,
)

class AssistantRepository(
    private val api: APIClient,
    private val authRepository: AuthRepository,
    private val cache: AssistantCache,
    private val cacheNamespace: () -> String,
) {
    fun cachedDashboard(): AssistantDashboardResult {
        val cached = cache.load(requireCacheKey())
        val now = System.currentTimeMillis()
        val hasBriefingCache = cached.briefing != null
        val hasTasksCache = cached.tasksSavedAtMillis != null || cached.tasks.isNotEmpty()
        val isStale =
            hasBriefingCache && cached.briefingSavedAtMillis.isExpiredAt(now) ||
                hasTasksCache && cached.tasksSavedAtMillis.isExpiredAt(now)
        return AssistantDashboardResult(
            briefing = cached.briefing,
            tasks = cached.tasks,
            isStale = isStale,
            error = null,
            updatedAtMillis = listOfNotNull(
                cached.briefingSavedAtMillis.takeIf { hasBriefingCache },
                cached.tasksSavedAtMillis.takeIf { hasTasksCache },
            ).minOrNull(),
        )
    }

    suspend fun refreshDashboard(): AssistantDashboardResult = coroutineScope {
        val cacheKey = requireCacheKey()
        val cached = cache.load(cacheKey)
        val briefingRequest = async { runCatching { api.assistantBriefing() } }
        val tasksRequest = async { runCatching { api.assistantTasks() } }
        val briefingResult = briefingRequest.await()
        val tasksResult = tasksRequest.await()
        val refreshedAt = System.currentTimeMillis()

        if (cacheKey == currentCacheKeyOrNull()) {
            briefingResult.getOrNull()?.let { cache.saveBriefing(cacheKey, it, refreshedAt) }
            tasksResult.getOrNull()?.let { cache.saveTasks(cacheKey, it, refreshedAt) }
        }

        val failures = listOfNotNull(
            briefingResult.exceptionOrNull()?.let { "브리핑: ${it.userMessage()}" },
            tasksResult.exceptionOrNull()?.let { "할 일: ${it.userMessage()}" },
        )
        val usedCachedBriefing = briefingResult.isFailure && cached.briefing != null
        val hasCachedTasksSnapshot = cached.tasksSavedAtMillis != null || cached.tasks.isNotEmpty()
        val usedCachedTasks = tasksResult.isFailure && hasCachedTasksSnapshot
        val briefingUpdatedAt = when {
            briefingResult.isSuccess -> refreshedAt
            usedCachedBriefing -> cached.briefingSavedAtMillis
            else -> null
        }
        val tasksUpdatedAt = when {
            tasksResult.isSuccess -> refreshedAt
            usedCachedTasks -> cached.tasksSavedAtMillis
            else -> null
        }
        AssistantDashboardResult(
            briefing = briefingResult.getOrNull() ?: cached.briefing,
            tasks = tasksResult.getOrNull() ?: cached.tasks,
            isStale = usedCachedBriefing || usedCachedTasks,
            error = failures.takeIf { it.isNotEmpty() }?.joinToString(" · "),
            updatedAtMillis = listOfNotNull(briefingUpdatedAt, tasksUpdatedAt).minOrNull(),
        )
    }

    suspend fun status(): AssistantStatus = api.assistantStatus()

    suspend fun createTask(title: String, priority: String): AssistantTask =
        api.createAssistantTask(title = title, priority = priority)

    suspend fun setTaskCompleted(taskId: String, completed: Boolean): AssistantTask =
        api.updateAssistantTask(taskId = taskId, completed = completed)

    suspend fun deleteTask(taskId: String): Boolean = api.deleteAssistantTask(taskId)

    fun cacheTasks(tasks: List<AssistantTask>) {
        cache.saveTasks(requireCacheKey(), tasks)
    }

    suspend fun chat(
        message: String,
        history: List<AssistantChatHistoryItem>,
    ): AssistantChatResponse = api.assistantChat(message, history)

    fun clearCurrentUserCache() {
        currentCacheKeyOrNull()?.let(cache::clear)
    }

    private fun requireUserId(): String =
        authRepository.currentUserId() ?: error("로그인이 필요해요.")

    private fun requireCacheKey(): String = cacheKey(requireUserId())

    private fun currentCacheKeyOrNull(): String? = authRepository.currentUserId()?.let(::cacheKey)

    private fun cacheKey(userId: String): String = "$userId@${cacheNamespace()}"

    private fun Throwable.userMessage(): String =
        message?.takeIf { it.isNotBlank() } ?: "서버에 연결하지 못했어요."

    private fun Long?.isExpiredAt(now: Long): Boolean =
        this == null || now - this > CACHE_FRESHNESS_MILLIS

    companion object {
        private const val CACHE_FRESHNESS_MILLIS = 15 * 60 * 1000L
    }
}
