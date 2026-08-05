---
title: Send Message Feature
version: 1.0
date_created: 2026-05-08
last_updated: 2026-05-08
tags: [feature, http, telegram, webhook]
---

# Introduction

The `send_message` feature exposes a single HTTP endpoint that forwards a text payload to the Telegram chat configured
via `TELEGRAM_CHAT_ID`. It is the internal "send notification" hook other systems POST to in order to surface a message
to the operator.

## 1. Purpose & Scope

- Provide an authenticated-by-network internal webhook for delivering arbitrary text messages to Telegram.
- Out of scope: targeting arbitrary chat ids, formatting (Markdown/HTML), inline keyboards, message editing.

## 2. Definitions

- **Route-only feature**: a feature whose only registration surface is `routes` (no jobs, commands, conversations).
- **Telegram client**: low-level HTTP wrapper over the Telegram Bot API (`@/integrations/telegram`).
- **Telegram provider**: high-level long-polling/dispatch layer (`@/providers/telegram`) — NOT used here.

## 3. Requirements, Constraints & Guidelines

- **REQ-001** Register exactly one route: `POST /send_message` via `postRoute` in `feature.ts`.
- **REQ-002** Validate the request body with `sendMessageValidator` (Zod) before invoking the handler.
- **REQ-003** Yield the Telegram Effect service and call `sendMessage(env.TELEGRAM_CHAT_ID, body.text)`.
- **REQ-004** Return `success(reply, { message: 'ok' })` (HTTP 200) on completion.
- **CON-001** The destination chat id is fixed: it MUST come from `env.TELEGRAM_CHAT_ID`, never from the request body.
- **CON-002** The endpoint is unauthenticated; deployment MUST keep it on a private network.
- **GUD-001** Keep the validator co-located here — the body shape is defined by this feature (producer-owned schema).
- **GUD-002** Use the `success` / `badRequest` helpers from `@/providers/http/response`; do not hand-roll envelopes.
- **PAT-001** Follow the route-only feature pattern: export a `defineFeature({ name, routes: [postRoute(...)] })`.

## 4. Interfaces & Data Contracts

Route signature:

```
POST /send_message
Content-Type: application/json
```

Request body (Zod):

```ts
z.object({ text: z.string() })
```

Response envelope (success, 200):

```json
{ "data": { "message": "ok" }, "success": true, "meta": { "timestamp": "<ISO-8601>" } }
```

Response envelope (validation failure, 400):

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "invalid request",
    "details": {/* z.treeifyError */}
  },
  "success": false,
  "meta": { "timestamp": "<ISO-8601>" }
}
```

Status codes: `200` on success, `400` on validation failure, `404` if route not registered, `500` on unhandled error.

## 5. Acceptance Criteria

- **AC-001** Given a valid `{ "text": "hello" }` POST, When the handler runs, Then `TelegramClient.sendMessage` is called
  with `(env.TELEGRAM_CHAT_ID, "hello")` and the response is `200 { data: { message: 'ok' }, success: true }`.
- **AC-002** Given a body missing `text` or with non-string `text`, When the handler runs, Then the response is
  `400 { error.code: 'BAD_REQUEST', success: false }` and the Telegram client is NOT called.
- **AC-003** Given the Telegram API returns an unmapped typed failure, the HTTP provider logs once and returns the stable 500 `INTERNAL_ERROR` response.
- **AC-004** Given a non-JSON request body, When the HTTP server parses it, Then `400 { error.code: 'BAD_REQUEST' }` is
  returned by the provider before the handler runs.

## 6. Test Automation Strategy

- Unit-test the webhook with a local Telegram layer and assert `sendMessage` arguments.
- Integration-test via `HttpProvider.inject({ method: 'POST', url: '/send_message', payload })` to cover the full
  validator + handler path and assert envelope shape and status code.
- Cover both AC-001 and AC-002 explicitly; AC-003 via a stub client that resolves `undefined`.

## 7. Rationale & Context

- **Route-only feature**: this is an Effect-based fan-in webhook; it owns no schedule, command, or conversation, so
  registering only `routes` keeps the surface minimal.
- **Validator co-location**: the request body is defined by this feature, not by an upstream integration, so the Zod
  schema lives under `validators/` per the project's "validators live with the producer" rule.
- **Client over provider**: the feature needs to push a single message, not consume updates or dispatch commands, so it
  resolves the lower-level `TELEGRAM_CLIENT` rather than the long-polling `TELEGRAM_PROVIDER`.

## 8. Dependencies & External Integrations

### External Systems

- **EXT-001** Telegram Bot API (`https://api.telegram.org/bot<token>/sendMessage`) — reached via the integration client.

### Internal Dependencies

- **DEP-001** `@/integrations/telegram` and `@/core/runtime.service` — typed Telegram client service.
- **DEP-002** `@/providers/http` — `HttpProvider.post` registers the route; `success`/`badRequest` build the envelope.
- **DEP-003** `@/core/feature` — `defineFeature` and `postRoute` helpers.
- **DEP-004** `@/config/env` — `TELEGRAM_CHAT_ID` (coerced number) and `TELEGRAM_TOKEN` (consumed by the client).

## 9. Examples & Edge Cases

Valid POST:

```sh
curl -X POST http://localhost:3030/send_message \
  -H 'Content-Type: application/json' \
  -d '{"text":"plex restart complete"}'
```

Edge cases:

- Empty string `text`: passes validation (`z.string()` accepts `""`); Telegram API rejects empty messages — delivery
  fails, handler still returns 200.
- Missing `text` field: `400 BAD_REQUEST` with `z.treeifyError` details.
- Extra fields in body: silently accepted and dropped by Zod.

## 10. Validation Criteria

- The route appears in the `HttpProvider` route map as `POST:/send_message` after `registerFeatures` runs.
- `bun run check` and `bun run test` pass for the feature directory.
- A POST with a valid body produces a Telegram message in the configured chat in a smoke environment.

## 11. Related Specifications / Further Reading

- ../../../docs/architecture/feature_registration.spec.md
- ../../providers/http/http.spec.md
- ../../providers/telegram/telegram.spec.md
