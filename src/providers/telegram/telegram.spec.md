---
title: Telegram Provider
version: 2.0
last_updated: 2026-08-05
---

# Contract

`TelegramProvider` receives `ITelegramClient` explicitly and exposes one root-scoped polling Effect.

- Polling preserves authorized-chat filtering, update offsets, commands, conversations, and cancellation messages.
- Long polling and backoff are interruptible.
- Recoverable polling failures use exponential delays beginning at 5 seconds and capped at 5 minutes; success resets the delay.
- Handler failures and defects are observed and logged once, reset conversation state to idle, send exactly `An unexpected error occurred`, and do not terminate polling.
- Scope interruption stops polling; there is no detached Promise loop or provider-owned process signal.
- Commands and conversations return Effects whose dependencies are supplied by the application layer graph.

# Validation

`tests/providers/telegram/telegram.provider.spec.ts` uses Effect's test clock to verify backoff, offset advancement, interruption, and handler-failure recovery under `bun:test`.
