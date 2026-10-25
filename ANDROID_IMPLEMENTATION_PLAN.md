# Haru Android Personal Assistant Implementation Plan

## Current architecture

- `morning-call-ios/` is the existing SwiftUI client. It owns iOS-only concerns such as EventKit, APNs call delivery, CallKit/LiveKit presentation, and Apple subscription UI.
- `morning-call-android/` is an existing Kotlin/Jetpack Compose client. It already supports Firebase Google sign-in, Google Calendar OAuth code delivery, alarm CRUD, FCM, LiveKit calls, local fallback alarms, and Google Play billing.
- `morning-call-api/` is the shared NestJS backend. It owns authentication, users, Google Calendar access, alarms, weather/news retrieval, MongoDB-backed memories/reminders, billing, and call prompt construction.
- `haru-agent-python/` is the LiveKit voice worker. Gemini Realtime currently provides the native audio model, and Gemini also summarizes completed call transcripts.

The Android app authenticates with Firebase and sends the Firebase ID token as a bearer token to the NestJS API. Google Calendar refresh credentials are exchanged and encrypted on the server. The phone remains a thin client; Claude credentials and orchestration stay on the server.

## Product direction

The default Android experience becomes a personal command center that answers “what matters today?” The existing alarm/call implementation remains available but is secondary to:

1. a structured daily briefing;
2. today’s Google Calendar schedule;
3. personal tasks and deadlines;
4. context-aware Claude chat;
5. cached data and graceful partial failures.

Brave Search, crawling, embeddings, PostgreSQL/pgvector, and additional ingestion jobs are intentionally deferred. The current deployment uses MongoDB and keyword memory retrieval, so this iteration builds on that reality rather than introducing an unconfigured datastore.

## Shared/backend work

- Add an authenticated assistant API with structured briefing, task, chat, and provider-status endpoints.
- Aggregate calendar data, active reminders/tasks, user details, and a small amount of relevant memory on the server.
- Introduce an `LLMProvider` boundary and a server-side Claude Messages API implementation selected by environment configuration.
- Keep schedule and task sections deterministic. Claude writes only the concise synthesis/recommendations, so a missing key or provider outage does not make the briefing unusable.
- Reuse MongoDB reminder records for first-version tasks and extend their metadata with an optional due date.
- Resolve users from the authenticated request rather than accepting a user id from the Android client.
- Keep the existing Gemini Realtime voice path unchanged. Replacing it with Claude would require a separate STT + text LLM + TTS pipeline and is outside this briefing-focused iteration.

## Android work

- Reuse Firebase authentication, calendar OAuth, FCM registration, billing, alarm scheduling, and LiveKit call code.
- Replace the alarm-first home with Compose navigation for Today, Chat, and Settings.
- Add serializable briefing, task, provider-status, and chat DTOs matching the backend contract.
- Add repositories/preferences for a configurable backend URL, a cached last briefing, refresh preferences, and notification preferences.
- Implement initial loading, pull/manual refresh, an error banner, and stale cached content.
- Render unknown future briefing section types with a generic card instead of failing parsing.
- Keep alarm editing and test-call controls as optional legacy tools rather than deleting them.
- Extend FCM presentation for future briefing/reminder/deadline notifications without requiring new push infrastructure.

## Android-specific code that must not be copied from iOS

- EventKit and Apple Calendar snapshot delivery: Android uses the existing Google Calendar OAuth server flow.
- CallKit/APNs/background-task code: Android already has Core Telecom, FCM, full-screen intents, and exact-alarm fallback equivalents.
- StoreKit/subscription views: Android retains its BillingClient implementation.
- SwiftUI state/view types and Keychain token storage: Android uses Kotlin StateFlow/Compose and Firebase-managed authentication.

## Configuration

Server-only environment values:

```text
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-sonnet-5-5
AGENT_SHARED_SECRET=... # same high-entropy value on the API and Python worker
```

`ANTHROPIC_API_KEY` must never be placed in Android resources, Gradle properties committed to source control, app settings, logs, or API responses. Android settings may show only the selected provider/model and whether it is configured.

## Delivery order

1. Add and test the backend provider abstraction and assistant endpoints.
2. Add Android models, API calls, persisted preferences, and briefing cache.
3. Build Today, Tasks, Chat, and Settings UI while preserving authentication/onboarding.
4. Add generic assistant notification handling.
5. Run NestJS tests/build and Android unit/build checks.

## Deferred follow-ups

- Brave Search and personalized web/research ingestion.
- PostgreSQL/pgvector migration and semantic retrieval.
- Email ingestion and scholarship/job-source connectors.
- Server-sent streaming chat (first version uses a complete JSON response).
- Scheduled background briefing refresh and production push scheduling.
- A full Claude-based voice pipeline with independently selected STT and TTS providers.
