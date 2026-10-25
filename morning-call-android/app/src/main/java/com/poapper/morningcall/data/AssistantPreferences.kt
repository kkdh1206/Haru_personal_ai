package com.poapper.morningcall.data

import android.content.Context
import com.poapper.morningcall.BuildConfig
import java.net.URI

class AssistantPreferences(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences(
        PREFERENCES_NAME,
        Context.MODE_PRIVATE,
    )

    var backendUrl: String
        get() {
            val stored = preferences.getString(KEY_BACKEND_URL, APIClient.BASE_URL) ?: APIClient.BASE_URL
            return runCatching { normalizeBackendUrl(stored) }.getOrDefault(APIClient.BASE_URL)
        }
        set(value) {
            preferences.edit().putString(KEY_BACKEND_URL, normalizeBackendUrl(value)).apply()
        }

    var refreshOnOpen: Boolean
        get() = preferences.getBoolean(KEY_REFRESH_ON_OPEN, true)
        set(value) {
            preferences.edit().putBoolean(KEY_REFRESH_ON_OPEN, value).apply()
        }

    var assistantNotificationsEnabled: Boolean
        get() = preferences.getBoolean(KEY_ASSISTANT_NOTIFICATIONS, true)
        set(value) {
            preferences.edit().putBoolean(KEY_ASSISTANT_NOTIFICATIONS, value).apply()
        }

    companion object {
        private const val PREFERENCES_NAME = "haru_assistant_preferences"
        private const val KEY_BACKEND_URL = "backend_url"
        private const val KEY_REFRESH_ON_OPEN = "refresh_on_open"
        private const val KEY_ASSISTANT_NOTIFICATIONS = "assistant_notifications"

        fun normalizeBackendUrl(rawValue: String): String {
            val candidate = rawValue.trim().ifBlank { APIClient.BASE_URL }.trimEnd('/')
            val uri = runCatching { URI(candidate) }
                .getOrElse { throw IllegalArgumentException("올바른 서버 URL을 입력해 주세요.") }
            require(uri.scheme == "https" || (BuildConfig.DEBUG && uri.scheme == "http")) {
                if (BuildConfig.DEBUG) {
                    "서버 URL은 http:// 또는 https://로 시작해야 해요."
                } else {
                    "릴리스 앱의 서버 URL은 https://를 사용해야 해요."
                }
            }
            require(!uri.host.isNullOrBlank()) { "올바른 서버 주소를 입력해 주세요." }
            require(uri.userInfo == null) { "서버 URL에 계정 정보를 포함할 수 없어요." }
            require(uri.query == null && uri.fragment == null) {
                "서버 URL에는 쿼리나 프래그먼트를 포함할 수 없어요."
            }
            return candidate
        }
    }
}
