package com.poapper.morningcall

import android.app.Activity
import android.app.Application
import android.content.Intent
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.messaging.FirebaseMessaging
import com.poapper.morningcall.alarm.LocalFallbackScheduler
import com.poapper.morningcall.billing.SubscriptionManager
import com.poapper.morningcall.call.CallManager
import com.poapper.morningcall.data.APIClient
import com.poapper.morningcall.data.AssistantCache
import com.poapper.morningcall.data.AssistantPreferences
import com.poapper.morningcall.data.AssistantRepository
import com.poapper.morningcall.data.AuthRepository
import com.poapper.morningcall.data.CharacterStore
import com.poapper.morningcall.model.Alarm
import com.poapper.morningcall.model.AssistantBriefing
import com.poapper.morningcall.model.AssistantChatHistoryItem
import com.poapper.morningcall.model.AssistantStatus
import com.poapper.morningcall.model.AssistantTask
import com.poapper.morningcall.model.CharacterPreference
import com.poapper.morningcall.model.DayPeriod
import com.poapper.morningcall.model.Event
import com.poapper.morningcall.model.OnboardingStep
import com.poapper.morningcall.model.UserInfo
import java.io.IOException
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.TimeZone
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await

data class AppUiState(
    val isLoggedIn: Boolean = false,
    val onboardingStep: OnboardingStep = OnboardingStep.Loading,
    val user: UserInfo? = null,
    val alarms: List<Alarm> = emptyList(),
    val events: List<Event> = emptyList(),
    val selectedCharacter: CharacterPreference = CharacterPreference.Haru,
    val selectedLanguage: String = "한국어",
    val calendarConnected: Boolean = false,
    val isLoading: Boolean = false,
    val error: String? = null,
)

data class AssistantDashboardUiState(
    val briefing: AssistantBriefing? = null,
    val tasks: List<AssistantTask> = emptyList(),
    val providerStatus: AssistantStatus? = null,
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val isStale: Boolean = false,
    val error: String? = null,
    val updatedAtMillis: Long? = null,
    val mutatingTaskIds: Set<String> = emptySet(),
)

data class ChatUiMessage(
    val id: Long,
    val role: String,
    val content: String,
    val provider: String? = null,
    val fallback: Boolean = false,
)

data class AssistantChatUiState(
    val messages: List<ChatUiMessage> = emptyList(),
    val isSending: Boolean = false,
    val error: String? = null,
)

