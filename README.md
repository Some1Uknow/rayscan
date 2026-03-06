# Rayscan

General-purpose Solana explorer blueprint with Raydium-first depth, optimized for:
- fast reads
- real-time Raydium decoding
- low-friction anti-bot controls (no blanket human challenge)

## Stack
- Frontend: Next.js + `@solana/client` + `@solana/react-hooks`
- Solana SDK: `@solana/kit` (with `@solana/web3-compat` only at boundaries)
- Ingestion: Yellowstone gRPC + RPC backfill
- Data: ClickHouse + Postgres + Redis
- API: REST + GraphQL + SSE

## Monorepo Layout
- `apps/web`: Raydium-themed explorer UI
- `services/indexer-stream`: real-time slot/block/account ingestion
- `services/indexer-backfill`: replay and gap healing
- `services/api`: query layer for UI/public API
- `services/verifier`: reproducible program verification worker
- `services/search-sync`: sync entities into search index
- `packages/decoders-raydium`: instruction/event decoders
- `packages/db`: data access models and migrations
- `packages/shared`: shared types and helpers
- `schemas/`: starter SQL for Postgres and ClickHouse
- `ops/`: local infra compose and ops templates
- `docs/`: architecture and 14-day build plan
- `docs/verifier-spec.md`: detailed verification pipeline spec

## Quick Start (Blueprint Mode)
1. Read [docs/repo-blueprint.md](/Users/raghavsharma/Documents/rayscan/docs/repo-blueprint.md).
2. Read [docs/architecture.md](/Users/raghavsharma/Documents/rayscan/docs/architecture.md).
3. Install dependencies with `pnpm install`.
4. Run local infra from [ops/docker-compose.local.yml](/Users/raghavsharma/Documents/rayscan/ops/docker-compose.local.yml).
5. Initialize schema with `pnpm db:init:pg` and `pnpm db:init:ch`.

## Dev Commands
- `pnpm api:dev`
- `pnpm web:dev`
- `pnpm verifier:dev`
