package com.poapper.morningcall

import android.app.Application
import android.content.Intent
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.messaging.FirebaseMessaging
import com.poapper.morningcall.alarm.LocalFallbackScheduler
import com.poapper.morningcall.call.CallManager
import com.poapper.morningcall.data.APIClient
import com.poapper.morningcall.data.AuthRepository
import com.poapper.morningcall.data.CharacterStore
import com.poapper.morningcall.model.Alarm
import com.poapper.morningcall.model.CharacterPreference
import com.poapper.morningcall.model.DayPeriod
import com.poapper.morningcall.model.Event
import com.poapper.morningcall.model.OnboardingStep
import com.poapper.morningcall.model.UserInfo
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.io.IOException
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.TimeZone

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

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val context = application.applicationContext
    private val authRepository = AuthRepository(context)
    private val api = APIClient(authRepository)
    private val characterStore = CharacterStore(context)
    private val _state = MutableStateFlow(AppUiState(isLoggedIn = authRepository.isLoggedIn))
    val state: StateFlow<AppUiState> = _state.asStateFlow()

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
        viewModelScope.launch {
            runCatching {
                _state.value = _state.value.copy(isLoggedIn = true, isLoading = true, error = null)
                val user = api.checkUser()
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
                registerFcmTokenSafely()
                if (step == OnboardingStep.Completed) {
                    refreshAlarms()
                    refreshCalendarStatus()
                    refreshEvents()
                }
            }.onFailure { setError(it) }
            _state.value = _state.value.copy(isLoading = false)
        }
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

    fun refreshAlarms() {
        viewModelScope.launch {
            runCatching {
                val alarms = api.loadAlarms()
                _state.value = _state.value.copy(alarms = alarms)
                LocalFallbackScheduler.sync(context, alarms.filter { it.targetDate.isNullOrBlank() })
            }.onFailure { setError(it) }
        }
    }

    fun saveWeekdayAlarm(day: Int, existing: Alarm?, time: String, wakeStyle: String) {
        viewModelScope.launch {
            runCatching {
                val character = characterStore.current
                val wakeIntensity = when (wakeStyle) {
                    "aggressive" -> "firm"
                    else -> "gentle"
                }
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

    fun handleCalendarResult(data: Intent?) {
        viewModelScope.launch {
            runCatching {
                val code = authRepository.serverAuthCodeFromIntent(data)
                val status = api.connectCalendar(code)
                _state.value = _state.value.copy(calendarConnected = status.connected)
            }.onFailure { setError(it) }
        }
    }

    fun disconnectCalendar() {
        viewModelScope.launch {
            runCatching {
                val status = api.disconnectCalendar()
                _state.value = _state.value.copy(calendarConnected = status.connected)
            }.onFailure { setError(it) }
        }
    }

    fun signOut() {
        authRepository.signOut()
        _state.value = AppUiState(isLoggedIn = false)
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

    private suspend fun registerFcmToken() {
        val token = FirebaseMessaging.getInstance().token.await()
        api.registerDeviceToken(token)
    }

    private suspend fun registerFcmTokenSafely() {
        runCatching { registerFcmToken() }
            .onFailure {
                _state.value = _state.value.copy(
                    error = "FCM 토큰 등록 실패: ${it.readableMessage()}",
                )
            }
    }

    private fun refreshCalendarStatus() {
        viewModelScope.launch {
            runCatching {
                _state.value = _state.value.copy(calendarConnected = api.calendarStatus().connected)
            }
        }
    }

    private fun refreshEvents() {
        viewModelScope.launch {
            runCatching {
                _state.value = _state.value.copy(events = api.todayEvents())
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
}
