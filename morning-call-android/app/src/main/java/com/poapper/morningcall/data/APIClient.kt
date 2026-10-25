package com.poapper.morningcall.data

import com.poapper.morningcall.model.Alarm
import com.poapper.morningcall.model.AssistantBriefing
import com.poapper.morningcall.model.AssistantChatHistoryItem
import com.poapper.morningcall.model.AssistantChatResponse
import com.poapper.morningcall.model.AssistantDeleteResponse
import com.poapper.morningcall.model.AssistantStatus
import com.poapper.morningcall.model.AssistantTask
import com.poapper.morningcall.model.AssistantTaskResponse
import com.poapper.morningcall.model.AssistantTasksResponse
import com.poapper.morningcall.model.CalendarConnectionStatus
import com.poapper.morningcall.model.Event
import com.poapper.morningcall.model.LiveKitInfo
import com.poapper.morningcall.model.UserInfo
import com.poapper.morningcall.model.UserSettings
import com.poapper.morningcall.model.BillingEntitlement
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class APIClient(
    private val authRepository: AuthRepository,
    private val baseUrlProvider: () -> String = { BASE_URL },
) {
    private val json = Json {
        ignoreUnknownKeys = true
    }
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    private val mediaType = "application/json; charset=utf-8".toMediaType()

    suspend fun checkUser(): UserInfo = request("/user", "GET", UserInfo.serializer())

    suspend fun updateUser(name: String? = null, language: String? = null): UserSettings {
        val body = buildJsonObject {
            name?.let { put("name", JsonPrimitive(it)) }
            language?.let { put("language", JsonPrimitive(it)) }
        }
        return request("/user", "PUT", UserSettings.serializer(), body)
    }

    suspend fun updateLocation(location: String, timeZone: String): UserInfo {
        val body = buildJsonObject {
            put("location", JsonPrimitive(location))
            put("timeZone", JsonPrimitive(timeZone))
        }
        return request("/user/location", "PATCH", UserInfo.serializer(), body)
    }

    suspend fun registerDeviceToken(token: String) {
        val body = buildJsonObject {
            put("deviceToken", JsonPrimitive(token))
            put("deviceType", JsonPrimitive("android"))
        }
        requestVoid("/user/device-token", "PATCH", body)
    }

    suspend fun loadAlarms(): List<Alarm> =
        request("/alarm", "GET", ListSerializer(Alarm.serializer()))

    suspend fun createAlarm(
        time: String,
        repeatDays: List<Int>,
        targetDate: String?,
        isOn: Boolean,
        wakeIntensity: String,
        personality: String,
        voice: String,
        role: String,
        timeZone: String,
    ): Alarm {
        return request("/alarm", "POST", Alarm.serializer(), alarmBody(time, repeatDays, targetDate, isOn, wakeIntensity, personality, voice, role, timeZone))
    }

    suspend fun updateAlarm(
        alarmId: String,
        time: String,
        repeatDays: List<Int>,
        targetDate: String?,
        isOn: Boolean,
        wakeIntensity: String,
        personality: String,
        voice: String,
        role: String,
        timeZone: String,
    ): Alarm {
        return request("/alarm/$alarmId", "PUT", Alarm.serializer(), alarmBody(time, repeatDays, targetDate, isOn, wakeIntensity, personality, voice, role, timeZone))
    }

    suspend fun deleteAlarm(alarmId: String) {
        requestVoid("/alarm/$alarmId", "DELETE")
    }

    suspend fun testCall(wakeIntensity: String, voice: String, role: String): LiveKitInfo {
        val body = buildJsonObject {
            put("wakeIntensity", JsonPrimitive(wakeIntensity))
            put("voice", JsonPrimitive(voice))
            put("role", JsonPrimitive(role))
        }
        return request("/alarm/test-call", "POST", LiveKitInfo.serializer(), body)
    }

    suspend fun calendarStatus(): CalendarConnectionStatus =
        request("/user/calendar-status", "GET", CalendarConnectionStatus.serializer())

    suspend fun connectCalendar(serverAuthCode: String): CalendarConnectionStatus {
        val body = buildJsonObject {
            put("serverAuthCode", JsonPrimitive(serverAuthCode))
        }
        return request("/user/calendar-code", "PATCH", CalendarConnectionStatus.serializer(), body)
    }

    suspend fun disconnectCalendar(): CalendarConnectionStatus =
        request("/user/calendar-token", "DELETE", CalendarConnectionStatus.serializer())

    suspend fun todayEvents(): List<Event> =
        request("/calendar/today", "GET", ListSerializer(Event.serializer()))

    suspend fun billingEntitlement(): BillingEntitlement =
        request("/billing/entitlement", "GET", BillingEntitlement.serializer())

    suspend fun syncGoogleBilling(purchaseToken: String, productId: String): BillingEntitlement {
        val body = buildJsonObject {
            put("purchaseToken", JsonPrimitive(purchaseToken))
            put("productId", JsonPrimitive(productId))
        }
        return request("/billing/google/sync", "POST", BillingEntitlement.serializer(), body)
    }

    suspend fun assistantStatus(): AssistantStatus =
        request("/assistant/status", "GET", AssistantStatus.serializer())

    suspend fun assistantBriefing(): AssistantBriefing =
        request("/assistant/briefing", "GET", AssistantBriefing.serializer())

    suspend fun assistantTasks(includeCompleted: Boolean = false): List<AssistantTask> =
        request(
            "/assistant/tasks?includeCompleted=$includeCompleted",
            "GET",
            AssistantTasksResponse.serializer(),
        ).tasks

    suspend fun createAssistantTask(
        title: String,
        priority: String = "normal",
        dueAt: String? = null,
    ): AssistantTask {
        val body = buildJsonObject {
            put("title", JsonPrimitive(title))
            put("priority", JsonPrimitive(priority))
            dueAt?.let { put("dueAt", JsonPrimitive(it)) }
        }
        return request(
            "/assistant/tasks",
            "POST",
            AssistantTaskResponse.serializer(),
            body,
        ).task
    }

    suspend fun updateAssistantTask(
        taskId: String,
        title: String? = null,
        priority: String? = null,
        dueAt: String? = null,
        completed: Boolean? = null,
    ): AssistantTask {
        val body = buildJsonObject {
            title?.let { put("title", JsonPrimitive(it)) }
            priority?.let { put("priority", JsonPrimitive(it)) }
            dueAt?.let { put("dueAt", JsonPrimitive(it)) }
            completed?.let { put("completed", JsonPrimitive(it)) }
        }
        return request(
            "/assistant/tasks/$taskId",
            "PATCH",
            AssistantTaskResponse.serializer(),
            body,
        ).task
    }

    suspend fun deleteAssistantTask(taskId: String): Boolean =
        request(
            "/assistant/tasks/$taskId",
            "DELETE",
            AssistantDeleteResponse.serializer(),
        ).success

    suspend fun assistantChat(
        message: String,
        history: List<AssistantChatHistoryItem>,
    ): AssistantChatResponse {
        val body = buildJsonObject {
            put("message", JsonPrimitive(message))
            put("history", buildJsonArray {
                history.forEach { item ->
                    add(buildJsonObject {
                        put("role", JsonPrimitive(item.role))
                        put("content", JsonPrimitive(item.content))
                    })
                }
            })
        }
        return request(
            "/assistant/chat",
            "POST",
            AssistantChatResponse.serializer(),
            body,
        )
    }

    private fun alarmBody(
        time: String,
        repeatDays: List<Int>,
        targetDate: String?,
        isOn: Boolean,
        wakeIntensity: String,
        personality: String,
        voice: String,
        role: String,
        timeZone: String,
    ): JsonObject = buildJsonObject {
        put("time", JsonPrimitive(time))
        put("timeZone", JsonPrimitive(timeZone))
        put("repeatDays", buildJsonArray { repeatDays.forEach { add(JsonPrimitive(it)) } })
        put("isOn", JsonPrimitive(isOn))
        put("wakeIntensity", JsonPrimitive(wakeIntensity))
        put("personality", JsonPrimitive(personality))
        put("voice", JsonPrimitive(voice))
        put("role", JsonPrimitive(role))
        targetDate?.let { put("targetDate", JsonPrimitive(it)) }
    }

    private suspend fun <T> request(
        path: String,
        method: String,
        serializer: KSerializer<T>,
        body: JsonObject? = null,
    ): T {
        val response = execute(path, method, body)
        val responseBody = response ?: throw IOException("Empty response for $method $path")
        return json.decodeFromString(serializer, responseBody)
    }

    private suspend fun requestVoid(path: String, method: String, body: JsonObject? = null) {
        execute(path, method, body)
    }

    private suspend fun execute(path: String, method: String, body: JsonObject? = null): String? {
        val baseUrl = baseUrlProvider().trim().trimEnd('/').ifBlank { BASE_URL }
        return withContext(Dispatchers.IO) {
            val requestBuilder = Request.Builder()
                .url(baseUrl + path)
                .header("Authorization", "Bearer ${authRepository.idToken()}")
                .header("Content-Type", "application/json")

            val requestBody = body?.let { json.encodeToString(JsonObject.serializer(), it).toRequestBody(mediaType) }
            when (method) {
                "GET" -> requestBuilder.get()
                "DELETE" -> if (requestBody != null) requestBuilder.delete(requestBody) else requestBuilder.delete()
                "POST" -> requestBuilder.post(requestBody ?: ByteArray(0).toRequestBody(mediaType))
                "PUT" -> requestBuilder.put(requestBody ?: ByteArray(0).toRequestBody(mediaType))
                "PATCH" -> requestBuilder.patch(requestBody ?: ByteArray(0).toRequestBody(mediaType))
                else -> error("Unsupported method $method")
            }

            client.newCall(requestBuilder.build()).execute().use { response ->
                val responseText = response.body?.string()
                if (!response.isSuccessful) {
                    val detail = responseText
                        ?.replace(Regex("\\s+"), " ")
                        ?.take(240)
                        ?.takeIf { it.isNotBlank() }
                    throw IOException(
                        "HTTP ${response.code} for $method $path${detail?.let { ": $it" }.orEmpty()}",
                    )
                }
                responseText
            }
        }
    }

    companion object {
        const val BASE_URL = "https://morningcall.poapper.com"
    }
}