data class AssistantSettingsUiState(
    val backendUrl: String = APIClient.BASE_URL,
    val refreshOnOpen: Boolean = true,
    val assistantNotificationsEnabled: Boolean = true,
    val error: String? = null,
)

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val context = application.applicationContext
    private val authRepository = AuthRepository(context)
    private val assistantPreferences = AssistantPreferences(context)
    private val api = APIClient(authRepository) { assistantPreferences.backendUrl }
    private val assistantRepository = AssistantRepository(
        api = api,
        authRepository = authRepository,
        cache = AssistantCache(context),
        cacheNamespace = { assistantPreferences.backendUrl },
    )
    private val characterStore = CharacterStore(context)
    private val subscriptionManager = SubscriptionManager(context, api, authRepository)
    private val assistantOperationMutex = Mutex()
    private var backendGeneration = 0L
    private var lastAssistantOpenAtMillis = 0L

    private val _state = MutableStateFlow(AppUiState(isLoggedIn = authRepository.isLoggedIn))
    val state: StateFlow<AppUiState> = _state.asStateFlow()
    val subscriptionState = subscriptionManager.state

    private val _assistantState = MutableStateFlow(AssistantDashboardUiState())
    val assistantState: StateFlow<AssistantDashboardUiState> = _assistantState.asStateFlow()

    private val _chatState = MutableStateFlow(AssistantChatUiState())
    val chatState: StateFlow<AssistantChatUiState> = _chatState.asStateFlow()

    private val _assistantSettings = MutableStateFlow(
        AssistantSettingsUiState(
            backendUrl = assistantPreferences.backendUrl,
            refreshOnOpen = assistantPreferences.refreshOnOpen,
            assistantNotificationsEnabled = assistantPreferences.assistantNotificationsEnabled,
        ),
    )
    val assistantSettings: StateFlow<AssistantSettingsUiState> = _assistantSettings.asStateFlow()

    init {
        if (authRepository.isLoggedIn) bootstrap()
    }

    fun googleIntent(): Intent = authRepository.googleSignInIntent()

    fun calendarIntent(): Intent = authRepository.googleSignInIntent()

    fun handleGoogleResult(data: Intent?) {
        viewModelScope.launch {
            runCatching {
                _state.value = _state.value.copy(isLoading = true, error = null)
                authRepository.finishGoogleSignIn(data)
                bootstrap()
            }.onFailure { setError(it) }
        }
    }

    fun bootstrap() {
        val generation = backendGeneration
        viewModelScope.launch {
            runCatching {
                _state.value = _state.value.copy(isLoggedIn = true, isLoading = true, error = null)
                val user = api.checkUser()
                if (generation != backendGeneration) return@launch
                subscriptionManager.configure()
                val step = when {
                    user.name.isNullOrBlank() -> OnboardingStep.EnterName
                    user.location.isNullOrBlank() -> OnboardingStep.RequestLocation
                    else -> OnboardingStep.Completed
                }
                _state.value = _state.value.copy(
                    user = user,
                    onboardingStep = step,
                    selectedLanguage = user.language ?: "한국어",
                    selectedCharacter = characterStore.current,
                )
                registerFcmTokenSafely(generation)
                if (generation != backendGeneration) return@launch
                if (step == OnboardingStep.Completed) {
                    refreshAlarms(generation)
                    refreshCalendarStatus(generation)
                    refreshEvents(generation)
                    loadAssistantForOpen()
                }
            }.onFailure { error ->
                if (generation == backendGeneration && !showCachedAssistantAfterBootstrapFailure(error)) {
                    setError(error)
                }
            }
            if (generation == backendGeneration) {
                _state.value = _state.value.copy(isLoading = false)
            }
        }
    }

    fun loadAssistantForOpen() {
        val now = System.currentTimeMillis()
        if (now - lastAssistantOpenAtMillis < ASSISTANT_OPEN_DEBOUNCE_MILLIS) return
        lastAssistantOpenAtMillis = now
        val cached = runCatching { assistantRepository.cachedDashboard() }.getOrNull()
        if (cached != null && (cached.briefing != null || cached.tasks.isNotEmpty())) {
            _assistantState.value = _assistantState.value.copy(
                briefing = cached.briefing,
                tasks = cached.tasks.sortedForDisplay(),
                isStale = cached.isStale,
                updatedAtMillis = cached.updatedAtMillis,
            )
        }
        refreshAssistantStatus()
        if (assistantPreferences.refreshOnOpen || cached?.briefing == null) {
            refreshAssistant()
        }
    }

    fun onCommandCenterStarted() {
        loadAssistantForOpen()
    }

    fun refreshAssistant() {
        if (_assistantState.value.isRefreshing || _assistantState.value.mutatingTaskIds.isNotEmpty()) return
        val generation = backendGeneration
        val hasContent = _assistantState.value.briefing != null
        _assistantState.value = _assistantState.value.copy(
            isLoading = !hasContent,
            isRefreshing = true,
            error = null,
        )
        viewModelScope.launch {
            if (generation != backendGeneration) return@launch
            runCatching {
                assistantOperationMutex.withLock { assistantRepository.refreshDashboard() }
            }
                .onSuccess { result ->
                    if (generation != backendGeneration) return@onSuccess
                    _assistantState.value = _assistantState.value.copy(
                        briefing = result.briefing,
                        tasks = result.tasks.sortedForDisplay(),
                        isLoading = false,
                        isRefreshing = false,
                        isStale = result.isStale,
                        error = result.error,
                        updatedAtMillis = result.updatedAtMillis,
                    )
                }
                .onFailure { error ->
                    if (generation != backendGeneration) return@onFailure
                    _assistantState.value = _assistantState.value.copy(
                        isLoading = false,
                        isRefreshing = false,
                        error = error.readableMessage(),
                    )
                }
            if (generation == backendGeneration) refreshAssistantStatus()
        }
    }

    fun refreshAssistantStatus() {
        val generation = backendGeneration
        viewModelScope.launch {
            runCatching { assistantRepository.status() }
                .onSuccess { status ->
                    if (generation != backendGeneration) return@onSuccess
                    _assistantState.value = _assistantState.value.copy(providerStatus = status)
                    _assistantSettings.value = _assistantSettings.value.copy(error = null)
                }
                .onFailure { error ->
                    if (generation != backendGeneration) return@onFailure
                    _assistantSettings.value = _assistantSettings.value.copy(
                        error = "AI 설정 상태를 확인하지 못했어요: ${error.readableMessage()}",
                    )
                }
        }
    }

    fun createTask(title: String, highPriority: Boolean) {
        val normalized = title.trim()
        if (normalized.isBlank()) return
        mutateTask(NEW_TASK_ID) { generation ->
            val created = assistantRepository.createTask(
                title = normalized,
                priority = if (highPriority) "high" else "normal",
            )
            if (generation != backendGeneration) return@mutateTask
            val updated = (_assistantState.value.tasks + created).distinctBy { it.id }.sortedForDisplay()
            assistantRepository.cacheTasks(updated)
            _assistantState.value = _assistantState.value.copy(tasks = updated)
        }
    }

    fun setTaskCompleted(task: AssistantTask, completed: Boolean) {
        mutateTask(task.id) { generation ->
            assistantRepository.setTaskCompleted(task.id, completed)
            if (generation != backendGeneration) return@mutateTask
            val updated = if (completed) {
                _assistantState.value.tasks.filterNot { it.id == task.id }
            } else {
                _assistantState.value.tasks.map { if (it.id == task.id) it.copy(completed = false) else it }
            }.sortedForDisplay()
            assistantRepository.cacheTasks(updated)
            _assistantState.value = _assistantState.value.copy(tasks = updated)
        }
    }

    fun deleteTask(task: AssistantTask) {
        mutateTask(task.id) { generation ->
            check(assistantRepository.deleteTask(task.id)) { "할 일을 삭제하지 못했어요." }
            if (generation != backendGeneration) return@mutateTask
            val updated = _assistantState.value.tasks.filterNot { it.id == task.id }
            assistantRepository.cacheTasks(updated)
            _assistantState.value = _assistantState.value.copy(tasks = updated)
        }
    }

    fun sendChat(rawMessage: String) {
        val message = rawMessage.trim()
        if (message.isBlank() || _chatState.value.isSending) return
        val generation = backendGeneration
        val priorMessages = _chatState.value.messages
        val userMessage = ChatUiMessage(
            id = System.nanoTime(),
            role = "user",
            content = message,
        )
        _chatState.value = _chatState.value.copy(
            messages = priorMessages + userMessage,
            isSending = true,
            error = null,
        )
        viewModelScope.launch {
            val history = priorMessages.takeLast(12).map {
                AssistantChatHistoryItem(role = it.role, content = it.content)
            }
            runCatching { assistantRepository.chat(message, history) }
                .onSuccess { response ->
                    if (generation != backendGeneration) return@onSuccess
                    val assistantMessage = ChatUiMessage(
                        id = System.nanoTime(),
                        role = "assistant",
                        content = response.reply,
                        provider = response.provider,
                        fallback = response.fallback,
                    )
                    _chatState.value = _chatState.value.copy(
                        messages = _chatState.value.messages + assistantMessage,
                        isSending = false,
                    )
                }
                .onFailure { error ->
                    if (generation != backendGeneration) return@onFailure
                    _chatState.value = _chatState.value.copy(
                        isSending = false,
                        error = error.readableMessage(),
                    )
                }
        }
    }

    fun saveBackendUrl(rawUrl: String) {
        runCatching {
            val normalized = AssistantPreferences.normalizeBackendUrl(rawUrl)
            val changed = normalized != assistantPreferences.backendUrl
            if (changed) {
                backendGeneration += 1
                lastAssistantOpenAtMillis = 0L
                assistantRepository.clearCurrentUserCache()
                assistantPreferences.backendUrl = normalized
                _state.value = AppUiState(
                    isLoggedIn = authRepository.isLoggedIn,
                    onboardingStep = OnboardingStep.Completed,
                    selectedCharacter = characterStore.current,
                )
                _assistantState.value = AssistantDashboardUiState()
                _chatState.value = AssistantChatUiState()
                subscriptionManager.resetForBackendChange()
                LocalFallbackScheduler.sync(context, emptyList())
            }
            _assistantSettings.value = _assistantSettings.value.copy(
                backendUrl = normalized,
                error = null,
            )
            if (changed) bootstrap() else refreshAssistant()
        }.onFailure { error ->
            _assistantSettings.value = _assistantSettings.value.copy(
                error = error.message ?: "서버 URL을 저장하지 못했어요.",
            )
        }
    }

    fun setRefreshOnOpen(enabled: Boolean) {
        assistantPreferences.refreshOnOpen = enabled
        _assistantSettings.value = _assistantSettings.value.copy(refreshOnOpen = enabled)
    }

    fun setAssistantNotificationsEnabled(enabled: Boolean) {
        assistantPreferences.assistantNotificationsEnabled = enabled
        _assistantSettings.value = _assistantSettings.value.copy(
            assistantNotificationsEnabled = enabled,
        )
    }

    fun saveName(name: String) {
        viewModelScope.launch {
            runCatching {
                api.updateUser(name = name)
                bootstrap()
            }.onFailure { setError(it) }
        }
    }

    fun saveLocation(location: String) {
        viewModelScope.launch {
            runCatching {
                api.updateLocation(location, TimeZone.getDefault().id)
                bootstrap()
            }.onFailure { setError(it) }
        }
    }

    fun refreshAlarms(expectedGeneration: Long = backendGeneration) {
        viewModelScope.launch {
            if (expectedGeneration != backendGeneration) return@launch
            val result = runCatching { api.loadAlarms() }
            if (expectedGeneration != backendGeneration) return@launch
            result
                .onSuccess { alarms ->
                    _state.value = _state.value.copy(alarms = alarms)
                    LocalFallbackScheduler.sync(context, alarms.filter { it.targetDate.isNullOrBlank() })
                }
                .onFailure { setError(it) }
        }
    }

    fun saveWeekdayAlarm(day: Int, existing: Alarm?, time: String, wakeStyle: String) {
        viewModelScope.launch {
            runCatching {
                val character = characterStore.current
                val wakeIntensity = if (wakeStyle == "aggressive") "firm" else "gentle"
                val saved = if (existing == null) {
                    api.createAlarm(
                        time = time,
                        repeatDays = listOf(day),
                        targetDate = null,
                        isOn = true,
                        wakeIntensity = wakeIntensity,
                        personality = wakeStyle,
                        voice = character.voiceName,
                        role = character.roleName,
                        timeZone = TimeZone.getDefault().id,
                    )
                } else {
                    api.updateAlarm(
                        alarmId = existing.id,
                        time = time,
                        repeatDays = listOf(day),
                        targetDate = null,
                        isOn = true,
                        wakeIntensity = wakeIntensity,
                        personality = wakeStyle,
                        voice = character.voiceName,
                        role = character.roleName,
                        timeZone = TimeZone.getDefault().id,
                    )
                }
                LocalFallbackScheduler.reschedule(context, saved)
                refreshAlarms()
            }.onFailure { setError(it) }
        }
    }

    fun deleteAlarm(alarm: Alarm) {
        viewModelScope.launch {
            runCatching {
                api.deleteAlarm(alarm.id)
                LocalFallbackScheduler.cancel(context, alarm.id)
                refreshAlarms()
            }.onFailure { setError(it) }
        }
    }

    fun saveLanguage(language: String) {
        viewModelScope.launch {
            runCatching {
                api.updateUser(language = language)
                _state.value = _state.value.copy(selectedLanguage = language)
            }.onFailure { setError(it) }
        }
    }

    fun selectCharacter(character: CharacterPreference) {
        characterStore.current = character
        _state.value = _state.value.copy(selectedCharacter = character)
    }

    fun testCall(wakeIntensity: String) {
        viewModelScope.launch {
            runCatching {
                val character = characterStore.current
                val info = api.testCall(wakeIntensity, character.voiceName, character.roleName)
                CallManager.startOutgoing(context, info.lkUrl, info.lkToken, character.roleName)
            }.onFailure { setError(it) }
        }
    }

    fun purchaseMonthly(activity: Activity) {
        subscriptionManager.purchaseMonthly(activity)
    }

    fun restorePurchases() {
        subscriptionManager.restorePurchases()
    }

    fun refreshSubscription() {
        subscriptionManager.refresh()
    }

    fun handleCalendarResult(data: Intent?) {
        viewModelScope.launch {
            runCatching {
                val code = authRepository.serverAuthCodeFromIntent(data)
                val status = api.connectCalendar(code)
                _state.value = _state.value.copy(calendarConnected = status.connected)
                refreshEvents()
                refreshAssistant()
            }.onFailure { setError(it) }
        }
    }

    fun disconnectCalendar() {
        viewModelScope.launch {
            runCatching {
                val status = api.disconnectCalendar()
                _state.value = _state.value.copy(
                    calendarConnected = status.connected,
                    events = emptyList(),
                )
                refreshAssistant()
            }.onFailure { setError(it) }
        }
    }

    fun signOut() {
        backendGeneration += 1
        lastAssistantOpenAtMillis = 0L
        assistantRepository.clearCurrentUserCache()
        LocalFallbackScheduler.sync(context, emptyList())
        authRepository.signOut()
        _state.value = AppUiState(isLoggedIn = false)
        _assistantState.value = AssistantDashboardUiState()
        _chatState.value = AssistantChatUiState()
    }

    fun nextAlarmSummary(): Pair<Alarm, LocalDateTime>? {
        val now = LocalDateTime.now()
        return _state.value.alarms
            .filter { it.isOn }
            .mapNotNull { alarm -> nextFireDate(alarm, now)?.let { alarm to it } }
            .minByOrNull { it.second }
    }

    fun countdownText(target: LocalDateTime): String {
        val rawDuration = Duration.between(LocalDateTime.now(), target)
        val duration = if (rawDuration.isNegative) Duration.ZERO else rawDuration
        val days = duration.toDays()
        val hours = duration.toHours() % 24
        val minutes = duration.toMinutes() % 60
        val seconds = duration.seconds % 60
        return when {
            days > 0 -> "${days}일 ${hours}시간 ${minutes}분 ${seconds}초"
            hours > 0 -> "${hours}시간 ${minutes}분 ${seconds}초"
            minutes > 0 -> "${minutes}분 ${seconds}초"
            seconds > 0 -> "${seconds}초"
            else -> "곧"
        }
    }

    fun currentDayPeriod(): DayPeriod {
        val hour = LocalTime.now().hour
        return when (hour) {
            in 5..11 -> DayPeriod.Morning
            in 12..17 -> DayPeriod.Afternoon
            else -> DayPeriod.Night
        }
    }

    private fun mutateTask(taskId: String, action: suspend (Long) -> Unit) {
        if (taskId in _assistantState.value.mutatingTaskIds) return
        val generation = backendGeneration
        _assistantState.value = _assistantState.value.copy(
            mutatingTaskIds = _assistantState.value.mutatingTaskIds + taskId,
            error = null,
        )
        viewModelScope.launch {
            val result = runCatching {
                assistantOperationMutex.withLock {
                    if (generation == backendGeneration) action(generation)
                }
            }
                .onFailure { error ->
                    if (generation != backendGeneration) return@onFailure
                    _assistantState.value = _assistantState.value.copy(
                        error = error.readableMessage(),
                    )
                }
            if (generation != backendGeneration) return@launch
            _assistantState.value = _assistantState.value.copy(
                mutatingTaskIds = _assistantState.value.mutatingTaskIds - taskId,
            )
            if (result.isSuccess) refreshAssistant()
        }
    }

    private fun showCachedAssistantAfterBootstrapFailure(error: Throwable): Boolean {
        val cached = runCatching { assistantRepository.cachedDashboard() }.getOrNull() ?: return false
        if (cached.briefing == null && cached.tasks.isEmpty()) return false
        lastAssistantOpenAtMillis = System.currentTimeMillis()
        _assistantState.value = _assistantState.value.copy(
            briefing = cached.briefing,
            tasks = cached.tasks.sortedForDisplay(),
            isLoading = false,
            isRefreshing = false,
            isStale = true,
            error = "서버에 연결하지 못해 저장된 정보를 표시해요. ${error.readableMessage()}",
            updatedAtMillis = cached.updatedAtMillis,
        )
        _state.value = _state.value.copy(
            onboardingStep = OnboardingStep.Completed,
            selectedCharacter = characterStore.current,
            isLoading = false,
            error = null,
        )
        return true
    }

    private suspend fun registerFcmToken(expectedGeneration: Long) {
        val token = FirebaseMessaging.getInstance().token.await()
        if (expectedGeneration != backendGeneration) return
        api.registerDeviceToken(token)
    }

    private suspend fun registerFcmTokenSafely(expectedGeneration: Long) {
        runCatching { registerFcmToken(expectedGeneration) }
            .onFailure {
                if (expectedGeneration == backendGeneration) {
                    _state.value = _state.value.copy(
                        error = "FCM 토큰 등록 실패: ${it.readableMessage()}",
                    )
                }
            }
    }

    private fun refreshCalendarStatus(expectedGeneration: Long = backendGeneration) {
        viewModelScope.launch {
            if (expectedGeneration != backendGeneration) return@launch
            val result = runCatching { api.calendarStatus() }
            if (expectedGeneration != backendGeneration) return@launch
            result.onSuccess { status ->
                _state.value = _state.value.copy(calendarConnected = status.connected)
            }
        }
    }

    private fun refreshEvents(expectedGeneration: Long = backendGeneration) {
        viewModelScope.launch {
            if (expectedGeneration != backendGeneration) return@launch
            val result = runCatching { api.todayEvents() }
            if (expectedGeneration != backendGeneration) return@launch
            result.onSuccess { events ->
                _state.value = _state.value.copy(events = events)
            }
        }
    }

    private fun nextFireDate(alarm: Alarm, now: LocalDateTime): LocalDateTime? {
        val time = LocalTime.parse(alarm.time, DateTimeFormatter.ofPattern("HH:mm", Locale.US))
        if (!alarm.targetDate.isNullOrBlank()) {
            val candidate = LocalDateTime.of(LocalDate.parse(alarm.targetDate), time)
            return candidate.takeIf { it.isAfter(now) }
        }
        return alarm.repeatDays.distinct().map { day ->
            var date = LocalDate.now(ZoneId.systemDefault())
            while (weekdayIndex(date) != day) date = date.plusDays(1)
            var candidate = LocalDateTime.of(date, time)
            if (!candidate.isAfter(now)) candidate = candidate.plusWeeks(1)
            candidate
        }.minOrNull()
    }

    private fun weekdayIndex(date: LocalDate): Int = date.dayOfWeek.value % 7

    private fun setError(error: Throwable) {
        _state.value = _state.value.copy(isLoading = false, error = error.readableMessage())
    }

    private fun Throwable.readableMessage(): String {
        val message = message ?: return "요청에 실패했어요."
        return when {
            this is IOException && message.startsWith("HTTP 403") ->
                "서버 인증에 실패했어요. Android Firebase 앱이 서버의 Firebase 프로젝트와 같은지 확인해 주세요. ($message)"
            this is IOException && message.startsWith("HTTP") ->
                "서버 요청에 실패했어요. $message"
            else -> message
        }
    }

    private fun List<AssistantTask>.sortedForDisplay(): List<AssistantTask> =
        sortedWith(
            compareByDescending<AssistantTask> { it.priority == "high" }
                .thenBy { it.dueAt ?: "9999" }
                .thenBy { it.createdAt ?: "" },
        )

    companion object {
        const val NEW_TASK_ID = "__new_task__"
        private const val ASSISTANT_OPEN_DEBOUNCE_MILLIS = 30_000L
    }
}
