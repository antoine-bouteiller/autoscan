---
title: Dynamic DNS Feature
version: 1.0
date_created: 2026-05-08
last_updated: 2026-05-08
tags: [feature, dns, cloudflare, scheduler]
---

# Introduction

The `dynamic_dns` feature keeps the Cloudflare A records for `DOMAIN` and `*.DOMAIN` aligned
with the public IP of the host running Autoscan. It replaces an external DDNS client and runs
on the in-process scheduler.

## 1. Purpose & Scope

- Update the apex and wildcard A records for the configured `DOMAIN` whenever the host's
  public IP changes.
- Avoid unnecessary Cloudflare writes when the IP is unchanged.
- Self-throttle on transient Cloudflare or network errors.
- Out of scope: AAAA/IPv6 records, multi-domain support, manual record creation.

## 2. Definitions

- **Zone**: Cloudflare DNS zone identified by `DOMAIN`.
- **Record name**: FQDN written to Cloudflare; here `DOMAIN` and `*.DOMAIN`.
- **Public IP**: IPv4 address returned by `https://api.ipify.org/?format=json`.
- **Backoff**: Exponential pause window during which the job short-circuits.

## 3. Requirements, Constraints & Guidelines

- REQ-001 The job MUST run on the cron pattern `0 */5 * * * *` (every 5 minutes).
- REQ-002 The job MUST update both `DOMAIN` and `*.DOMAIN` A records on each run.
- REQ-003 The zone ID MUST be resolved once and cached in module scope across runs.
- REQ-004 A Cloudflare PATCH MUST only be issued when `record.content !== currentIp`.
- REQ-005 On any error from `handleUpdateIp`, the run MUST schedule a backoff window.
- CON-001 The feature depends on `TOKENS.CLOUDFLARE_CLIENT` being registered in the DI container.
- CON-002 `CLOUDFLARE_TOKEN` and `DOMAIN` MUST be present in the environment (validated by
  `src/config/env.ts`).
- CON-003 The Cloudflare token MUST grant `Zone:Read` and `DNS:Edit` for the target zone.
- GUD-001 Use `isError`/`logError` from `#/shared/utils/error` rather than `try/catch`.
- GUD-002 Keep the handler idempotent — repeated invocations with the same IP must be no-ops.
- PAT-001 Errors are returned as values (tagged error classes) rather than thrown.
- PAT-002 Backoff state lives in module scope; `resetZoneIdCache` exists for tests.

## 4. Interfaces & Data Contracts

- Cron job: `{ name: 'Dynamic DNS', pattern: '0 */5 * * * *', handler: dynDns }` registered via
  `defineFeature` in `feature.ts`.
- `dynDns()`: top-level handler. Iterates `[DOMAIN, *.DOMAIN]`, calls `handleUpdateIp`, logs any
  error, and updates the backoff window.
- `handleUpdateIp(recordName)`: resolves zone ID (cached), fetches the A record, fetches the
  public IP, and patches the record only when the IP differs. Returns `undefined` on success,
  an error value otherwise.
- `resetZoneIdCache()`: clears module-level state; intended for tests.
- `ICloudflareClient` (from `#/integrations/cloudflare/cloudflare.service`): `getPublicIP()`,
  `getZoneId(zoneName)`, `getARecord(recordName, zoneId)`, `updateDnsRecord(record, ip, zoneId)`.
- Errors (`errors.ts`): `CloudflareZoneNotFoundError` (zone lookup empty),
  `DnsRecordNotFoundError` (no A record returned), `cloudflareErrorFormatter` (extracts
  `errors[].message` from Cloudflare error envelopes for HTTP error logging).
- Env vars: `CLOUDFLARE_TOKEN` (Bearer token, supports `_FILE` secret indirection),
  `DOMAIN` (apex domain, used as both zone name and record name).

## 5. Acceptance Criteria

- AC-001 Given the public IP changed, When the `dynamic_dns` job fires, Then the Cloudflare A
  record for `DOMAIN` and `*.DOMAIN` is patched with the new IP.
