package com.poapper.morningcall.model

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AssistantModelsTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `structured briefing contract parses calendar tasks and AI metadata`() {
        val payload = """
            {
              "generatedAt": "2026-10-07T12:00:00.000Z",
              "date": "2026-10-07",
              "timeZone": "America/Toronto",
              "greeting": "좋은 아침이에요, 원빈님.",
              "summary": "오전 회의 전에 제안서를 마무리하세요.",
              "ai": {
                "provider": "claude",
                "model": "claude-sonnet-5-5",
                "generated": true,
                "fallback": false
              },
              "sources": {
                "calendar": "ok",
                "tasks": "ok",
                "memory": "empty"
              },
              "sections": [
                {
                  "type": "schedule",
                  "title": "오늘 일정",
                  "status": "ok",
                  "items": [
                    {
                      "id": "event-1",
                      "title": "연구 미팅",
                      "startAt": "2026-10-07T14:00:00Z",
                      "endAt": "2026-10-07T15:00:00Z"
                    }
                  ]
                },
                {
                  "type": "tasks",
                  "title": "해야 할 일",
                  "status": "ok",
                  "items": [
                    {
                      "id": "task-1",
                      "title": "제안서 마무리",
                      "dueAt": "2026-10-07T13:00:00Z",
                      "priority": "high",
                      "completed": false
                    }
                  ]
                }
              ],
              "futureField": "ignored"
            }
        """.trimIndent()

        val briefing = json.decodeFromString(AssistantBriefing.serializer(), payload)

        assertEquals("claude", briefing.ai.provider)
        assertTrue(briefing.ai.generated)
        assertFalse(briefing.ai.fallback)
        assertEquals("ok", briefing.sources.calendar)
        assertEquals("empty", briefing.sources.memory)
        assertEquals("event-1", briefing.sections[0].items.single().id)
        assertEquals("high", briefing.sections[1].items.single().priority)
    }

    @Test
    fun `task list accepts nullable dates and defaults normal priority`() {
        val payload = """
            {
              "tasks": [
                {
                  "id": "task-1",
                  "title": "논문 읽기",
                  "priority": "normal",
                  "dueAt": null,
                  "completed": false,
                  "createdAt": "2026-10-07T12:00:00Z",
                  "completedAt": null
                }
              ]
            }
        """.trimIndent()

        val response = json.decodeFromString(AssistantTasksResponse.serializer(), payload)

        assertEquals("normal", response.tasks.single().priority)
        assertNull(response.tasks.single().dueAt)
        assertNull(response.tasks.single().completedAt)
    }

    @Test
    fun `status and chat fallback responses parse`() {
        val status = json.decodeFromString(
            AssistantStatus.serializer(),
            """{"provider":"claude","model":"claude-sonnet-5-5","configured":true}""",
        )
        val chat = json.decodeFromString(
            AssistantChatResponse.serializer(),
            """{"reply":"오늘 할 일은 두 개예요.","provider":"claude","model":"claude-sonnet-5-5","fallback":false}""",
        )

        assertTrue(status.configured)
        assertEquals("오늘 할 일은 두 개예요.", chat.reply)
        assertFalse(chat.fallback)
    }
}
