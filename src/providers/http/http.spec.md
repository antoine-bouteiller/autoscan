---
title: HTTP — core runtime + feature-owned webhooks
status: condensed
author: Antoine Bouteiller
date: 2026-04-16
related: [docs/specs/architecture.spec.md, src/features/transcoding/transcoding.spec.md]
---

## 2. Problem Statement

Autoscan exposes a tiny HTTP surface consumed by Radarr, Sonarr, and an optional external trigger for sending Telegram
messages. The server is a **core runtime provider** (not a feature): it owns the socket, the route table, body
parsing, and the response envelope. The actual webhook routes are registered by features at boot via their
`register*()` functions.

- `[G-1]` Receive Radarr/Sonarr `Download`/`Test` webhooks and trigger transcode / Plex refresh (registered by
  `transcoding` feature).
- `[G-2]` Accept an authenticated-by-deployment (reverse-proxy-gated) message-send endpoint for piping arbitrary text
  into the Telegram chat (registered by `send-message` feature).
- `[G-3]` Provide a test-only `inject()` path so routes can be exercised without a real socket.
- `[G-4]` Use the same Zod schema for validation and for the controller's body type.
- `[G-5]` The core HTTP module exposes zero app-specific routes of its own — it only exposes the provider API so
  features can register routes on it.

## 3. Key Design Decisions

| Decision                   | Choice                                                                              | Rationale                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `[KD-1]` Server            | Native `node:http.createServer`                                                     | Zero framework, small bundle (see commit 3fd6395)                                                                   |
| `[KD-2]` Route store       | `Map<"METHOD:path", RouteHandler>`                                                  | Exact-match only — no params, no wildcards, fast lookup                                                             |
| `[KD-3]` Validation        | Wrap `POST` registration with `validator.safeParse(body)` before calling handler    | Handler's body param is `z.output<TSchema>`, no manual parse in controllers                                         |
| `[KD-4]` Response envelope | `{ success, data?, error?, meta: { timestamp } }`                                   | One shape for success and failure; clients parse `success` first                                                    |
| `[KD-5]` Body parsing      | Read raw, `JSON.parse` for `POST`/`PUT`/`PATCH`; `400 BAD_REQUEST` on parse failure | Avoids a third-party body-parser                                                                                    |
| `[KD-6]` Authentication    | None at app layer                                                                   | Deploy behind a reverse proxy that does auth — single-user homelab context                                          |
| `[KD-7]` `inject()`        | In-memory dispatcher that returns `{ statusCode, json() }`                          | Enables route tests without TCP — avoids race conditions and port conflicts in test runner                          |
| `[KD-8.1]` Route ownership | Each route is registered by the feature that owns its handler, not by core          | Keeps features independent; `/radarr` + `/sonarr` live with `transcoding`; `/send-message` lives in its own feature |

## 4. Principles & Intents

- `[PI-1]` **Features own their HTTP routes.** `core/http/` exposes only `HttpProvider`. Routes are attached from
  `features/<feature>/register.ts`. Core never hard-codes a route.
- `[PI-2]` **Webhooks call feature services, never integrations directly** unless the operation is trivial
  (e.g. `sendMessageWebhook` just forwards to `TelegramClient`).
- `[PI-3]` **All responses go through `success()` or `badRequest()`** from `src/providers/http/response.ts` — handlers never
  call `reply.send()` with a bare object.
- `[PI-4]` **Zod schema is the source of truth** — body types are inferred with `z.infer<typeof schemaName>`.
- `[PI-5]` **Handlers return a value only for type convenience** — the reply is sent via side-effect on `reply`;
  returns are ignored by the server.

## 5. Non-Goals

- `[NG-1]` No path params (`/:id`), query strings, wildcards, or middlewares — exact `METHOD:path` match only.
- `[NG-2]` No cookies, sessions, CORS, or auth — out of scope for this service.
- `[NG-3]` No multipart, streaming, or large-body handling — webhook bodies are small JSON documents.
- `[NG-4]` No `GET` routes are registered today — `http.get()` exists but is unused.
- `[NG-5.1]` No dynamic route discovery — core does not scan feature folders; routes become active only when their
  feature's `register*()` is invoked from `core/bootstrap.ts`.

## 6. Caveats

- `[C-1]` `HttpProvider.get()` has no validator hook — GET is uninstrumented for payloads since webhooks are all POST.
- `[C-2]` Error envelope in the live server path omits `meta.timestamp` for the JSON-parse-failed `400` path; all
  other paths include it. See `src/providers/http/http.provider.ts`.
- `[C-3]` Handler exceptions are caught and converted to `500 INTERNAL_ERROR`; `res.headersSent` is checked so a
  partially-written response isn't double-written.
- `[C-4]` Route map is global per `HttpProvider` instance — re-registering the same key silently overwrites.

## 7. High-Level Components

