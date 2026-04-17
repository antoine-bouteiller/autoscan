---
title: Send message (Telegram relay)
status: condensed
author: Antoine Bouteiller
date: 2026-04-17
related: [docs/specs/architecture.spec.md, src/providers/http/http.spec.md, src/providers/telegram/telegram.spec.md]
---

## 2. Problem Statement

External automations (home-assistant, shell scripts, other services) need a single trusted HTTP endpoint that forwards
a text string to the operator's Telegram chat. This feature exists so callers don't each need to hold the Telegram
bot token or know the chat ID.

- `[G-1]` Expose one idempotent `POST /send_message` endpoint that relays `{ text }` to `TELEGRAM_CHAT_ID`.
- `[G-2]` Reject malformed bodies at the validator with `400 BAD_REQUEST`.
- `[G-3]` Own the `POST /send_message` HTTP entry point — it doesn't belong in any other feature.

## 3. Key Design Decisions

| Decision                 | Choice                                                             | Rationale                                                                     |
| ------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `[KD-1]` Shape           | `{ text: string }` only                                            | One input, one action; no knobs                                               |
| `[KD-2]` Chat target     | `env.TELEGRAM_CHAT_ID` — fixed, not taken from the request         | Prevents turning Autoscan into an open-relay against arbitrary chats          |
| `[KD-3]` Validator owner | `send_message` feature defines the Zod schema                      | The feature defines the request shape — validator follows producer (`[PI-7]`) |
| `[KD-4]` Response        | `200 { message: 'ok' }` on success                                 | No return payload needed; success is a liveness signal                        |
| `[KD-5]` Service-less    | No `services/` subfolder — webhook calls `TelegramClient` directly | No orchestration, no business logic; adding a service would be ceremony       |

## 4. Principles & Intents

- `[PI-1]` **No service layer for trivial passthroughs** — one-call webhooks call integrations directly.
- `[PI-2]` **Chat ID is server-owned** — never accept a chat target from the request body.
- `[PI-3]` **Validator co-locates with the feature** — per `project-structure.spec.md` [PI-7], this feature
  produces the shape, so the validator lives under `src/features/send_message/validators/`.

## 5. Non-Goals

- `[NG-1]` No formatting / parse-mode — text is sent verbatim.
- `[NG-2]` No attachment / media support — text-only.
- `[NG-3]` No auth beyond network-level trust (typical homelab deployment). If exposed to the internet, front with
  a reverse-proxy auth layer.
- `[NG-4]` No queue / retry — if Telegram fails, the caller gets the error and is responsible for retrying.

## 6. Caveats

- `[C-1]` The URL path (`/send_message`) matches the feature folder (`send_message`) for consistency — any external
  caller (home-assistant, scripts) must POST to the new path after a rename.
- `[C-2]` The webhook returns `200` as soon as `telegram.sendMessage` resolves; if Telegram later flags the chat
  (e.g., bot blocked), the caller already saw success.

## 7. High-Level Components

| Component        | Module type                                                               | Responsibility              | Public API surface                                        |
| ---------------- | ------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------- |
| Webhook          | Module (`src/features/send_message/webhooks/send_message.webhook.ts`)     | Relay `body.text` to chat   | `sendMessageWebhook(request, reply)`                      |
| Validator        | Module (`src/features/send_message/validators/send_message.validator.ts`) | Zod schema for request body | `sendMessageValidator` (`z.object({ text: z.string() })`) |
| Feature register | Module (`src/features/send_message/register.ts`)                          | Wires route to HttpProvider | `registerSendMessage()`                                   |

## 8. Detailed Design

> Condensed after implementation. See source code for full detail.

| Component        | Module                                  | Entry point                                          |
| ---------------- | --------------------------------------- | ---------------------------------------------------- |
| Webhook          | `src/features/send_message/webhooks/`   | `send_message.webhook.ts` (`sendMessageWebhook`)     |
| Validator        | `src/features/send_message/validators/` | `send_message.validator.ts` (`sendMessageValidator`) |
| Feature register | `src/features/send_message/`            | `register.ts` (`registerSendMessage`)                |

## 9. Verification Criteria

- `[VC-1]` `POST /send_message` with `{ text: "hi" }` forwards `"hi"` to `TELEGRAM_CHAT_ID` and returns
  `200 { message: 'ok' }` — **PASS** (`tests/routes/send_message.spec.ts`).
- `[VC-2]` `POST /send_message` with an invalid body returns `400` with `error.code === 'BAD_REQUEST'` and
  `z.treeifyError` details — **PASS** (`tests/routes/send_message.spec.ts`).
- `[VC-3]` `registerSendMessage()` attaches exactly one route: `POST /send_message`.

## 10. Open Questions

N/A
