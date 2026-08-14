---
title: Telegram Provider
status: implemented
author: Antoine Bouteiller
date: 2026-08-14
related:
  [
    docs/project_structure.spec.md,
    docs/architecture/architecture.spec.md,
    src/features/language_sync/language_sync.spec.md,
    src/features/transcoding/transcoding.spec.md,
  ]
---

## 2. Problem Statement

Autoscan accepts commands and interactive callbacks from one authorized Telegram chat. Features need to register commands and stateful conversations as Effects, while the provider owns update polling, authorization, offsets, backoff, recovery, and cancellation.

- `[G-1]` Poll Telegram updates continuously and deliver only authorized updates to registered handlers.
- `[G-2]` Support command and callback conversations through an explicit finite state value.
- `[G-3]` Recover from polling and handler failures without abandoning future updates.

## 3. Key Design Decisions

| Decision                    | Choice                                                                                                            | Rationale                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `[KD-1]` Client ownership   | Accept an `ITelegramClient` in the provider constructor.                                                          | Explicit injection keeps vendor I/O replaceable and lets handler execution share the same client instance.       |
| `[KD-2]` Authorization      | Filter each message or callback chat ID against `TELEGRAM_CHAT_ID`.                                               | The bot processes private control actions, so untrusted chats cannot enter feature workflows.                    |
| `[KD-3]` Conversation model | Maintain one active command key and one `ConversationState`; handlers return the successor state.                 | State transitions remain feature-defined while dispatch retains enough context to route callbacks.               |
| `[KD-4]` Handler recovery   | Log non-interruption causes, reset state to idle, and send a fixed error message.                                 | A faulty feature interaction cannot leave the provider trapped in an unusable conversation or terminate polling. |
| `[KD-5]` Poll retry         | Retry failed `getUpdates` calls with exponential Effect sleeps from 5 seconds to 5 minutes, resetting on success. | Backoff reduces pressure on an unavailable external API while Effect sleep remains interruptible.                |

## 4. Principles & Intents

- `[PI-1]` Authorized dispatch — filtering precedes all command, cancellation, and callback behavior.
- `[PI-2]` Effect-native lifecycle — polling and handlers stay in the Effect runtime, including interruption and logging.
- `[PI-3]` Conversation containment — an active conversation owns callbacks until it returns `idle`.

## 5. Non-Goals

- `[NG-1]` The provider does not persist conversation state across process lifetimes.
- `[NG-2]` The provider does not support concurrent conversations or distinct state per chat.
- `[NG-3]` The provider does not interpret feature command payloads or callback data.

## 6. Caveats

- `[C-1]` Command and conversation registrations use `Map.set`, so registering the same command again replaces its handler (`src/providers/telegram/telegram.provider.ts:33-41`).
- `[C-2]` Updates with a missing or unauthorized chat ID only produce a warning and do not advance feature state (`src/providers/telegram/telegram.provider.ts:120-124`).
- `[C-3]` `/cancel` replies `No operation in progress` while idle; otherwise it clears state and replies `Cancelled.` (`src/providers/telegram/telegram.provider.ts:67-74`).
- `[C-4]` A callback with no active key, or with a key absent from the conversation map, has no effect (`src/providers/telegram/telegram.provider.ts:98-106`).
- `[C-5]` A non-text message reaches authorization but does not invoke a command handler (`src/providers/telegram/telegram.provider.ts:76-81`).
- `[C-6]` A recognized command during an active conversation is not dispatched as an ordinary command (`src/providers/telegram/telegram.provider.ts:125-130`).
- `[C-7]` Notification delivery failure is logged and does not reintroduce the failed handler cause (`src/providers/telegram/telegram.provider.ts:54-60`).

## 7. High-Level Components

| Component              | Module type          | Responsibility                                                         | Public API surface                                                    |
| ---------------------- | -------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Telegram provider      | Effect runtime host  | Register handlers, dispatch authorized updates, and poll with recovery | `TelegramProvider`, `registerCommand`, `registerConversation`, `poll` |
| Conversation contracts | TypeScript contracts | Describe command/callback handlers and transition state                | `CommandHandler`, `Conversation`, `ConversationState`                 |
| Keyboard contracts     | TypeScript contracts | Represent inline Telegram keyboard markup used by feature handlers     | `InlineKeyboardButton`, `InlineKeyboardMarkup`                        |

## 8. Detailed Design

### Telegram provider

The provider starts with `idle` state, maps commands and conversations by command text, and retains the injected Telegram client (`src/providers/telegram/telegram.provider.ts:22-41`). A message that names a conversation activates that key and runs its `onCommand`; an ordinary registered command runs only while no conversation is active. Either handler returns the next state, and returning `idle` clears the active key (`src/providers/telegram/telegram.provider.ts:76-95`). Callbacks route only to the active conversation and receive both callback data and current state (`src/providers/telegram/telegram.provider.ts:98-114`).

Handler recovery re-fails interruption only. Every other cause resets the conversation to idle, logs it, attempts to notify the authorized chat with `An unexpected error occurred`, and logs a notification failure unless it is an interruption (`src/providers/telegram/telegram.provider.ts:43-65`). Update dispatch obtains the chat ID from a message or callback, rejects unauthorized senders, treats `/cancel` specially, then chooses message or callback dispatch (`src/providers/telegram/telegram.provider.ts:117-133`).

`poll` begins at offset zero. Each successful update advances the offset to `update_id + 1` during dispatch, preventing an acknowledged update from being requested again. A failed poll logs, sleeps for the active delay, doubles it to a 5-minute ceiling, and retries; a successful fetch restores the 5-second delay. Its finalizer logs polling termination (`src/providers/telegram/telegram.provider.ts:135-158`).

The polling loop handles updates serially within each response, so state transition completion determines when the next update is processed (`src/providers/telegram/telegram.provider.ts:151-155`). Scope interruption reaches `getUpdates` or `Effect.sleep`, exits the loop, and invokes the polling finalizer rather than creating a detached Promise loop (`src/providers/telegram/telegram.provider.ts:142-158`).

### Conversation contracts

A command handler receives the injected client and a Telegram message, and returns an Effect of the next `ConversationState` with `AppRequirements`. A conversation also provides a callback handler that receives chat ID plus `{ state, callback }` (`src/providers/telegram/telegram.provider.ts:9-20`). The state union contains `idle` and language-selection states carrying the message, media type, page, or TMDB ID required by the feature flow (`src/providers/telegram/types.ts:3-7`).

### Keyboard contracts

Feature handlers describe inline keyboards as rows of buttons with display `text` and Telegram `callback_data`; `InlineKeyboardMarkup` groups those rows under `inline_keyboard` (`src/providers/telegram/types.ts:9-15`). The provider transports callbacks but does not parse their payload.

## 9. Open Questions

N/A
