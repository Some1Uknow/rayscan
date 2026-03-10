# Rayscan

Rayscan is a search-first Solana explorer built for fast reads, live transaction visibility, and clean detail pages. It is themed for Raydium, but designed as a general-purpose explorer.

## What It Does
- Search signatures, addresses, token mints, and token accounts
- Inspect transactions with status, balance changes, accounts, and program logs
- View token pages with metadata, market data, and logos when available
- Stream the latest transactions with a live pause/resume feed
- Surface core network stats such as TPS, supply, fee trends, and top tokens

## Stack
- Next.js frontend
- Fastify API
- Helius / Solana RPC + WebSocket ingestion
- Postgres for indexed explorer data
- Docker for local infrastructure

## Local Development
1. Copy envs: `cp .env.example .env`
2. Set at minimum:
   - `SOLANA_RPC_URL`
   - `SOLANA_WS_URL`
   - `POSTGRES_URL`
3. Install dependencies: `pnpm install`
4. Start the full app: `pnpm dev:all`

Open `http://127.0.0.1:3000`

To stop everything:

```bash
pnpm dev:stop
```

Logs are written to:
- `.run/web.log`
- `.run/api.log`
- `.run/indexer.log`

## Services
- `apps/web` - explorer UI
- `services/api` - HTTP query layer for the UI
- `services/indexer-stream` - live Solana ingestion into Postgres

## Production
Deploy the services separately:
- `apps/web` -> Vercel
- `services/api` -> long-running server/container
- `services/indexer-stream` -> long-running worker/container

This split is intentional. The API serves reads. The indexer keeps a persistent WebSocket connection and continuously writes fresh chain data into Postgres.

## Required Environment Variables

Web:
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SOLANA_CLUSTER`

API:
- `POSTGRES_URL`
- `SOLANA_RPC_URL`
- `SOLANA_CLUSTER`
- `API_CORS_ORIGINS`

Indexer:
- `POSTGRES_URL`
- `SOLANA_RPC_URL`
- `SOLANA_WS_URL`
- `INDEXER_ENABLED`

Additional defaults and optional settings are documented in [.env.example](/Users/raghavsharma/Documents/rayscan/.env.example).
