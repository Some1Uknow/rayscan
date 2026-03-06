# Founder Presentation Plan

## 1) Positioning (one line)
Rayscan is a general-purpose Solana explorer with low-friction reads and a stronger program trust surface, designed with Raydium-first depth.

## 2) 5-Minute Demo Flow
1. Problem (20-30s)
- "Explorer usage should be fast for normal reads and high-trust for program checks."

2. Home dashboard (60s)
- Open `/` and show:
  - indexed counts (programs, tx, addresses, verification runs)
  - recent transactions, program updates, and address table links
  - verification status mix + feed
- Message: this is general explorer infrastructure, not a single-purpose tool.

3. Search workflow (45s)
- Open `/search?q=...`.
- Show typed matching (`program`, `address`, `tx`) and "Best Match".
- Message: first interaction should route users immediately to the right page.

4. Program trust workflow (90s)
- Open `/program/<programId>`.
- Show:
  - verification status
  - source commit/repo + hash evidence
  - run history
  - runtime metadata (loader, authority, upgradeability)

5. Run verification live (60-75s)
- Click "Run Verification".
- Show queued message and refreshed run row.
- Message: trust state is operational, not static.

6. Breadth proof (30-45s)
- Open `/transactions`, `/programs`, `/addresses`.
- Open `/tx/<real_mainnet_signature>` to show RPC fallback even when local index is sparse.
- Message: explorer has coherent tx/address/program surfaces.

## 3) Suggested X Reply
- "Built a working explorer MVP as a side project for general use: typed search, tx/address/program pages, and an in-product verification flow. I can share a short demo in ~2 days."

## 4) DM Package
1. One sentence
- "I focused on general explorer workflows first, then verification trust UX."

2. One screenshot
- program page with status chip + run table + verification summary.

3. One 45-90s clip
- search -> program -> run verification -> refreshed run history.

4. One feedback question
- "If I should optimize one daily workflow first (tx lookup, address lookup, or program verification), which would you pick?"

## 5) Founder Q&A Prep
- Why better than challenge-heavy flows:
  - normal reads stay uninterrupted
  - abuse handled by adaptive rate limits/caching policies
- Why this order:
  - search + tx/address/program are baseline explorer loops
  - verification is the trust differentiator
- What comes next:
  - Raydium pool/route decode depth
  - live updates (SSE)
  - richer search ranking
