# morning-call-android

Native Kotlin Android client for Haru morning call.

## Setup

1. Create an Android app in the same Firebase project.
   - Package name: `com.poapper.morningcall`
   - Enable Google Sign-In and Firebase Cloud Messaging.
2. Place Firebase config at:
   - `app/google-services.json`
3. The Google Services Gradle plugin generates `R.string.default_web_client_id` from `app/google-services.json`.
4. Install Android SDK 36 and Gradle 9.5.1, or regenerate a standard wrapper:
   - `gradle wrapper --gradle-version 9.5.1`

## Build

```bash
./gradlew test
./gradlew assembleDebug
```

This repository does not commit `google-services.json` or a generated `gradle-wrapper.jar`.

## Implemented Android Flow

- Firebase Google login.
- `/user/device-token` registration with `{ deviceToken, deviceType: "android" }`.
- Alarm CRUD against the existing `/alarm` API.
- LiveKit test call and incoming call connection.
- FCM high-priority data message handling for call and wake follow-up payloads.
- Core-Telecom registration through `androidx.core:core-telecom`.
- Full-screen incoming call UI with microphone permission handling.
- Exact local fallback alarms at scheduled alarm time + 60 seconds.
- Delayed FCM ignore after local fallback has fired.

## Manual Test Checklist

- Login and onboarding: name, location.
- Alarm create/update/delete from weekly cards.
- FCM token appears in the API user record with `deviceType: "android"`.
- Test call connects to LiveKit and microphone audio publishes.
- Locked-screen incoming call opens the full-screen Activity.
- Answer, reject, hangup, and microphone-denied paths.
- Exact alarm permission denied/allowed paths.
- Local fallback fires when push is unavailable, then delayed FCM for the same alarm is ignored once.
- Boot reschedules cached fallback alarms.
