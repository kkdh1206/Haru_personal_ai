package com.poapper.morningcall.model

import kotlinx.serialization.Serializable

@Serializable
data class AssistantStatus(
    val provider: String = "unknown",
    val model: String = "",
    val configured: Boolean = false,
)

@Serializable
data class AssistantBriefing(
    val generatedAt: String = "",
    val date: String = "",
    val timeZone: String = "",
    val greeting: String = "",
    val summary: String = "",
    val ai: BriefingAi = BriefingAi(),
    val sources: BriefingSources = BriefingSources(),
    val sections: List<BriefingSection> = emptyList(),
)

@Serializable
data class BriefingAi(
    val provider: String = "unknown",
    val model: String = "",
    val generated: Boolean = false,
    val fallback: Boolean = false,
)

@Serializable
data class BriefingSources(
    val calendar: String = "unavailable",
    val tasks: String = "unavailable",
    val memory: String = "unavailable",
)

@Serializable
data class BriefingSection(
    val type: String = "unknown",
    val title: String = "",
    val status: String = "unavailable",
    val items: List<BriefingItem> = emptyList(),
)

@Serializable
data class BriefingItem(
    val id: String = "",
    val title: String = "",
    val subtitle: String? = null,
    val startAt: String? = null,
    val endAt: String? = null,
    val dueAt: String? = null,
    val priority: String? = null,
    val completed: Boolean? = null,
)

@Serializable
data class AssistantTask(
    val id: String,
    val title: String,
    val priority: String = "normal",
    val dueAt: String? = null,
    val completed: Boolean = false,
    val createdAt: String? = null,
    val completedAt: String? = null,
)

@Serializable
data class AssistantTasksResponse(
    val tasks: List<AssistantTask> = emptyList(),
)

@Serializable
data class AssistantTaskResponse(
    val task: AssistantTask,
)

@Serializable
data class AssistantDeleteResponse(
    val success: Boolean = false,
)

@Serializable
data class AssistantChatHistoryItem(
    val role: String,
    val content: String,
)

@Serializable
data class AssistantChatResponse(
    val reply: String = "",
    val provider: String = "unknown",
    val model: String = "",
    val fallback: Boolean = false,
)
