---
title: Telegram Provider
version: 1.0
date_created: 2026-05-08
last_updated: 2026-05-08
tags: [provider, telegram, bot, runtime]
---

# Introduction

The Telegram provider is the runtime host for the bot. It polls the Telegram Bot API,
authorizes incoming chats, and dispatches updates to feature-registered command handlers
and conversations.

## 1. Purpose & Scope

Wrap the `ITelegramClient` HTTP wrapper, hold the routing tables for commands and
multi-step conversations, and own the long-running poll loop. Out of scope: low-level
HTTP, schema validation (delegated to `#/integrations/telegram`), and feature business
logic.

## 2. Definitions

- **command** — a `/word` text message routed to a one-shot handler.
- **conversation** — a stateful flow with an entry command and a callback step driven by
  inline keyboard button presses.
- **chat** — a Telegram chat; only `env.TELEGRAM_CHAT_ID` is authorized.
- **handler** — async function returning the next `ConversationState`.
- **polling** — long-poll loop calling `getUpdates` with a 30s timeout.

## 3. Requirements, Constraints & Guidelines

- **REQ-001** Expose `registerCommand(name, handler)` and `registerConversation(name,
conversation)` for `registerFeatures` to wire feature tables at bootstrap.
- **REQ-002** Drop any update whose `chat.id !== env.TELEGRAM_CHAT_ID`; log a warning.
- **REQ-003** `start()` is idempotent (warns if already running) and launches the poll
  loop; `stop()` flips `running = false` so the loop exits after the current iteration.
- **REQ-004** Resolved as a singleton via `container.resolve(TOKENS.TELEGRAM_PROVIDER)`.
- **REQ-005** Only one conversation may be active at a time, tracked by
  `activeConversationKey`. `/cancel` resets state to `{ step: 'idle' }`.
- **REQ-006** While a conversation is active, plain `/command` messages are ignored —
  only `callback_query` updates feed the conversation. Messages are processed only when
  no conversation is active.
- **CON-001** No third-party bot SDK (Telegraf, grammY) — uses raw HTTP via
  `httpClient` against `https://api.telegram.org/bot<token>`.
- **CON-002** `getUpdates` errors do not crash the loop; back off exponentially from 5s
  to 5min.
- **CON-003** State is in-memory only; restarts drop active conversations.
- **GUD-001** Features expose commands/conversations through `defineFeature` rather than
  calling `registerCommand` directly.
- **PAT-001** Conversation = `{ onCommand, onCallback }`; both return the next
  `ConversationState`. Returning `{ step: 'idle' }` ends the conversation.

## 4. Interfaces & Data Contracts

```ts
// telegram.provider.ts
export type CommandHandler = (client: ITelegramClient, message: TelegramMessageIn) => Promise<ConversationState>

export interface Conversation {
  onCommand: CommandHandler
  onCallback: (
    client: ITelegramClient,
    chatId: number,
    params: { state: ConversationState; callback: TelegramCallbackQuery }
  ) => Promise<ConversationState>
}

export class TelegramProvider {
  constructor() // resolves TOKENS.TELEGRAM_CLIENT from container
  registerCommand(command: string, handler: CommandHandler): this
  registerConversation(command: string, conversation: Conversation): this
  start(): void
  stop(): Promise<void>
}
```

```ts
// types.ts
export type ConversationState =
  | { step: 'idle' }
  | { step: 'awaiting_media_type'; messageId: number }
  | { step: 'awaiting_media_selection'; messageId: number; mediaType: MediaType; page: number }
  | { step: 'awaiting_language'; messageId: number; tmdbId: number; mediaType: MediaType }

export interface InlineKeyboardButton {
  text: string
  callback_data: string
}
export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][]
}
```

`registerCommand` / `registerConversation` use `Map.set` — re-registering the same name
silently overwrites the previous entry. Authorized chat = `env.TELEGRAM_CHAT_ID`.

## 5. Acceptance Criteria

- **AC-001** Given `/foo` is registered, When the authorized chat sends `/foo`, Then
  the handler runs with the parsed message.
- **AC-002** Given an unauthorized chat sends `/foo`, When the poll loop sees the
  update, Then the handler is not invoked and a warning is logged.
- **AC-003** Given a registered conversation, When the user types its entry command,
  Then `onCommand` runs and subsequent button presses route to `onCallback` until state
  returns to `idle`.
- **AC-004** Given a conversation is active, When the user sends `/cancel`, Then state
  resets to `idle` and the user is told "Cancelled."
- **AC-005** Given `start()` was called, When `stop()` is called, Then the poll loop
  exits before its next `getUpdates` and `running === false`.
- **AC-006** Given `getUpdates` returns an `Error`, When the loop iterates, Then it
  waits, doubles its backoff (capped at 5min), and retries without exiting.

## 6. Test Automation Strategy

Unit-test the dispatcher with a fake `ITelegramClient` driving update sequences through
`handleUpdate`. Cover: chat-id filtering, `/cancel`, conversation activation/deactivation,
overwrite-on-re-register. The poll-loop backoff is integration-tested by faking a
sequence of `Error` then success returns from `getUpdates`.

## 7. Rationale & Context

A provider sits between features and the HTTP client to keep state-machine routing,
authorization, and lifecycle concerns out of every feature. Features stay declarative
(`defineFeature({ commands, conversations })`); the provider owns dispatch.

A raw HTTP poll loop was chosen over Telegraf/grammY because the surface needed
(`getUpdates`, `sendMessage`, `editMessageText`, `answerCallbackQuery`) is small and
already validated with zod in `#/integrations/telegram`.

## 8. Dependencies & External Integrations

### External Systems

- **EXT-001** Telegram Bot API (`https://api.telegram.org/bot<token>`) — long-poll
  `getUpdates` with 30s timeout.

### Technology Platform Dependencies

- **PLT-001** Internal `httpClient` (`#/shared/utils/http_client`) — no third-party bot
  SDK.
- **PLT-002** Node.js (timers, async iteration).

## 9. Examples & Edge Cases

```ts
// Command (one-shot)
defineFeature({
  name: 'ping',
  commands: {
    '/ping': async (client, message) => {
      await client.sendMessage(message.chat.id, 'pong')
      return { step: 'idle' }
    },
  },
})

// Conversation (multi-step) — see language_sync/commands/language.command.ts
defineFeature({
  name: 'language_sync',
  conversations: { '/setlanguage': setLanguageConversation },
})
```

Edge cases: re-registering `/ping` overwrites the prior handler; an unauthorized chat
sending `/ping` is ignored; a button press while `activeConversationKey` is undefined is
dropped silently.

## 10. Validation Criteria

`vp check` and `vp test` pass. The dev script (`bun run dev` →
`bun --watch src/index.ts`) starts the provider whenever `.env` provides
`TELEGRAM_TOKEN` and `TELEGRAM_CHAT_ID`; omitting either fails zod parsing in
`src/config/env.ts` before `start()` is reached.

## 11. Related Specifications / Further Reading

- ../../../docs/architecture/container.spec.md
- ../../../docs/architecture/feature_registration.spec.md
