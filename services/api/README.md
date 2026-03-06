# API Service

Read-optimized service for explorer data.

Current endpoints:
- `GET /health`
- `GET /v1/dashboard/overview`
- `GET /v1/search?q=...&limit=...`
- `GET /v1/transactions?limit=...`
- `GET /v1/programs?limit=...`
- `GET /v1/addresses?limit=...`
- `GET /v1/tx/:signature`
- `GET /v1/addresses/:address`
- `GET /v1/programs/:programId`
- `GET /v1/programs/:programId/verification?limit=20`
- `GET /v1/programs/verification-feed?window=24h`
