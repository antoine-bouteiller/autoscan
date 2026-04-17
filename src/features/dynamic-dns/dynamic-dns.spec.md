---
title: Dynamic DNS (Cloudflare)
status: condensed
author: Antoine Bouteiller
date: 2026-04-16
related: [docs/specs/architecture.spec.md]
---

## 2. Problem Statement

The home server sits behind a residential ISP with a dynamic public IP. Autoscan keeps an A record for the root
domain and the wildcard subdomain pointed at the current public IP by reconciling with Cloudflare every 5 minutes.

- `[G-1]` Keep `DOMAIN` and `*.DOMAIN` A records aligned with the current public IP.
- `[G-2]` Only PATCH the record when the IP actually changed.
- `[G-3]` Back off exponentially when Cloudflare or ipify fails, to avoid hammering under an outage.
- `[G-4]` Cache the zone ID once resolved — it doesn't change.

## 3. Key Design Decisions

| Decision               | Choice                                                                                   | Rationale                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `[KD-1]` IP source     | `api.ipify.org/?format=json`                                                             | Simple, unauthenticated, stable JSON                                              |
| `[KD-2]` Domain source | `DOMAIN` env var; record list is `[DOMAIN, *.DOMAIN]`                                    | Root + wildcard is sufficient for homelab sub-sites                               |
| `[KD-3]` Cadence       | Every 5 minutes (`0 */5 * * * *`)                                                        | IP changes are rare but fast reconvergence matters; 5 min is cheap for Cloudflare |
| `[KD-4]` Backoff       | Module-level `backoffUntil` timestamp; exponential 5 min → 30 min cap                    | Silences errors during outages without special-casing                             |
| `[KD-5]` Zone cache    | Module-level `zoneId` string, lazy                                                       | Zone lookup is an extra roundtrip per pass; cache for the lifetime of the process |
| `[KD-6]` Update method | Cloudflare `PATCH zones/{zoneId}/dns_records/{id}` with `content`, `name`, `ttl`, `type` | Preserves TTL; only `content` changes in practice                                 |

## 4. Principles & Intents

- `[PI-1]` **No-op when already correct** — compare `record.content === currentIp` before PATCHing.
- `[PI-2]` **Result-style errors bubble up** — `handleUpdateIp` returns the error; `dynDns` logs and sets backoff.
- `[PI-3]` **Cold zone cache is fetched lazily on first pass**, not at boot.
- `[PI-4]` **Backoff is coarse, not per-record** — one failure on either record pauses the whole job.

## 5. Non-Goals

- `[NG-1]` No IPv6 (AAAA) records.
- `[NG-2]` No multi-zone, multi-domain, or per-subdomain granularity beyond `DOMAIN` + `*.DOMAIN`.
- `[NG-3]` No TTL adjustment — whatever Cloudflare has is preserved.
- `[NG-4]` No manual trigger or status endpoint.

## 6. Caveats

- `[C-1]` Zone cache is invalidated only by process restart or by calling `resetZoneIdCache()` (test helper). If a
  zone is renamed or recreated in Cloudflare, restart is required.
- `[C-2]` ipify rate limits unauthenticated users; at every-5-minute cadence we are well under the limit, but a
  restart loop could hit it.
- `[C-3]` Backoff applies to the whole job — if wildcard lookup fails but root succeeds, the job still backs off.
- `[C-4]` `getARecord` returns `undefined` on lookup error (after logging) and the loop treats it as "no record" — it
  does _not_ trigger backoff. Only errors from `getZoneId` / `getPublicIP` do.

## 7. High-Level Components

| Component             | Module type                                                         | Responsibility                               | Public API surface                                                                             |
| --------------------- | ------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| DNS service           | Module (`src/features/dynamic-dns/services/dns.service.ts`)         | Orchestration + backoff + zone cache         | `dynDns()`, `handleUpdateIp(recordName)`, `resetZoneIdCache()`                                 |
| Feature register      | Module (`src/features/dynamic-dns/register.ts`)                     | Wires cron to SchedulerProvider              | `registerDynamicDns()`                                                                         |
| Cloudflare errors     | Module (`src/features/dynamic-dns/errors.ts`)                       | Domain errors + CF error-body formatter      | `DnsRecordNotFoundError`, `CloudflareZoneNotFoundError`, `cloudflareErrorFormatter`            |
| Cloudflare client     | Integration (`src/integrations/cloudflare/cloudflare.service.ts`)   | HTTP wrapper for Cloudflare + ipify          | `CloudflareClient` (`ICloudflareClient`)                                                       |
| Cloudflare validators | Integration (`src/integrations/cloudflare/cloudflare.validator.ts`) | Zod schemas for Cloudflare + ipify responses | `zonesResponseValidator`, `dnsRecordsResponseValidator`, `ipifyResponseValidator`, `DnsRecord` |

## 8. Detailed Design

> Condensed after implementation. See source code for full detail.

| Component             | Module                                                | Entry point                                                                                    |
| --------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| DNS service           | `src/features/dynamic-dns/services/dns.service.ts`    | `dynDns`, `handleUpdateIp`, `resetZoneIdCache`                                                 |
| Feature register      | `src/features/dynamic-dns/register.ts`                | `registerDynamicDns`                                                                           |
| Cloudflare errors     | `src/features/dynamic-dns/errors.ts`                  | `DnsRecordNotFoundError`, `CloudflareZoneNotFoundError`, `cloudflareErrorFormatter`            |
| Cloudflare client     | `src/integrations/cloudflare/cloudflare.service.ts`   | `CloudflareClient` (`ICloudflareClient`)                                                       |
| Cloudflare validators | `src/integrations/cloudflare/cloudflare.validator.ts` | `zonesResponseValidator`, `dnsRecordsResponseValidator`, `ipifyResponseValidator`, `DnsRecord` |

## 9. Verification Criteria

- `[VC-1]` `dynDns` updates when the current IP differs from the record content — **PASS** (`tests/services/dns.service.spec.ts`).
- `[VC-2]` `dynDns` is a no-op when IP matches — **PASS** (`tests/services/dns.service.spec.ts`).
- `[VC-3]` Error on `getZoneId` or `getPublicIP` sets `backoffUntil` and the next pass short-circuits — **PASS** (`tests/services/dns.service.spec.ts`).
- `[VC-4]` `errorDelay` doubles up to the 30-minute cap on consecutive failures — **PASS** (`tests/services/dns.service.spec.ts`).
- `[VC-5]` Successful pass resets `errorDelay` and clears `backoffUntil` — **PASS** (`tests/services/dns.service.spec.ts`).
- `[VC-6]` Zone ID is cached after first successful resolution — **PASS** (`tests/services/dns.service.spec.ts`).
- `[VC-7.1]` `registerDynamicDns()` attaches exactly: cron `Dynamic DNS` (every 5 minutes).

## 10. Open Questions

N/A
