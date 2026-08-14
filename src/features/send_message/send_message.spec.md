---
title: Send Message
status: implemented
author: Antoine Bouteiller
date: 2026-08-14
related:
  - docs/project_structure.spec.md
  - docs/architecture/architecture.spec.md
  - src/providers/http/http.spec.md
---

## 2. Problem Statement

Internal systems need a small webhook surface for delivering operational text to the configured Telegram chat. This feature accepts a validated text payload and forwards it without exposing chat selection or message-presentation controls.

- `[G-1]` Provide one validated HTTP endpoint that delivers text to the configured Telegram chat.
- `[G-2]` Preserve the HTTP provider's standard success and validation-error envelopes.

## 3. Key Design Decisions

| Decision                       | Choice                                                             | Rationale                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[KD-1]` Route surface         | Register only `POST /send_message`.                                | The feature has one delivery use case, and the feature registration confines its public surface to that route (`src/features/send_message/feature.ts:8`).          |
| `[KD-2]` Schema ownership      | Validate `{ text: string }` with a co-located Effect Schema.       | The webhook owns its request contract, so co-location keeps the producer's boundary explicit (`src/features/send_message/validators/send_message.validator.ts:3`). |
| `[KD-3]` Destination identity  | Read the destination from `TELEGRAM_CHAT_ID`, never from the body. | A caller-supplied chat id would turn an internal notification hook into an arbitrary-message relay.                                                                |
| `[KD-4]` Response construction | Use the HTTP provider `success` helper with `{ message: 'ok' }`.   | Provider helpers keep envelope and status behavior consistent across routes.                                                                                       |

## 4. Principles & Intents

- `[PI-1]` Fixed destination — the configured chat is the only delivery target.
- `[PI-2]` Boundary validation — invalid bodies do not reach Telegram delivery.
- `[PI-3]` Minimal route-only design — no scheduler, command, or conversation belongs to this feature.

## 5. Non-Goals

- `[NG-1]` Target arbitrary chat ids.
- `[NG-2]` Support Markdown/HTML formatting, inline keyboards, or editing messages.
- `[NG-3]` Authenticate requests at the application layer; deployment keeps the endpoint private.

## 6. Caveats

- `[C-1]` An empty string satisfies the string schema; Telegram determines whether such a message is deliverable.
- `[C-2]` Non-JSON bodies and schema failures are rejected by the HTTP provider before the webhook handler runs.

## 7. High-Level Components

| Component              | Module type    | Responsibility                          | Public API surface     |
| ---------------------- | -------------- | --------------------------------------- | ---------------------- |
| Feature registration   | HTTP feature   | Bind validator and handler to the route | `POST /send_message`   |
| Send-message validator | Effect Schema  | Define the request body                 | `sendMessageValidator` |
| Send-message webhook   | Effect handler | Send text and complete the HTTP reply   | `sendMessageWebhook`   |

## 8. Detailed Design

### Feature registration

The feature registers `postRoute('/send_message', sendMessageValidator, sendMessageWebhook)`, making the validator part of the route boundary (`src/features/send_message/feature.ts:8`).

### Send-message validator

The body contract is `Schema.Struct({ text: Schema.String })` (`src/features/send_message/validators/send_message.validator.ts:3`). A valid request has JSON content equivalent to `{ "text": "plex restart complete" }`.

### Send-message webhook

The handler resolves the Telegram Effect service, calls `sendMessage(env.TELEGRAM_CHAT_ID, request.body.text)`, then produces `success(reply, { message: 'ok' })` (`src/features/send_message/webhooks/send_message.webhook.ts:9`, `src/features/send_message/webhooks/send_message.webhook.ts:12`). Therefore successful delivery returns the provider's 200 success envelope; boundary validation failures return its 400 bad-request envelope.

## 9. Open Questions

N/A
