---
title: Telegram — core bot runtime + feature-owned commands
status: condensed
author: Antoine Bouteiller
date: 2026-04-16
related:
  [
    docs/specs/architecture.spec.md,
    src/features/language_sync/language_sync.spec.md,
    src/features/transcoding/transcoding.spec.md,
    src/features/trakt_sync/trakt_sync.spec.md,
  ]
---

## 2. Problem Statement

Autoscan runs headless — there is no web UI. Telegram is the operator-facing command channel: one-shot commands for
common actions, and a multi-step conversation for setting per-media language preferences. The bot is a **core runtime
provider** (not a feature): it owns the long-poll loop, the chat-ID auth gate, and the command/conversation dispatch.
The actual commands are owned and registered by each feature via its `register*()` function.

- `[G-1]` Expose `/setlanguage`, `/trakt`, `/synctrakt`, `/transcode`, `/subtitlescan`, `/cancel` to the operator chat
  — all except `/cancel` are registered by individual features.
- `[G-2]` Support multi-step conversations with inline-keyboard callbacks (needed by `/setlanguage`).
- `[G-3]` Reject any update whose chat ID doesn't match `env.TELEGRAM_CHAT_ID`.
- `[G-4]` Survive transient Telegram API failures with exponential backoff.
- `[G-5]` The core Telegram module exposes zero app-specific commands of its own (except the built-in `/cancel`) —
  it only exposes the provider API so features can register their commands on it.

## 3. Key Design Decisions

| Decision                      | Choice                                                                                                 | Rationale                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `[KD-1]` Transport            | Long-polling `getUpdates` with `timeout=30`                                                            | No public HTTPS endpoint needed; fits homelab behind NAT                           |
| `[KD-2]` Auth                 | `update.message.chat.id === env.TELEGRAM_CHAT_ID` or `update.callback_query.message.chat.id`           | Single-operator bot, no per-user auth                                              |
| `[KD-3]` Command registration | Two shapes: `registerCommand(cmd, handler)` and `registerConversation(cmd, { onCommand, onCallback })` | One-shot commands and multi-step flows share the bot but have different lifecycles |
| `[KD-4]` State                | Single `ConversationState` field on the provider — one active conversation at a time                   | Operator is single, serialized flows are simpler to reason about                   |
| `[KD-5]` Cancel               | Hard-coded `/cancel` handler that always runs before dispatch                                          | User can always escape                                                             |
| `[KD-6]` Backoff              | On `getUpdates` error: 5s → 5min exponential                                                           | Same pattern as DNS service                                                        |
| `[KD-7]` Telegram client      | Custom thin wrapper (`TelegramClient`) over `fetch` via internal `httpClient`                          | No framework; matches other integrations                                           |
| `[KD-8.1]` Command ownership  | Each command is registered by the feature that owns its handler; `/cancel` is the only built-in        | Keeps features independent; provider only dispatches                               |

## 4. Principles & Intents

- `[PI-1]` **Chat-ID gate is the auth boundary** — every update goes through `handleUpdate` which short-circuits on
  unknown chat IDs.
- `[PI-2]` **Commands return `ConversationState`** — a command that goes multi-step returns a non-`idle` state and
  the provider remembers which command "owns" it via `activeConversationKey`.
- `[PI-3]` **Long-running work is detached** — `traktAuthCommand` and `subtitleScanCommand` spawn async IIFEs so the
  poll loop isn't blocked.
- `[PI-4]` **The provider does not know what commands do** — commands own all business logic; the provider only
  dispatches.
- `[PI-5.1]` **Features own their commands.** `core/telegram/` exposes only `TelegramProvider` and the conversation
  types. Commands are attached from `features/<feature>/register.ts`. Core never hard-codes a command (other than
  `/cancel`).

## 5. Non-Goals

- `[NG-1]` No multi-user, per-user permissions, groups.
- `[NG-2]` No slash-command arguments — all input is via inline keyboards or free text (not parsed).
- `[NG-3]` No persistent conversation state — a restart resets conversations to `idle`.
- `[NG-4]` No rate limiting of operator commands.

## 6. Caveats

- `[C-1]` Only one conversation can be active at a time — starting `/setlanguage` mid-`/setlanguage` re-enters the
  first step.
- `[C-2]` Callback queries received when no conversation is active are ignored (no warning).
- `[C-3]` Error backoff pauses polling up to 5 minutes — commands sent during backoff are buffered by Telegram and
  replayed after.
