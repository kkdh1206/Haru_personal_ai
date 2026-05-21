package com.poapper.morningcall.data

import com.poapper.morningcall.model.Alarm
import com.poapper.morningcall.model.CalendarConnectionStatus
import com.poapper.morningcall.model.Event
import com.poapper.morningcall.model.LiveKitInfo
import com.poapper.morningcall.model.UserInfo
import com.poapper.morningcall.model.UserSettings
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class APIClient(private val authRepository: AuthRepository) {
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
        val requestBuilder = Request.Builder()
            .url(BASE_URL + path)
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

        return client.newCall(requestBuilder.build()).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("HTTP ${response.code} for $method $path")
            }
            response.body?.string()
        }
    }

    companion object {
        const val BASE_URL = "https://morningcall.poapper.com"
    }
}
