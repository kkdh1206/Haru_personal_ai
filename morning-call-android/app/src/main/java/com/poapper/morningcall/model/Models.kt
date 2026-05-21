package com.poapper.morningcall.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Alarm(
    @SerialName("_id") val id: String,
    val time: String,
    val isOn: Boolean,
    val repeatDays: List<Int> = emptyList(),
    val targetDate: String? = null,
    val personality: String = "gentle",
    val voice: String = "Rasalgethi",
    val role: String = "하루",
    val wakeIntensity: String = "gentle",
)

@Serializable
data class UserInfo(
    val name: String? = null,
    val location: String? = null,
    val interest: String? = null,
    val language: String? = null,
)

@Serializable
data class UserSettings(
    val name: String = "",
    val language: String = "한국어",
)

@Serializable
data class LiveKitInfo(
    val lkToken: String,
    val lkUrl: String,
)

@Serializable
data class CalendarConnectionStatus(
    val connected: Boolean,
)

@Serializable
data class Event(
    val id: String? = null,
    val summary: String? = null,
    val start: String? = null,
    val end: String? = null,
    val location: String? = null,
)

enum class OnboardingStep {
    Loading,
    EnterName,
    RequestLocation,
    Completed,
}

enum class DayPeriod {
    Morning,
    Afternoon,
    Night,
}

enum class CharacterPreference(
    val displayName: String,
    val roleName: String,
    val voiceName: String,
) {
    Haru("하루", "하루", "Rasalgethi"),
    Hari("하리", "하리", "Leda"),
}