- `[C-4]` The bot is started in `src/index.ts` _after_ `http.start()` — a crash in bootstrap won't start the bot, so
  operator won't be notified via Telegram.
- `[C-5]` Commands spawning fire-and-forget IIFEs (e.g. `/trakt`, `/subtitlescan`) are not awaited on `SIGINT`.

## 7. High-Level Components

| Component           | Module type                                                   | Responsibility                                 | Public API surface                                                                                                                                      |
| ------------------- | ------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Telegram provider   | Core runtime (`src/providers/telegram/telegram.provider.ts`)  | Poll + dispatch + active-conversation state    | `TelegramProvider.start()`, `.stop()`, `.registerCommand(cmd, handler)`, `.registerConversation(cmd, { onCommand, onCallback })`                        |
| Telegram types      | Module (`src/providers/telegram/types.ts`)                    | Conversation state, inline-keyboard types      | `ConversationState`, `InlineKeyboardButton`, `InlineKeyboardMarkup`                                                                                     |
| Telegram client     | Integration (`src/integrations/telegram/telegram.service.ts`) | Telegram Bot API wrapper                       | `TelegramClient` (`ITelegramClient`): `getUpdates`, `sendMessage`, `editMessageText`, `deleteMessage`, `answerCallbackQuery`                            |
| Telegram validators | Module (`src/integrations/telegram/telegram.validator.ts`)    | Zod schemas for Telegram API                   | `getUpdatesResponseSchema`, `sendMessageResponseSchema`, `TelegramUpdate`, `TelegramMessageIn`, `TelegramCallbackQuery`                                 |
| Feature commands    | Handlers owned by features                                    | One handler per command, registered by feature | `setLanguageConversation` (language_sync), `traktAuthCommand`, `syncTraktCommand` (trakt_sync), `transcodeCommand`, `subtitleScanCommand` (transcoding) |

## 8. Detailed Design

> Condensed after implementation. See source code for full detail.

| Component               | Module                                                       | Entry point                                                                        |
| ----------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Telegram provider       | `src/providers/telegram/telegram.provider.ts`                | `TelegramProvider`                                                                 |
| Telegram types          | `src/providers/telegram/types.ts`                            | `ConversationState`, `InlineKeyboardButton`, `InlineKeyboardMarkup`                |
| Telegram client         | `src/integrations/telegram/telegram.service.ts`              | `TelegramClient` / `ITelegramClient`                                               |
| Telegram validators     | `src/integrations/telegram/telegram.validator.ts`            | `getUpdatesResponseSchema`, `sendMessageResponseSchema`, `TelegramUpdate`          |
| `/setlanguage` command  | `src/features/language_sync/commands/language.command.ts`    | `setLanguageConversation` (registered in `src/features/language_sync/register.ts`) |
| `/trakt` command        | `src/features/trakt_sync/commands/trakt.command.ts`          | `traktAuthCommand` (registered in `src/features/trakt_sync/register.ts`)           |
| `/synctrakt` command    | `src/features/trakt_sync/commands/trakt.command.ts`          | `syncTraktCommand` (registered in `src/features/trakt_sync/register.ts`)           |
| `/transcode` command    | `src/features/transcoding/commands/transcode.command.ts`     | `transcodeCommand` (registered in `src/features/transcoding/register.ts`)          |
| `/subtitlescan` command | `src/features/transcoding/commands/subtitle_scan.command.ts` | `subtitleScanCommand` (registered in `src/features/transcoding/register.ts`)       |
| `/cancel` built-in      | `src/providers/telegram/telegram.provider.ts`                | `handleCancel` (hard-coded inside `TelegramProvider.handleUpdate`)                 |

## 9. Verification Criteria

- `[VC-1]` Updates from foreign chat IDs are ignored — covered indirectly by integration test; asserted at
  `handleUpdate`.
- `[VC-2]` `/cancel` resets an active conversation and clears `activeConversationKey`.
- `[VC-3]` `registerCommand` and `registerConversation` are exclusive — a command name registered in both maps resolves
  to the conversation entry first.
- `[VC-4]` `getUpdates` errors trigger exponential backoff up to 5 min — verifiable via mocking the client.
- `[VC-5]` Command handlers that return `{ step: 'idle' }` cause the provider to clear `activeConversationKey`.
- `[VC-6]` `sendMessage` returns `undefined` on underlying HTTP failure.
- `[VC-7.1]` `src/providers/telegram/**` contains no references to specific commands (except `/cancel`); commands appear
  only under `src/features/**/register.ts` and `*.command.ts`.

## 10. Open Questions

N/A
