<a href="https://livekit.io/">
  <img src="./.github/assets/livekit-mark.png" alt="LiveKit logo" width="100" height="100">
</a>

# Haru Agent

Haru AI assistant built with LiveKit Agents for Python

## Dev Setup

Use Python 3.13, matching the Docker image. The `.python-version` file pins this
version for uv because the locked `onnxruntime==1.23.1` does not support Python 3.14.

Clone the repository and install dependencies to a virtual environment:

```console
cd haru-agent-python
uv sync
```

Sign up for [LiveKit Cloud](https://cloud.livekit.io/) then set up the environment by copying `.env.example` to `.env.local` and filling in the required keys:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `GEMINI_API_KEY`
- `HARU_API_URL`
- `AGENT_SHARED_SECRET`

You can load the LiveKit environment automatically using the [LiveKit CLI](https://docs.livekit.io/home/cli/cli-setup):

```bash
lk cloud auth
lk app env -w -d .env.local
```

## Run the agent

Before your first run, you must download certain models such as [Silero VAD](https://docs.livekit.io/agents/build/turns/vad/) and the [LiveKit turn detector](https://docs.livekit.io/agents/build/turns/turn-detector/):

```console
uv run python src/agent.py download-files
```

Next, run this command to speak to your agent directly in your terminal:

```console
uv run python src/agent.py console
```

To run the agent for use with a frontend or telephony, use the `dev` command:

```console
uv run python src/agent.py dev
```

In production, use the `start` command:

```console
uv run python src/agent.py start
```

## Memory & RAG System 🧠

Haru Agent includes an API-based memory system that connects to a NestJS backend for persistent storage and RAG (Retrieval-Augmented Generation) capabilities.

### Key Features

- **API-based memory**: All data stored in the NestJS backend (MongoDB)
- **Automatic conversation tracking**: All conversations automatically saved via API
- **User information storage**: Save important user details (name, preferences, etc.)
- **Important facts**: Track key information from conversations
- **Memory search**: Keyword matching against long-term memories in MongoDB; no embedding API calls or vector database
- **Centralized management**: Multiple agent instances share the same memory

### Setup

1. Set the backend URL and the same high-entropy shared secret configured on
   the NestJS API in `.env.local`:

```bash
HARU_API_URL=http://localhost:3000
AGENT_SHARED_SECRET=replace-with-the-api-server-secret
```

The client adds `X-Haru-Agent-Secret` to every backend request. If the value is
missing or differs from the API's `AGENT_SHARED_SECRET`, protected worker
routes fail closed with `403`. Do not log this value or distribute it to mobile
clients.

2. The agent will automatically:
   - Load user context at call start
   - Save conversations in real-time
   - Store user info via function tools
   - Close API connection at call end

## Cost guardrails

Production calls wait for the participant before opening the Gemini realtime
session. The defaults are a 30-second unanswered-call timeout, a natural wrap-up
at 270 connected seconds, and a hard stop at 300 connected seconds. Override
them with `NO_ANSWER_TIMEOUT_SECONDS`, `CALL_WRAP_UP_SECONDS`, and
`MAX_CALL_DURATION_SECONDS` when needed.

### Function Tools

The agent has access to function tools for saving memory during conversations:

- `save_user_info(key, value)`: Save user information (e.g., name, preferences)
- `save_important_fact(fact)`: Save important facts from the conversation

### Required Backend API Endpoints

- `GET /memory/context?userId={userId}` - Load user memory context
- `POST /memory/call-record` - Save a completed call transcript and summary
- `POST /memory/long-term` - Save extracted long-term memories
- `POST /memory/user-info` - Save user information
- `GET /memory/user-info/{userId}` - Read saved user information
- `GET /memory/search` - RAG search (optional)
- `POST /calendar/event` - Create an event requested during a call
- `POST /alarm/retry` - Schedule a retry after an unanswered call
- `POST /alarm/call-outcome` - Report the final wake-call outcome

These worker-only routes require the shared-secret header described above.

For backend implementation details, see your NestJS project documentation.

## Tests and evals

This project includes a complete suite of evals, based on the LiveKit Agents [testing & evaluation framework](https://docs.livekit.io/agents/build/testing/). To run them, use `pytest`.

```console
uv run pytest
```

## Deploying to production

This project is production-ready and includes a working `Dockerfile`. To deploy it to LiveKit Cloud or another environment, see the [deploying to production](https://docs.livekit.io/agents/ops/deployment/) guide.