| Component        | Module type                                          | Responsibility                                                 | Public API surface                                                                                                                                           |
| ---------------- | ---------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HttpProvider     | Core runtime (`src/providers/http/http.provider.ts`) | Server lifecycle, route registry, body parsing, error envelope | `new HttpProvider({ port, hostname })`, `.get(path, handler)`, `.post(path, validator, handler)`, `.start()`, `.stop()`, `.inject({ method, url, payload })` |
| Response helpers | Module (`src/providers/http/response.ts`)            | Success / failure envelope builders                            | `success(reply, data, status=200)`, `badRequest(reply, message, details?)`                                                                                   |
| Types            | Module (`src/providers/http/types.ts`)               | Request/reply contracts                                        | `AppRequest<TBody>`, `AppReply`, `RouteHandler<TBody>`                                                                                                       |
| Feature webhooks | Handlers owned by features                           | Parse validated body, call feature services, call `success()`  | `radarrWebhook`, `sonarrWebhook` (transcoding), `sendMessageWebhook` (send-message)                                                                          |
| Validators       | Zod schemas                                          | Discriminated unions for webhook event types                   | `radarrValidator`, `sonarrValidator` (`src/integrations/arr/`), `sendMessageValidator` (`src/features/send-message/`)                                        |

**Feature-registered routes:**

| Method | Path            | Owning feature | Handler              | Validator location                                               |
| ------ | --------------- | -------------- | -------------------- | ---------------------------------------------------------------- |
| POST   | `/radarr`       | `transcoding`  | `radarrWebhook`      | `src/integrations/arr/radarr.validator.ts`                       |
| POST   | `/sonarr`       | `transcoding`  | `sonarrWebhook`      | `src/integrations/arr/sonarr.validator.ts`                       |
| POST   | `/send-message` | `send-message` | `sendMessageWebhook` | `src/features/send-message/validators/send_message.validator.ts` |

## 8. Detailed Design

> Condensed after implementation. See source code for full detail.

| Component              | Module                       | Entry point                                                              |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| HttpProvider           | `src/providers/http/`        | `src/providers/http/http.provider.ts` (`HttpProvider`)                   |
| Response helpers       | `src/providers/http/`        | `src/providers/http/response.ts` (`success`, `badRequest`)               |
| Types                  | `src/providers/http/`        | `src/providers/http/types.ts` (`AppRequest`, `AppReply`, `RouteHandler`) |
| Radarr webhook         | `src/features/transcoding/`  | `src/features/transcoding/webhooks/radarr.webhook.ts`                    |
| Sonarr webhook         | `src/features/transcoding/`  | `src/features/transcoding/webhooks/sonarr.webhook.ts`                    |
| Transcoding register   | `src/features/transcoding/`  | `src/features/transcoding/register.ts`                                   |
| Send-message webhook   | `src/features/send-message/` | `src/features/send-message/webhooks/send_message.webhook.ts`             |
| Send-message register  | `src/features/send-message/` | `src/features/send-message/register.ts`                                  |
| Radarr validator       | `src/integrations/arr/`      | `src/integrations/arr/radarr.validator.ts`                               |
| Sonarr validator       | `src/integrations/arr/`      | `src/integrations/arr/sonarr.validator.ts`                               |
| Send-message validator | `src/features/send-message/` | `src/features/send-message/validators/send_message.validator.ts`         |

## 9. Verification Criteria

- `[VC-1]` `POST /radarr` with Download event triggers `getMediaLanguage` + `transcodeFile` — **PASS** (`tests/routes/radarr.spec.ts`).
- `[VC-2]` `POST /sonarr` with Download event triggers `getMediaLanguage` + `transcodeFile` — **PASS** (`tests/routes/sonarr.spec.ts`).
- `[VC-3]` `POST /send-message` forwards text to Telegram — **PASS** (`tests/routes/send_message.spec.ts`).
- `[VC-4]` Invalid body returns `400` with `error.code === 'BAD_REQUEST'` and `z.treeifyError` details — **PASS** (covered in `tests/routes/radarr.spec.ts`, `tests/routes/sonarr.spec.ts`, `tests/routes/send_message.spec.ts`).
- `[VC-5]` Unknown route returns `404` with `error.code === 'NOT_FOUND'`.
- `[VC-6]` Handler exceptions return `500` with `error.code === 'INTERNAL_ERROR'` and a `meta.timestamp`.
- `[VC-7]` `Test` eventType shortcircuits without any side effect — **PASS** (covered in `tests/routes/radarr.spec.ts`, `tests/routes/sonarr.spec.ts`).
- `[VC-8.1]` `src/providers/http/**` contains no references to specific routes (`/radarr`, `/sonarr`, `/send-message`);
  routes appear only under `src/features/**/register.ts` and `*.webhook.ts`.

## 10. Open Questions

N/A
