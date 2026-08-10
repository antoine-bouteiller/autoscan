---
title: HTTP Provider
version: 3.0
last_updated: 2026-08-06
---

# Contract

`HttpProvider` uses Effect's `BunHttpServer` and `HttpRouter`, while preserving declarative route registration and the `inject` test seam. The provider is constructed by the Effect layer graph; request handlers receive their application context at execution time.

- Registration completes before `start` opens the listener.
- Invalid JSON returns HTTP 400 with `BAD_REQUEST` and `Invalid JSON`.
- Effect Schema failures return HTTP 400 with `invalid request` and Standard Schema V1 issue details.
- Unmapped typed failures and defects are logged once and return the existing HTTP 500 `INTERNAL_ERROR` body.
- Each HTTP handler executes directly in the request Effect, so request cancellation interrupts handler work.
- The root shutdown coordinator exclusively closes the HTTP provider scope. `BunHttpServer` stops intake and allows graceful connection shutdown for up to 30 seconds while the runtime drains scheduler, Telegram, and workflow fibers.
- `inject` executes the same Effect router without opening a TCP listener.

# Validation

Non-mutating format/lint/type checks and HTTP webhook tests must pass. Runtime tests verify cooperative and timed-out shutdown ordering.
