# Architecture

## 1) Product Scope
Rayscan is a general-purpose explorer with Raydium-first depth for:
- transaction decode (Raydium route legs, fees, compute, priority fee)
- pool analytics (liquidity, volume, swaps, fee APR proxy)
- wallet activity (Raydium-specific timeline and positions)
- search (signature, address, pool, mint)
- program pages with reproducible verification status

Non-goal in v1: full generic Solana explorer parity.

## 2) High-Level System
```text
Yellowstone gRPC stream + RPC backfill
  -> indexer-stream (decode + normalize)
  -> verifier (program metadata + reproducible build checks)
  -> event bus (NATS/Kafka)
  -> ClickHouse (facts) + Postgres (entities) + Redis (hot cache)
  -> api service (REST/GraphQL/SSE)
  -> web app
```

## 3) Services

### `services/indexer-stream`
Responsibilities:
- subscribe to blocks/transactions/accounts from Yellowstone
- filter Raydium-related transactions by program IDs
- decode instructions and events using `packages/decoders-raydium`
- persist raw + normalized records
- publish normalized events (`swap.executed`, `pool.updated`, `wallet.activity`)

SLO:
- p95 ingestion lag < 2.0s from finalized slot.

### `services/indexer-backfill`
Responsibilities:
- fill historical ranges from RPC
- detect/repair gaps from stream outages
- run idempotent replay jobs keyed by `(slot, signature, ix_index)`

SLO:
- recover 1 hour outage in < 10 minutes.

### `services/api`
Responsibilities:
- serve explorer pages and widgets
- provide query interfaces:
  - REST for simple list/detail endpoints
  - GraphQL for composable pages
  - SSE for live swaps and slot status
- enforce query cost limits, pagination caps, and cache policy

SLO:
- p95 endpoint latency < 250ms for cached reads.

### `services/search-sync`
Responsibilities:
- tail changes from Postgres
- update search index for signatures/addresses/mints/pools
- maintain prefix and exact-match search docs

### `services/verifier`
Responsibilities:
- discover candidate programs from traffic and curated lists
- refresh program metadata (loader, authority, deploy/upgrade slots)
- run reproducible verification jobs (via `solana-verify`)
- persist verification history and publish feed events

SLO:
- p95 queued verification start < 60s.

## 4) Data Model Strategy

### ClickHouse (fact-heavy analytics)
Use for:
- `fact_swaps`
- `fact_pool_snapshots_1m`
- `fact_tx_compute`
- `fact_wallet_activity`

Reasons:
- fast time-range scans and aggregations
- low-latency dashboards for volume/fees/leaderboards

### Postgres (canonical entities)
Use for:
- `ray_programs`
- `programs`
- `program_verifications`
- `verification_runs`
- `pools`
- `tokens`
- `wallet_profiles`
- `tx_index`

Reasons:
- relational integrity and simpler entity lookups
- primary source for API detail pages

### Redis (hot path)
Use for:
- recent swaps ring buffer
- live counters
- response caching for high-QPS endpoints
- lightweight rate-limit buckets

## 5) API Shape (v1)

REST:
- `GET /v1/tx/:signature`
- `GET /v1/pools/:poolAddress`
- `GET /v1/pools/:poolAddress/swaps?cursor=...`
- `GET /v1/wallets/:address/activity?cursor=...`
- `GET /v1/search?q=...`
- `GET /v1/live/swaps` (SSE)
- `GET /v1/programs/:programId`
- `GET /v1/programs/:programId/verification`
- `GET /v1/programs/verification-feed?window=24h`

GraphQL:
- `transaction(signature)`
- `pool(address)`
- `wallet(address)`
- `search(query)`
- `program(address)`
- `verificationFeed(window)`

## 6) Anti-Bot Without User Friction

Policy:
- no blanket interstitial challenge page for read routes.

Controls:
- adaptive edge rate limiting (IP + fingerprint + path)
- API key + signed short-lived token for high-cost queries
- GraphQL complexity limits and maximum node caps
- per-endpoint response caching and stale-if-error fallback
- progressive mitigation:
  - throttle first
  - degrade to cached data
  - challenge only abusive traffic patterns

## 7) Frontend Architecture

Framework:
- Next.js App Router
- wallet integration with `@solana/client` and `@solana/react-hooks`
- `@solana/kit` for signature parsing and explorer actions

Pages:
- `/tx/[signature]`
- `/pool/[address]`
- `/wallet/[address]`
- `/program/[programId]`
- `/search`
- `/live`

UX rules:
- transaction state clarity (submitted, confirmed, finalized)
- explicit cluster + endpoint display
- clear Raydium leg visualization for routed swaps
- explicit verification badges with reason strings and timestamps

## 8) Reliability

Mechanics:
- at-least-once event processing with idempotent writes
- dead-letter queue for decoder failures
- checkpointing by slot and stream cursor
- periodic reconciliation jobs:
  - compare tx counts across stream vs backfill
  - detect missing entity links

Observability:
- metrics: ingest lag, decode failure rate, cache hit rate, API p95/p99
- verifier metrics: queue depth, run duration, pass/fail rate by reason
- tracing across indexer -> bus -> DB -> API
- structured logs with slot/signature identifiers

## 9) Security Baseline
- strict allowlist of Raydium program IDs for decoder pipeline
- validate signer/writable flags when interpreting account roles
- sanitize and bound all search inputs and cursors
- pin dependency versions and run SCA + secret scanning in CI
- run verifier in locked-down containers with pinned toolchain hashes

## 10) Deployment
- deploy services independently (container-based)
- prefer managed Postgres + ClickHouse + Redis
- use horizontal autoscaling for `api` and `indexer-stream`
- run `verifier` with bounded worker concurrency and queue backpressure
- isolate public API from internal admin/replay endpoints
