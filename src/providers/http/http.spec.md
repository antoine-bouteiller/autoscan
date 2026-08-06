---
title: HTTP Provider
version: 3.0
last_updated: 2026-08-06
---

# Contract

`HttpProvider` uses Effect's `BunHttpServer` and `HttpRouter`, while preserving declarative route registration and the `inject` test seam. The provider is constructed by the Effect layer graph and receives the single scoped callback runner.

- Registration completes before `start` opens the listener.
- Invalid JSON returns HTTP 400 with `BAD_REQUEST` and `Invalid JSON`.
- Effect Schema failures return HTTP 400 with `invalid request` and Standard Schema V1 issue details.
- Unmapped typed failures and defects are logged once and return the existing HTTP 500 `INTERNAL_ERROR` body.
- Each HTTP handler awaits its tracked fiber.
- Shutdown closes the HTTP provider scope. `BunHttpServer` stops intake and allows graceful connection shutdown for up to 30 seconds while the runtime drains tracked callbacks.
- `inject` executes the same Effect router without opening a TCP listener.

# Validation

`bun run check` and HTTP webhook tests must pass. Runtime tests verify cooperative and timed-out shutdown ordering.
