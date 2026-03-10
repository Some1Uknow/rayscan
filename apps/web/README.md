# Web App

Next.js App Router frontend for Rayscan.

Routes:
- `/`
- `/program/[programId]`
- `/tx/[signature]`
- `/address/[address]`
- `/search?q=...`

Environment:
- `NEXT_PUBLIC_API_URL` (required in production)
- `API_INTERNAL_URL` (optional server-only override for SSR/data fetching)
- `NEXT_PUBLIC_SITE_URL` (optional, used for metadata base URL)
- `NEXT_PUBLIC_SOLANA_CLUSTER` (optional UI label, defaults to `mainnet-beta`)
