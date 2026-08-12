<a href="https://livekit.io/">
  <img src="./.github/assets/livekit-mark.png" alt="LiveKit logo" width="100" height="100">
</a>

# Haru Agent

Haru AI assistant built with LiveKit Agents for Python

## Dev Setup

Clone the repository and install dependencies to a virtual environment:

```console
cd haru-agent-python
uv sync
```

Sign up for [LiveKit Cloud](https://cloud.livekit.io/) then set up the environment by copying `.env.example` to `.env.local` and filling in the required keys:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

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

- **API-based memory**: All data stored in NestJS backend (MongoDB + ChromaDB)
- **Automatic conversation tracking**: All conversations automatically saved via API
- **User information storage**: Save important user details (name, preferences, etc.)
- **Important facts**: Track key information from conversations
- **RAG search**: Semantic search through conversation history (when backend implements it)
- **Centralized management**: Multiple agent instances share the same memory

### Setup

1. Set the `BACKEND_API_URL` environment variable in `.env.local`:

```bash
BACKEND_API_URL=http://localhost:3000/api
```

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
- `POST /memory/conversation` - Save conversation message
- `POST /memory/user-info` - Save user information
- `POST /memory/important-fact` - Save important facts
- `GET /memory/search` - RAG search (optional)

For backend implementation details, see your NestJS project documentation.

## Tests and evals

This project includes a complete suite of evals, based on the LiveKit Agents [testing & evaluation framework](https://docs.livekit.io/agents/build/testing/). To run them, use `pytest`.

```console
uv run pytest
```

## Deploying to production

This project is production-ready and includes a working `Dockerfile`. To deploy it to LiveKit Cloud or another environment, see the [deploying to production](https://docs.livekit.io/agents/ops/deployment/) guide.
