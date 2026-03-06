# 14-Day Build Plan

## Day 1-2: Foundation
- scaffold monorepo (`apps`, `services`, `packages`)
- stand up local infra (Postgres, ClickHouse, Redis)
- create shared config and telemetry package
- define Raydium program ID config source

Exit criteria:
- services boot locally with health checks.

## Day 3-4: Stream Ingestion
- wire Yellowstone subscription in `indexer-stream`
- capture finalized slots and Raydium tx candidates
- persist raw tx envelope in Postgres
- implement slot checkpointing

Exit criteria:
- live stream dashboard shows ingest lag and slot progress.

## Day 5-6: Raydium Decode
- implement decoder pipeline for first Raydium swap path
- emit normalized `raydium.swap.executed`
- write to ClickHouse `fact_swaps`
- add decoder fixture tests

Exit criteria:
- sample signatures decode correctly and appear in DB.

## Day 7-8: API + UI v1
- ship `GET /v1/tx/:signature`
- ship `/tx/[signature]` page
- ship `/live` page using SSE
- add query caching for live feed endpoint

Exit criteria:
- transaction detail and live feed demoable.

## Day 9-10: Pools
- materialize pool aggregates (5m, 1h, 24h)
- ship `GET /v1/pools/:poolAddress`
- ship `/pool/[address]`
- add search indexing for pools and mints

Exit criteria:
- pool page shows live swaps and rolling stats.

## Day 11-12: Wallets
- implement wallet activity projection
- ship `GET /v1/wallets/:address/activity`
- ship `/wallet/[address]`
- add pagination and cursor integrity checks

Exit criteria:
- wallet page shows Raydium timeline with tx links.

## Day 13: Anti-Bot and Hardening
- configure adaptive rate limits per route class
- add GraphQL complexity and response row caps
- implement degraded mode (stale cache fallback)
- add abusive-pattern challenge only for flagged flows

Exit criteria:
- read routes remain challenge-free under normal traffic.

## Day 14: Launch Packet
- benchmark report: ingest lag, API p95, error rates
- polish Raydium-themed visual identity
- publish demo and architecture write-up
- prepare short founder-facing product note

Exit criteria:
- public demo URL + metric snapshots + repo README quality.

## Verification Track (Parallel, Days 5-14)

### Day 5-6: Program Metadata
- index executable/upgradeable programs seen in traffic
- persist program loader, authority, deploy/upgrade slots
- ship `GET /v1/programs/:programId`

Exit criteria:
- program page can load metadata for known program IDs.

### Day 7-8: Verifier Worker
- scaffold `services/verifier` with queue-backed runs
- execute reproducible verification jobs through `solana-verify`
- persist run history and status transitions

Exit criteria:
- one manual verification run succeeds end-to-end.

### Day 9-10: Verification API + UI
- ship `GET /v1/programs/:programId/verification`
- render program verification badges and details in UI
- add run logs summary and latest checked timestamp

Exit criteria:
- program page shows current verification status and evidence.

### Day 11-12: Verification Feed
- ship `GET /v1/programs/verification-feed?window=24h`
- include "newly verified", "recent upgrade now stale", and "failed verification"
- add sorting/filtering for high-interaction programs

Exit criteria:
- feed is updated automatically from verifier completion events.

### Day 13-14: Reliability and Story
- add verifier queue depth + pass/fail reason dashboards
- add rerun policies for transient failures
- write "why this is better than challenge-heavy explorer UX" demo script

Exit criteria:
- founder-ready demo with live verification proof path.