- AC-002 Given the public IP did not change, When the job fires, Then no `PATCH` request is
  sent to Cloudflare.
- AC-003 Given the Cloudflare API is unreachable, When the job fires, Then the error is logged,
  the scheduler is not crashed, and a backoff window is set.
- AC-004 Given the zone is not found, When the job fires, Then a `CloudflareZoneNotFoundError`
  is returned, logged, and the cached zone ID stays empty so the next run retries lookup.
- AC-005 Given the previous run errored, When the next tick fires inside the backoff window,
  Then the handler logs a skip message and returns without contacting Cloudflare.
- AC-006 Given the backoff window has expired with continued errors, When the next run also
  errors, Then the delay doubles up to a 30-minute cap.

## 6. Test Automation Strategy

- Unit-test `handleUpdateIp` against a mocked `ICloudflareClient` covering: cache miss/hit on
  `zoneId`, IP unchanged, IP changed, zone not found, record not found, network error from
  `getPublicIP`.
- Unit-test `dynDns` for backoff math: success resets to 5 minutes, errors double up to 30
  minutes, in-window calls short-circuit.
- Use `resetZoneIdCache()` in `beforeEach` to isolate module state.
- Stub the container with `container.register(TOKENS.CLOUDFLARE_CLIENT, ...)` per test.

## 7. Rationale & Context

The home network behind Autoscan has a dynamic public IP. A 5-minute cadence balances
recovery time after an ISP-driven IP change against Cloudflare API quota and ipify rate
limits. Caching the zone ID avoids one Cloudflare call per tick. Returning errors as values
lets the handler keep iterating both record names without aborting on the first failure, while
the backoff prevents tight error loops from hammering Cloudflare during outages.

## 8. Dependencies & External Integrations

### External Systems

- EXT-001 Cloudflare API (`https://api.cloudflare.com/client/v4/`) — `GET /zones`,
  `GET /zones/:id/dns_records`, `PATCH /zones/:id/dns_records/:recordId`. Authenticated via
  `Authorization: Bearer ${CLOUDFLARE_TOKEN}`.
- EXT-002 ipify (`https://api.ipify.org/?format=json`) — public IP lookup, no auth, JSON
  response validated by `ipifyResponseValidator`.

### Technology Platform Dependencies

- PLT-001 DI container (`#/core/container`, `TOKENS.CLOUDFLARE_CLIENT`).
- PLT-002 Feature registration (`#/core/feature` → `defineFeature`).
- PLT-003 Scheduler provider that consumes `jobs` exported by features.
- PLT-004 `#/shared/utils/http_client` for HTTP, validation, and structured error returns.
- PLT-005 `#/config/env` for typed access to `CLOUDFLARE_TOKEN` and `DOMAIN`.

## 9. Examples & Edge Cases

- IP unchanged: `record.content === currentIp` short-circuits before any `PATCH`.
- First run after boot: `zoneId` is empty, so `getZoneId` is called and cached.
- Wildcard record missing: `DnsRecordNotFoundError` is returned for `*.DOMAIN` only; the apex
  update still proceeds in the same tick.
- ipify outage: `getPublicIP` returns a network/validation error; the run sets backoff and
  retries after the window.
- Cloudflare 5xx during `getARecord`: the integration logs and returns `undefined`, so
  `handleUpdateIp` exits cleanly without scheduling a write.
- Token rotated and revoked: Cloudflare returns a 401 envelope; `cloudflareErrorFormatter`
  surfaces the human-readable message in logs.

## 10. Validation Criteria

- The handler never throws; all failure paths return through `isError`/`logError`.
- `zoneId` is resolved at most once per process unless an error path leaves it unset.
- No Cloudflare `PATCH` is observed in tests when the mocked record content matches the
  mocked public IP.
- The cron pattern in `feature.ts` matches `0 */5 * * * *`.

## 11. Related Specifications / Further Reading

- ../../../docs/architecture/feature_registration.spec.md
- ../../providers/scheduler/scheduler.spec.md
