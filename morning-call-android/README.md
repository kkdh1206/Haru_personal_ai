# Haru Android

Native Kotlin/Jetpack Compose client for the Haru personal assistant and morning-call service.

The default experience is a three-tab command center:

- **오늘**: structured daily briefing, Google Calendar schedule, active tasks, stale-cache fallback, pull-to-refresh, and manual refresh.
- **대화**: non-streaming assistant chat with suggested questions and short conversation history.
- **설정**: backend URL, AI provider status, calendar connection, refresh/notification preferences, alarms, test calls, personalization, and billing.

The existing Firebase authentication, FCM, LiveKit call, Core Telecom, exact-alarm fallback, and Google Play Billing paths remain available.

## Requirements

- Android Studio or a command-line Android SDK with platform 35 installed. The app supports Android 8.0 (API 26) and newer, matching its `java.time` and Core Telecom usage.
- JDK 17 or 21 is recommended; Temurin JDK 23 is also verified. Kotlin and Java bytecode target 17. Do not use JDK 26 with the current Android Gradle Plugin because its `jlink` transform fails while creating `androidJdkImage`.
- The committed Gradle 9.5.1 wrapper.
- A Firebase Android app with package name `com.poapper.morningcall`.

## Local setup

1. Download the Android Firebase configuration for the same project used by the backend.
2. Save it as `app/google-services.json`. This file is ignored by Git and must not be committed.
3. Enable Firebase Authentication with Google Sign-In and Firebase Cloud Messaging.
4. Register the debug/release signing certificate SHA fingerprints in Firebase as appropriate.
5. Enable the Google Calendar API for the OAuth project. The app sends a server auth code to the backend; calendar refresh tokens and calendar access remain server-side.

The production backend defaults to:

```text
https://morningcall.poapper.com
```

For a personal N100/LAN deployment, change **설정 → Backend URL** in the app. Debug builds accept `https://` and `http://` URLs so a LAN server can be tested. Release builds require HTTPS and disable cleartext traffic, preventing Firebase bearer tokens from being sent in plaintext. The app never stores an Anthropic API key.

## Assistant backend contract

All endpoints use the existing Firebase bearer token.

```text
GET    /assistant/status
GET    /assistant/briefing
GET    /assistant/tasks?includeCompleted=false
POST   /assistant/tasks
PATCH  /assistant/tasks/:id
DELETE /assistant/tasks/:id
POST   /assistant/chat
```

The server should be configured separately, for example:

```text
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=your-server-side-key
ANTHROPIC_MODEL=claude-sonnet-5-5
```

`ANTHROPIC_API_KEY` must stay on the backend. Do not add it to `google-services.json`, Gradle properties, Android resources, or the in-app backend URL.

## Build and test

From this directory:

```bash
./gradlew test assembleDebug
```

Make sure Gradle is using a supported JDK. For example, on macOS with Temurin 23 installed:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 23)
./gradlew test assembleDebug
```

The debug APK is generated at:

```text
app/build/outputs/apk/debug/app-debug.apk
```

Install it on a connected device or running emulator:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Current assistant behavior

- Briefing and active task responses are cached per Firebase user and backend URL. If a refresh partially or fully fails—or the backend is unavailable during a cold start—the last usable data remains visible with stale/error indicators.
- Returning to the foreground refreshes the command center when **Refresh on open** is enabled; short activity transitions are debounced.
- Cache data is excluded from Android cloud backup and device-to-device transfer because it may contain private schedule, task, and memory summaries. Signing out also clears the current backend's assistant cache and local fallback alarms.
- The backend URL and refresh/notification preferences use local preferences.
- Generic FCM data-message types `assistant`, `assistant_notification`, `briefing`, `task_reminder`, `deadline`, and `opportunity` use the Assistant notification channel.
- Google Calendar is read through backend OAuth, so Android `READ_CALENDAR` permission is not required.
- Exact-alarm settings are no longer opened automatically. The user can open them from **설정 → Alarms & calls** when needed.

## Manual verification checklist

- Google login and onboarding: name and location.
- Today briefing: loading, pull/manual refresh, empty sections, partial backend failure, and stale cache.
- Calendar: connect, disconnect, timed events, all-day events, and local-time display.
- Tasks: create normal/important, complete, delete, and backend error handling.
- Chat: suggested question, typed question, configured Claude response, and deterministic fallback response.
- Settings: custom backend URL validation, provider/model status, refresh preference, and Assistant notification preference.
- Existing behavior: weekly alarm create/update/delete, exact-alarm permission button, test call, incoming FCM call, locked-screen call UI, and local fallback.
- Generic Assistant FCM notification opens the app without exposing secrets.
