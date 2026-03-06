# Repo Blueprint

## Directory Tree

```text
rayscan/
  apps/
    web/
      src/
        app/
          tx/[signature]/page.tsx
          pool/[address]/page.tsx
          wallet/[address]/page.tsx
          live/page.tsx
  services/
    indexer-stream/
      src/
        stream/
        decode/
        sink/
    indexer-backfill/
      src/
        replay/
        repair/
    api/
      src/
        rest/
        graphql/
        sse/
        cache/
        auth/
    verifier/
      src/
        discover/
        queue/
        runners/
        parser/
        publish/
    search-sync/
      src/
  packages/
    decoders-raydium/
      src/
        programs/
        events/
        normalize/
    db/
      src/
        postgres/
        clickhouse/
    shared/
      src/
        types/
        config/
        telemetry/
  schemas/
    postgres/001_init.sql
    clickhouse/001_init.sql
  ops/
    docker-compose.local.yml
  docs/
    architecture.md
    repo-blueprint.md
```

## Ownership Map

- `apps/web`: user-facing UX, branding, route composition.
- `services/indexer-stream`: real-time ingest and decode.
- `services/indexer-backfill`: replay, repair, and consistency.
- `services/api`: all client-facing data contracts.
- `services/verifier`: program metadata refresh and verification execution.
- `services/search-sync`: search index freshness.
- `packages/decoders-raydium`: core decoder logic and test vectors.
- `packages/db`: shared DB adapters + query helpers.

## Service Contracts

### Event Bus Contract

Topic names:

- `slot.finalized`
- `raydium.swap.executed`
- `raydium.pool.updated`
- `wallet.activity.detected`
- `program.discovered`
- `program.upgraded`
- `program.verification.completed`

Event envelope:

```json
{
  "eventId": "uuid",
  "eventType": "raydium.swap.executed",
  "slot": 123456789,
  "signature": "5abc...",
  "blockTime": 1730000000,
  "producer": "indexer-stream",
  "payload": {}
}
```

Idempotency key:

- `eventType + slot + signature + ixIndex`

Verification run key:

- `programId + sourceCommit + toolchainDigest`

### API Contract Principles

- always cursor-pagination for list endpoints
- stable field names across REST and GraphQL
- include `sourceSlot` and `source` metadata in all responses
- include `verificationCheckedAt` and `verificationSource` for program endpoints

## Versioning Rules

- external API: semantic versioning (`/v1`)
- event payloads: additive changes only in same version
- decoder outputs: snapshot tests per Raydium program type

## Testing Matrix

- unit: decoder parser fixtures
- unit: verifier log parser fixtures
- contract: REST/GraphQL schema contract tests
- integration: ingestion -> DB -> API end-to-end
- integration: verifier queue -> run -> status publish
- load: top endpoints and search with realistic QPS

## Suggested First Milestones

1. Implement `raydium.swap.executed` pipeline end-to-end.
2. Ship `/tx/[signature]` + `/live` page.
3. Add pool detail route with 24h aggregates.
4. Add anti-bot policy and caching layer.
5. Ship `/program/[programId]` with verification state and run history.
