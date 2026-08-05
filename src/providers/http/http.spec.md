---
title: HTTP Provider
version: 2.0
last_updated: 2026-08-05
---

# Contract

`HttpProvider` keeps native `Bun.serve`, declarative route registration, and the `inject` test seam. The provider is constructed by the Effect layer graph and receives the single scoped callback runner.

- Registration completes before `start()` opens the listener.
- Invalid JSON returns HTTP 400 with `BAD_REQUEST` and `Invalid JSON`.
- Zod failures return HTTP 400 with `invalid request` and the current details tree.
- Unmapped typed failures and defects are logged once and return the existing HTTP 500 `INTERNAL_ERROR` body.
- Each native callback awaits its tracked fiber.
- Shutdown calls `server.stop(false)` to stop intake. The runtime allows tracked work up to 30 seconds, then calls `server.stop(true)` before interrupting remaining callback fibers.
- `inject` executes the same route path without opening a TCP listener.

# Validation

`bun run check` and HTTP webhook tests must pass. Runtime tests verify cooperative and forced shutdown ordering.
