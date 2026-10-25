<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

NestJS backend for Haru's alarm, calendar, memory, billing, and personal
assistant features.

## Personal assistant API

The authenticated `/assistant` API exposes a structured daily briefing, task
CRUD, non-streaming chat, and provider status. The Android and iOS clients send
their Firebase ID token as `Authorization: Bearer <token>`; Claude is called by
this server, never by a mobile client.

Configure the server environment:

```bash
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=your-server-side-key
ANTHROPIC_MODEL=claude-sonnet-5-5
ANTHROPIC_TIMEOUT_MS=20000
ASSISTANT_PREFLIGHT_TIMEOUT_MS=5000
ASSISTANT_RATE_LIMIT_WINDOW_MS=3600000
ASSISTANT_BRIEFING_LIMIT=12
ASSISTANT_CHAT_LIMIT=60
```

If Claude is not configured or is temporarily unavailable, briefing and chat
return deterministic fallbacks with the same JSON contract. Do not put
`ANTHROPIC_API_KEY` in Android resources, `BuildConfig`, app settings, logs, or
API responses.

Calendar, memory, and billing entitlement reads run in parallel and each use a
5-second preflight timeout. The server caps that setting at 7 seconds and caps
Claude requests at 20 seconds, keeping the default and maximum server path at
about 25 and 27 seconds respectively so a fallback can arrive before the
Android client's 30-second read timeout. Timed-out data sources are marked
`unavailable`; an entitlement timeout skips Claude and returns the deterministic
fallback. A direct `GET /assistant/tasks` timeout returns HTTP `503` instead of
an empty successful list, allowing clients to preserve their last task cache.

When `BILLING_ENFORCEMENT_ENABLED=true`, users without an active trial or
subscription still receive calendar, tasks, and deterministic assistant
fallbacks, but the server does not call Claude. Paid briefing and chat calls
also use separate per-user fixed windows (12 briefings and 60 chats per hour by
default). Set either operation limit to `0` to disable Claude for that operation.
The limiter is intentionally in memory for one N100 backend instance and resets
when that process restarts; use a shared Redis limiter before running multiple
API replicas.

## LiveKit worker authentication

Set a high-entropy shared secret on the API and use the same value in the
Python worker:

```bash
AGENT_SHARED_SECRET=replace-with-a-random-server-secret
```

The worker sends it as `X-Haru-Agent-Secret` on its backend requests. Internal
memory and prompt routes, plus the worker-only calendar event and alarm
retry/outcome routes, return `403` when the secret is absent or does not match.
The API still boots if the setting is absent, but those internal HTTP routes
remain fail-closed. Firebase-authenticated mobile calendar and alarm routes are
unchanged. Never put this secret in a mobile app or log it.

## Installation

```bash
$ pnpm install
```

## Running the app

```bash
# development
$ pnpm start

# watch mode
$ pnpm start:dev

# production mode
$ pnpm start:prod
```

## Test

```bash
# unit tests
$ pnpm test

# e2e tests
$ pnpm test:e2e

# test coverage
$ pnpm test:cov
```

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](LICENSE).
