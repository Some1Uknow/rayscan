import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import { closeDb, pool } from "./db.js";
import { env } from "./env.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true
});

app.setErrorHandler((error, request, reply) => {
  const maybeZod = error as { name?: string; issues?: unknown };
  if (error instanceof z.ZodError || maybeZod.name === "ZodError") {
    return reply.code(400).send({
      error: "invalid_request",
      message: "Invalid request parameters",
      issues: Array.isArray(maybeZod.issues) ? maybeZod.issues : []
    });
  }

  request.log.error(error);
  return reply.code(500).send({
    error: "internal_error",
    message: "Unexpected server error"
  });
});

app.get("/health", async () => {
  return { ok: true };
});

type SearchMatch = {
  kind: "program" | "address" | "tx";
  id: string;
  title: string;
  subtitle: string;
  href: string;
  exact: boolean;
  confidence: number;
  updatedAt: string | null;
};

type SolanaRpcEnvelope<T> = {
  jsonrpc: string;
  id: number;
  result?: T | null;
  error?: {
    code: number;
    message: string;
  };
};

type RpcTransactionResult = {
  slot: number;
  blockTime: number | null;
  meta: {
    err: unknown;
    fee: number;
    computeUnitsConsumed?: number | null;
  } | null;
};

type RpcSupplyResult = {
  value: {
    total: number;
    circulating: number;
    nonCirculating: number;
  };
};

type RpcEpochInfoResult = {
  epoch: number;
  slotIndex: number;
  slotsInEpoch: number;
  absoluteSlot: number;
  blockHeight: number | null;
  transactionCount?: number | null;
};

type RpcPerformanceSample = {
  numTransactions: number;
  numNonVoteTransactions?: number | null;
  samplePeriodSecs: number;
  numSlots?: number | null;
  slot: number;
};

type RpcVoteAccount = {
  activatedStake: number;
};

type RpcVoteAccountsResult = {
  current: RpcVoteAccount[];
  delinquent: RpcVoteAccount[];
};

type RpcBlockSignaturesResult = {
  blockTime: number | null;
  signatures: string[];
};

type RpcParsedInstruction = {
  program?: unknown;
  programId?: unknown;
  parsed?: unknown;
};

type RpcAccountKey =
  | string
  | {
      pubkey?: unknown;
      signer?: unknown;
      writable?: unknown;
      source?: unknown;
    };

type RpcParsedTransactionResult = {
  slot: number;
  blockTime: number | null;
  meta: {
    err: unknown;
    fee: number;
    computeUnitsConsumed?: number | null;
    logMessages?: string[] | null;
    preBalances?: number[] | null;
    postBalances?: number[] | null;
  } | null;
  transaction: {
    message: {
      instructions: RpcParsedInstruction[];
      accountKeys: RpcAccountKey[];
    };
  };
};

type CoinGeckoMarketRow = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  price_change_percentage_24h: number | null;
};

type TopTokenConfig = {
  id: string;
  mint: string;
  symbol: string;
  name: string;
  fallbackIcon: string;
};

const TOP_TOKEN_CONFIG: TopTokenConfig[] = [
  {
    id: "solana",
    mint: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    name: "Solana",
    fallbackIcon: "https://assets.coingecko.com/coins/images/4128/large/solana.png"
  },
  {
    id: "usd-coin",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbol: "USDC",
    name: "USDC",
    fallbackIcon:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png"
  },
  {
    id: "tether",
    mint: "Es9vMFrzaCERz6fV3uUjzszbmWzxubAEANe1yoynZMHx",
    symbol: "USDT",
    name: "USDT",
    fallbackIcon:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERz6fV3uUjzszbmWzxubAEANe1yoynZMHx/logo.png"
  },
  {
    id: "jupiter-exchange-solana",
    mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    symbol: "JUP",
    name: "Jupiter",
    fallbackIcon:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN/logo.png"
  },
  {
    id: "raydium",
    mint: "4k3Dyjzvzp8eMZwS1y6TQitQxPP5f7M4M4DQh8pwJH7n",
    symbol: "RAY",
    name: "Raydium",
    fallbackIcon:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZwS1y6TQitQxPP5f7M4M4DQh8pwJH7n/logo.png"
  },
  {
    id: "bonk",
    mint: "DezXAZ8z7PnrnRJjz3wXBoRGzz6kVZca6hJr72Y7g4s",
    symbol: "BONK",
    name: "Bonk",
    fallbackIcon:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/DezXAZ8z7PnrnRJjz3wXBoRGzz6kVZca6hJr72Y7g4s/logo.png"
  }
];

type MemoryCacheEntry = {
  expiresAt: number;
  value: unknown;
};

const memoryCache = new Map<string, MemoryCacheEntry>();

function dedupeMatches(matches: SearchMatch[]): SearchMatch[] {
  const seen = new Set<string>();
  const unique: SearchMatch[] = [];
  for (const match of matches) {
    const key = `${match.kind}:${match.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(match);
  }
  return unique;
}

async function callSolanaRpcWithTimeout<T>(
  method: string,
  params: unknown[],
  timeoutMs: number
): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(env.SOLANA_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params
      }),
      signal: controller.signal
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as SolanaRpcEnvelope<T>;
    if (payload.error || payload.result === null || payload.result === undefined) return null;
    return payload.result;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function readCache<T>(key: string): T | null {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return hit.value as T;
}

function writeCache<T>(key: string, value: T, ttlMs: number): T {
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
  return value;
}

async function callSolanaRpc<T>(method: string, params: unknown[]): Promise<T | null> {
  return callSolanaRpcWithTimeout<T>(method, params, 6000);
}

function lamportsToSol(value: number | null | undefined): number {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  return value / 1_000_000_000;
}

function humanizeInstructionName(raw: string): string {
  // Preserve long base58-like identifiers (program ids) as-is.
  if (raw.length >= 24 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(raw)) {
    return raw;
  }

  const withSpaces = raw
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  if (withSpaces.length === 0) return "Unknown";
  return withSpaces
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractActionLabel(tx: RpcParsedTransactionResult): string {
  const instructions = tx.transaction.message.instructions;
  for (const ix of instructions) {
    if (ix.parsed && typeof ix.parsed === "object") {
      const parsed = ix.parsed as { type?: unknown; info?: { instruction?: unknown } };
      if (typeof parsed.type === "string" && parsed.type.trim().length > 0) {
        return humanizeInstructionName(parsed.type);
      }
      if (parsed.info && typeof parsed.info.instruction === "string") {
        return humanizeInstructionName(parsed.info.instruction);
      }
    }
    const program = instructionProgram(ix);
    if (program !== "unknown") {
      return humanizeInstructionName(program);
    }
  }
  return "Unknown";
}

async function fetchTransactionForAction(signature: string): Promise<RpcParsedTransactionResult | null> {
  return callSolanaRpc<RpcParsedTransactionResult>("getTransaction", [
    signature,
    {
      encoding: "jsonParsed",
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed"
    }
  ]);
}

function parseAccountKey(
  account: RpcAccountKey,
  idx: number
): {
  address: string;
  signer: boolean;
  writable: boolean;
  index: number;
} {
  if (typeof account === "string") {
    return {
      address: account,
      signer: false,
      writable: false,
      index: idx
    };
  }

  return {
    address: typeof account.pubkey === "string" ? account.pubkey : `account_${idx}`,
    signer: Boolean(account.signer),
    writable: Boolean(account.writable),
    index: idx
  };
}

function extractInstructionType(ix: RpcParsedInstruction): string {
  if (ix.parsed && typeof ix.parsed === "object") {
    const parsed = ix.parsed as { type?: unknown; info?: { instruction?: unknown } };
    if (typeof parsed.type === "string" && parsed.type.trim().length > 0) {
      return humanizeInstructionName(parsed.type);
    }
    if (parsed.info && typeof parsed.info.instruction === "string") {
      return humanizeInstructionName(parsed.info.instruction);
    }
  }
  const program = instructionProgram(ix);
  if (program !== "unknown") return humanizeInstructionName(program);
  return "Unknown";
}

function instructionProgram(ix: RpcParsedInstruction): string {
  if (typeof ix.program === "string" && ix.program.trim().length > 0) return ix.program;
  if (typeof ix.programId === "string" && ix.programId.trim().length > 0) return ix.programId;
  if (ix.programId && typeof ix.programId === "object" && "toString" in ix.programId) {
    return String(ix.programId);
  }
  return "unknown";
}

function buildInstructionRows(tx: RpcParsedTransactionResult): Array<{
  index: number;
  program: string;
  type: string;
}> {
  return tx.transaction.message.instructions.map((ix, idx) => ({
    index: idx + 1,
    program: instructionProgram(ix),
    type: extractInstructionType(ix)
  }));
}

function buildAccountRows(tx: RpcParsedTransactionResult): Array<{
  address: string;
  signer: boolean;
  writable: boolean;
  preLamports: number | null;
  postLamports: number | null;
  deltaLamports: number | null;
}> {
  const keys = tx.transaction.message.accountKeys ?? [];
  const pre = tx.meta?.preBalances ?? [];
  const post = tx.meta?.postBalances ?? [];

  const rows = keys.map((account, idx) => {
    const normalized = parseAccountKey(account, idx);
    const preLamports = typeof pre[idx] === "number" ? pre[idx] : null;
    const postLamports = typeof post[idx] === "number" ? post[idx] : null;
    const deltaLamports =
      preLamports !== null && postLamports !== null ? postLamports - preLamports : null;

    return {
      address: normalized.address,
      signer: normalized.signer,
      writable: normalized.writable,
      preLamports,
      postLamports,
      deltaLamports
    };
  });

  return rows.sort((a, b) => Math.abs(b.deltaLamports ?? 0) - Math.abs(a.deltaLamports ?? 0));
}

app.get("/v1/search", async (request) => {
  const query = z
    .object({
      q: z.string().trim().min(2).max(128),
      limit: z.coerce.number().int().min(1).max(20).default(8)
    })
    .parse(request.query);

  const prefix = `${query.q}%`;
  const likeLimit = Math.max(1, query.limit);

  const [exactProgram, exactAddress, exactTx, programMatches, addressMatches, txMatches] =
    await Promise.all([
      pool.query(
        `
          SELECT program_id, updated_at
          FROM programs
          WHERE program_id = $1
          LIMIT 1;
        `,
        [query.q]
      ),
      pool.query(
        `
          SELECT wallet_address, updated_at
          FROM wallet_profiles
          WHERE wallet_address = $1
          LIMIT 1;
        `,
        [query.q]
      ),
      pool.query(
        `
          SELECT signature, created_at
          FROM tx_index
          WHERE signature = $1
          LIMIT 1;
        `,
        [query.q]
      ),
      pool.query(
        `
          SELECT program_id, updated_at
          FROM programs
          WHERE program_id ILIKE $1
          ORDER BY updated_at DESC
          LIMIT $2;
        `,
        [prefix, likeLimit]
      ),
      pool.query(
        `
          SELECT wallet_address, updated_at
          FROM wallet_profiles
          WHERE wallet_address ILIKE $1
          ORDER BY updated_at DESC
          LIMIT $2;
        `,
        [prefix, likeLimit]
      ),
      pool.query(
        `
          SELECT signature, created_at
          FROM tx_index
          WHERE signature ILIKE $1
          ORDER BY created_at DESC
          LIMIT $2;
        `,
        [prefix, likeLimit]
      )
    ]);

  const exactMatches: SearchMatch[] = [];
  if (exactProgram.rowCount) {
    exactMatches.push({
      kind: "program",
      id: exactProgram.rows[0].program_id,
      title: exactProgram.rows[0].program_id,
      subtitle: "Program account",
      href: `/program/${exactProgram.rows[0].program_id}`,
      exact: true,
      confidence: 0.99,
      updatedAt: exactProgram.rows[0].updated_at
    });
  }
  if (exactAddress.rowCount) {
    exactMatches.push({
      kind: "address",
      id: exactAddress.rows[0].wallet_address,
      title: exactAddress.rows[0].wallet_address,
      subtitle: "Known address profile",
      href: `/address/${exactAddress.rows[0].wallet_address}`,
      exact: true,
      confidence: 0.98,
      updatedAt: exactAddress.rows[0].updated_at
    });
  }
  if (exactTx.rowCount) {
    exactMatches.push({
      kind: "tx",
      id: exactTx.rows[0].signature,
      title: exactTx.rows[0].signature,
      subtitle: "Transaction signature",
      href: `/tx/${exactTx.rows[0].signature}`,
      exact: true,
      confidence: 1,
      updatedAt: exactTx.rows[0].created_at
    });
  }

  const partialMatches: SearchMatch[] = [
    ...programMatches.rows.map(
      (row): SearchMatch => ({
        kind: "program",
        id: row.program_id,
        title: row.program_id,
        subtitle: "Program prefix match",
        href: `/program/${row.program_id}`,
        exact: false,
        confidence: 0.79,
        updatedAt: row.updated_at
      })
    ),
    ...addressMatches.rows.map(
      (row): SearchMatch => ({
        kind: "address",
        id: row.wallet_address,
        title: row.wallet_address,
        subtitle: "Address prefix match",
        href: `/address/${row.wallet_address}`,
        exact: false,
        confidence: 0.75,
        updatedAt: row.updated_at
      })
    ),
    ...txMatches.rows.map(
      (row): SearchMatch => ({
        kind: "tx",
        id: row.signature,
        title: row.signature,
        subtitle: "Transaction prefix match",
        href: `/tx/${row.signature}`,
        exact: false,
        confidence: 0.82,
        updatedAt: row.created_at
      })
    )
  ];

  let matches = dedupeMatches([...exactMatches, ...partialMatches])
    .sort((a, b) => {
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      if (a.exact !== b.exact) return a.exact ? -1 : 1;
      const aTs = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTs = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTs - aTs;
    })
    .slice(0, query.limit);

  // If local indexed data has no hit yet, still provide explorer-style route guesses.
  if (matches.length === 0) {
    if (query.q.length >= 80) {
      matches = [
        {
          kind: "tx",
          id: query.q,
          title: query.q,
          subtitle: "Likely transaction signature",
          href: `/tx/${query.q}`,
          exact: false,
          confidence: 0.61,
          updatedAt: null
        }
      ] satisfies SearchMatch[];
    } else if (query.q.length >= 32) {
      matches = [
        {
          kind: "address",
          id: query.q,
          title: query.q,
          subtitle: "Likely address",
          href: `/address/${query.q}`,
          exact: false,
          confidence: 0.56,
          updatedAt: null
        },
        {
          kind: "program",
          id: query.q,
          title: query.q,
          subtitle: "Likely program",
          href: `/program/${query.q}`,
          exact: false,
          confidence: 0.52,
          updatedAt: null
        }
      ].slice(0, query.limit) as SearchMatch[];
    }
  }

  const byKind = {
    program: matches.filter((match) => match.kind === "program").length,
    address: matches.filter((match) => match.kind === "address").length,
    tx: matches.filter((match) => match.kind === "tx").length
  };

  return {
    query: query.q,
    bestMatch: matches[0] ?? null,
    byKind,
    count: matches.length,
    matches
  };
});

app.get("/v1/dashboard/overview", async () => {
  const [counts, statusCounts, recentTx, recentPrograms] = await Promise.all([
    pool.query(
      `
        SELECT
          (SELECT COUNT(*) FROM programs) AS programs_count,
          (SELECT COUNT(*) FROM tx_index) AS tx_count,
          (SELECT COUNT(*) FROM wallet_profiles) AS addresses_count,
          (SELECT COUNT(*) FROM verification_runs) AS verification_run_count;
      `
    ),
    pool.query(
      `
        SELECT verification_status, COUNT(*) AS total
        FROM program_verifications
        GROUP BY verification_status;
      `
    ),
    pool.query(
      `
        SELECT
          signature,
          slot,
          success,
          fee_lamports,
          compute_units,
          priority_fee_lamports,
          created_at
        FROM tx_index
        ORDER BY created_at DESC
        LIMIT 8;
      `
    ),
    pool.query(
      `
        SELECT
          p.program_id,
          p.last_seen_slot,
          p.last_upgrade_slot,
          pv.verification_status,
          pv.last_checked_at
        FROM programs p
        LEFT JOIN program_verifications pv ON pv.program_id = p.program_id
        ORDER BY COALESCE(pv.last_checked_at, p.updated_at) DESC
        LIMIT 8;
      `
    )
  ]);

  return {
    counts: counts.rows[0] ?? {
      programs_count: 0,
      tx_count: 0,
      addresses_count: 0,
      verification_run_count: 0
    },
    verificationStatusCounts: statusCounts.rows,
    recentTransactions: recentTx.rows,
    recentPrograms: recentPrograms.rows
  };
});

app.get("/v1/network/overview", async () => {
  const cached = readCache<Record<string, unknown>>("network_overview:v1");
  if (cached) return cached;

  const [supply, epochInfo, slotHeight, blockHeight, txCount, perfSamples, voteAccounts, avgFeeQuery] =
    await Promise.all([
      callSolanaRpcWithTimeout<RpcSupplyResult>("getSupply", [{ commitment: "confirmed" }], 2000),
      callSolanaRpcWithTimeout<RpcEpochInfoResult>("getEpochInfo", [{ commitment: "confirmed" }], 2000),
      callSolanaRpcWithTimeout<number>("getSlot", [{ commitment: "confirmed" }], 2000),
      callSolanaRpcWithTimeout<number>("getBlockHeight", [{ commitment: "confirmed" }], 2000),
      callSolanaRpcWithTimeout<number>("getTransactionCount", [{ commitment: "confirmed" }], 2000),
      callSolanaRpcWithTimeout<RpcPerformanceSample[]>("getRecentPerformanceSamples", [1], 2000),
      callSolanaRpcWithTimeout<RpcVoteAccountsResult>("getVoteAccounts", [{ commitment: "confirmed" }], 2000),
      pool.query(
        `
          SELECT AVG(fee_lamports)::float8 AS avg_fee_lamports
          FROM tx_index
          WHERE created_at >= NOW() - INTERVAL '30 minutes';
        `
      )
    ]);

  const sample = perfSamples?.[0] ?? null;
  const tps = sample && sample.samplePeriodSecs > 0 ? sample.numTransactions / sample.samplePeriodSecs : null;
  const trueTps =
    sample && sample.samplePeriodSecs > 0 && typeof sample.numNonVoteTransactions === "number"
      ? sample.numNonVoteTransactions / sample.samplePeriodSecs
      : null;

  const totalSupplyLamports = supply?.value.total ?? 0;
  const circulatingLamports = supply?.value.circulating ?? 0;
  const nonCirculatingLamports = supply?.value.nonCirculating ?? 0;
  const circulatingPct = totalSupplyLamports > 0 ? (circulatingLamports / totalSupplyLamports) * 100 : 0;
  const nonCirculatingPct = totalSupplyLamports > 0 ? (nonCirculatingLamports / totalSupplyLamports) * 100 : 0;

  const currentStakeLamports =
    voteAccounts?.current.reduce((sum, item) => sum + (Number(item.activatedStake) || 0), 0) ?? 0;
  const delinquentStakeLamports =
    voteAccounts?.delinquent.reduce((sum, item) => sum + (Number(item.activatedStake) || 0), 0) ?? 0;
  const totalStakeLamports = currentStakeLamports + delinquentStakeLamports;
  const currentStakePct = totalStakeLamports > 0 ? (currentStakeLamports / totalStakeLamports) * 100 : 0;
  const delinquentStakePct = totalStakeLamports > 0 ? (delinquentStakeLamports / totalStakeLamports) * 100 : 0;

  const avgFeeLamportsDb = Number(avgFeeQuery.rows[0]?.avg_fee_lamports ?? 0);
  const avgFeeLamports = avgFeeLamportsDb > 0 ? avgFeeLamportsDb : 5000;

  const slotsInEpoch = epochInfo?.slotsInEpoch ?? null;
  const slotIndex = epochInfo?.slotIndex ?? null;
  const slotRangeStart =
    epochInfo && typeof epochInfo.absoluteSlot === "number" && typeof epochInfo.slotIndex === "number"
      ? epochInfo.absoluteSlot - epochInfo.slotIndex
      : null;
  const slotRangeEnd =
    slotRangeStart !== null && slotsInEpoch !== null ? slotRangeStart + slotsInEpoch - 1 : null;
  const epochProgressPct =
    slotIndex !== null && slotsInEpoch !== null && slotsInEpoch > 0 ? (slotIndex / slotsInEpoch) * 100 : null;
  const remainingSlots =
    slotIndex !== null && slotsInEpoch !== null && slotsInEpoch >= slotIndex ? slotsInEpoch - slotIndex : null;
  const slotsPerSecond =
    sample &&
    sample.samplePeriodSecs > 0 &&
    typeof sample.numSlots === "number" &&
    sample.numSlots > 0
      ? sample.numSlots / sample.samplePeriodSecs
      : null;
  const estimatedSecondsRemaining =
    remainingSlots !== null && slotsPerSecond !== null && slotsPerSecond > 0
      ? Math.round(remainingSlots / slotsPerSecond)
      : null;

  const payload = {
    cluster: "mainnet-beta",
    asOf: new Date().toISOString(),
    supply: {
      totalSol: lamportsToSol(totalSupplyLamports),
      circulatingSol: lamportsToSol(circulatingLamports),
      nonCirculatingSol: lamportsToSol(nonCirculatingLamports),
      circulatingPct,
      nonCirculatingPct
    },
    epoch: {
      epoch: epochInfo?.epoch ?? null,
      progressPct: epochProgressPct,
      slotRangeStart,
      slotRangeEnd,
      slotIndex,
      slotsInEpoch,
      estimatedSecondsRemaining
    },
    network: {
      transactionCount: txCount ?? null,
      blockHeight: blockHeight ?? epochInfo?.blockHeight ?? null,
      slotHeight: slotHeight ?? epochInfo?.absoluteSlot ?? null,
      tps,
      trueTps,
      avgFeeLamports
    },
    stake: {
      totalSol: lamportsToSol(totalStakeLamports),
      currentSol: lamportsToSol(currentStakeLamports),
      delinquentSol: lamportsToSol(delinquentStakeLamports),
      currentPct: currentStakePct,
      delinquentPct: delinquentStakePct
    }
  };
  return writeCache("network_overview:v1", payload, 4000);
});

app.get("/v1/network/trends", async (request) => {
  const query = z
    .object({
      limit: z.coerce.number().int().min(8).max(60).default(30)
    })
    .parse(request.query);

  const cacheKey = `network_trends:${query.limit}`;
  const cached = readCache<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const [perfSamples, feeRows] = await Promise.all([
    callSolanaRpcWithTimeout<RpcPerformanceSample[]>("getRecentPerformanceSamples", [query.limit], 2500),
    pool.query(
      `
        SELECT
          EXTRACT(EPOCH FROM date_trunc('minute', created_at))::bigint AS bucket_ts,
          AVG(fee_lamports)::float8 AS avg_fee_lamports
        FROM tx_index
        WHERE created_at >= NOW() - INTERVAL '90 minutes'
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT $1;
      `,
      [query.limit]
    )
  ]);

  const tps = (perfSamples ?? [])
    .slice()
    .reverse()
    .map((sample, idx) => ({
      index: idx + 1,
      slot: sample.slot,
      tps: sample.samplePeriodSecs > 0 ? sample.numTransactions / sample.samplePeriodSecs : null,
      trueTps:
        sample.samplePeriodSecs > 0 && typeof sample.numNonVoteTransactions === "number"
          ? sample.numNonVoteTransactions / sample.samplePeriodSecs
          : null
    }));

  const fees = feeRows.rows
    .slice()
    .reverse()
    .map((row, idx) => ({
      index: idx + 1,
      bucketTs: Number(row.bucket_ts),
      avgFeeLamports:
        typeof row.avg_fee_lamports === "number" ? row.avg_fee_lamports : Number(row.avg_fee_lamports)
    }))
    .filter((row) => Number.isFinite(row.avgFeeLamports));

  const payload = {
    asOf: new Date().toISOString(),
    tps,
    fees
  };

  return writeCache(cacheKey, payload, 5000);
});

app.get("/v1/markets/tokens", async (request) => {
  const query = z
    .object({
      limit: z.coerce.number().int().min(1).max(TOP_TOKEN_CONFIG.length).default(6)
    })
    .parse(request.query);

  const cacheKey = `markets:tokens:${query.limit}`;
  const cached = readCache<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const tokenConfig = TOP_TOKEN_CONFIG.slice(0, query.limit);
  const ids = tokenConfig.map((token) => token.id).join(",");
  const url =
    "https://api.coingecko.com/api/v3/coins/markets" +
    `?vs_currency=usd&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=${query.limit}&page=1&sparkline=false&price_change_percentage=24h`;

  const marketRows = await fetchJsonWithTimeout<CoinGeckoMarketRow[]>(url, 2500);
  const byId = new Map((marketRows ?? []).map((row) => [row.id, row]));

  const items = tokenConfig.map((token) => {
    const row = byId.get(token.id);
    return {
      mint: token.mint,
      symbol: token.symbol,
      name: token.name,
      iconUrl: row?.image ?? token.fallbackIcon,
      priceUsd: typeof row?.current_price === "number" ? row.current_price : null,
      marketCapUsd: typeof row?.market_cap === "number" ? row.market_cap : null,
      change24hPct:
        typeof row?.price_change_percentage_24h === "number"
          ? row.price_change_percentage_24h
          : null
    };
  });

  const payload = {
    source: marketRows ? "coingecko" : "fallback",
    count: items.length,
    items
  };

  return writeCache(cacheKey, payload, 60000);
});

app.get("/v1/transactions/live", async (request) => {
  const query = z
    .object({
      limit: z.coerce.number().int().min(1).max(20).default(10)
    })
    .parse(request.query);

  const cacheKey = `transactions:live:${query.limit}`;
  const cached = readCache<Record<string, unknown>>(cacheKey);
  if (cached) return cached;

  const local = await pool.query(
    `
      SELECT
        signature,
        slot,
        block_time,
        success,
        fee_lamports,
        source,
        created_at
      FROM tx_index
      ORDER BY slot DESC, created_at DESC
      LIMIT $1;
    `,
    [query.limit]
  );

  if ((local.rowCount ?? local.rows.length) > 0) {
    const items = await Promise.all(
      local.rows.map(async (row) => {
        const parsedTx = await fetchTransactionForAction(row.signature);
        return {
          signature: row.signature as string,
          slot: row.slot as number | string,
          block_time: row.block_time as number | string | null,
          success: Boolean(row.success),
          fee_lamports: row.fee_lamports as number | string,
          action: parsedTx ? extractActionLabel(parsedTx) : "Indexed Transaction",
          source: row.source as string
        };
      })
    );

    const payload = {
      count: items.length,
      items
    };
    return writeCache(cacheKey, payload, 2000);
  }

  const latestSlot = await callSolanaRpc<number>("getSlot", [{ commitment: "confirmed" }]);
  const block =
    latestSlot !== null
      ? await callSolanaRpc<RpcBlockSignaturesResult>("getBlock", [
          latestSlot,
          {
            encoding: "json",
            transactionDetails: "signatures",
            rewards: false,
            maxSupportedTransactionVersion: 0
          }
        ])
      : null;

  let signatures = block?.signatures?.slice(0, query.limit) ?? [];
  if (signatures.length === 0) {
    const fallback = await callSolanaRpc<
      Array<{
        signature: string;
      }>
    >("getSignaturesForAddress", [
      "11111111111111111111111111111111",
      {
        limit: query.limit,
        commitment: "confirmed"
      }
    ]);
    signatures = fallback?.map((item) => item.signature).slice(0, query.limit) ?? [];
  }

  if (signatures.length === 0) {
    return {
      count: 0,
      items: []
    };
  }

  const txResults = await Promise.all(
    signatures.map(async (signature) => {
      const tx = await fetchTransactionForAction(signature);
      if (!tx) return null;
      return {
        signature,
        slot: tx.slot,
        block_time: tx.blockTime,
        success: tx.meta ? tx.meta.err === null : true,
        fee_lamports: tx.meta?.fee ?? 0,
        action: extractActionLabel(tx),
        source: "rpc_live"
      };
    })
  );

  const items = txResults.filter((item): item is NonNullable<typeof item> => item !== null);
  const payload = {
    count: items.length,
    items
  };
  return writeCache(cacheKey, payload, 2000);
});

app.get("/v1/transactions", async (request) => {
  const query = z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(20)
    })
    .parse(request.query);

  const result = await pool.query(
    `
      SELECT
        signature,
        slot,
        block_time,
        success,
        fee_lamports,
        compute_units,
        priority_fee_lamports,
        source,
        created_at
      FROM tx_index
      ORDER BY slot DESC, created_at DESC
      LIMIT $1;
    `,
    [query.limit]
  );

  return {
    count: result.rowCount,
    items: result.rows
  };
});

app.get("/v1/addresses", async (request) => {
  const query = z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(20)
    })
    .parse(request.query);

  const result = await pool.query(
    `
      SELECT
        w.wallet_address,
        w.first_seen_slot,
        w.last_seen_slot,
        w.updated_at,
        COALESCE(v.run_count, 0) AS verifier_run_count
      FROM wallet_profiles w
      LEFT JOIN (
        SELECT program_id, COUNT(*) AS run_count
        FROM verification_runs
        GROUP BY program_id
      ) v ON v.program_id = w.wallet_address
      ORDER BY w.last_seen_slot DESC NULLS LAST, w.updated_at DESC
      LIMIT $1;
    `,
    [query.limit]
  );

  return {
    count: result.rowCount,
    items: result.rows
  };
});

app.get("/v1/programs", async (request) => {
  const query = z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(20)
    })
    .parse(request.query);

  const result = await pool.query(
    `
      SELECT
        p.program_id,
        p.last_seen_slot,
        p.last_upgrade_slot,
        p.is_upgradeable,
        pv.verification_status,
        pv.last_checked_at,
        pv.source_repo_url
      FROM programs p
      LEFT JOIN program_verifications pv ON pv.program_id = p.program_id
      ORDER BY p.last_seen_slot DESC NULLS LAST, p.updated_at DESC
      LIMIT $1;
    `,
    [query.limit]
  );

  return {
    count: result.rowCount,
    items: result.rows
  };
});

app.get("/v1/tx/:signature", async (request, reply) => {
  const params = z.object({ signature: z.string().min(64).max(128) }).parse(request.params);
  const query = `
    SELECT
      signature,
      slot,
      block_time,
      success,
      fee_lamports,
      compute_units,
      priority_fee_lamports,
      source,
      created_at
    FROM tx_index
    WHERE signature = $1
    LIMIT 1;
  `;
  const [result, parsedRpcTx] = await Promise.all([
    pool.query(query, [params.signature]),
    fetchTransactionForAction(params.signature)
  ]);
  const hasLocalRow = (result.rowCount ?? result.rows.length) > 0;

  if (!hasLocalRow && !parsedRpcTx) {
    return reply.code(404).send({
      error: "not_found",
      message: `Transaction not found in local index or RPC: ${params.signature}`
    });
  }

  const row = hasLocalRow ? result.rows[0] : null;
  const accountRows = parsedRpcTx ? buildAccountRows(parsedRpcTx) : [];
  const changedAccounts = accountRows.filter((account) => (account.deltaLamports ?? 0) !== 0);
  const signerAddresses = accountRows.filter((account) => account.signer).map((account) => account.address);
  const instructionRows = parsedRpcTx ? buildInstructionRows(parsedRpcTx) : [];
  const logMessages = parsedRpcTx?.meta?.logMessages ?? [];

  return {
    signature: row?.signature ?? params.signature,
    slot: row?.slot ?? parsedRpcTx?.slot ?? null,
    blockTime: row?.block_time ?? parsedRpcTx?.blockTime ?? null,
    success: row ? Boolean(row.success) : parsedRpcTx ? parsedRpcTx.meta?.err === null : true,
    feeLamports: row?.fee_lamports ?? parsedRpcTx?.meta?.fee ?? 0,
    computeUnits: row?.compute_units ?? parsedRpcTx?.meta?.computeUnitsConsumed ?? null,
    priorityFeeLamports: row?.priority_fee_lamports ?? null,
    source: row?.source ?? "rpc_fallback",
    indexedAt: row?.created_at ?? new Date().toISOString(),
    action: parsedRpcTx ? extractActionLabel(parsedRpcTx) : "Unknown",
    instructionCount: instructionRows.length,
    signerCount: signerAddresses.length,
    signers: signerAddresses,
    instructions: instructionRows,
    accountChanges: accountRows.slice(0, 24),
    logMessages: logMessages.slice(0, 120),
    balanceSummary: {
      totalAccounts: accountRows.length,
      changedAccounts: changedAccounts.length
    }
  };
});

app.get("/v1/addresses/:address", async (request) => {
  const params = z.object({ address: z.string().min(32).max(64) }).parse(request.params);

  const profileQuery = `
    SELECT
      wallet_address,
      first_seen_slot,
      last_seen_slot,
      updated_at
    FROM wallet_profiles
    WHERE wallet_address = $1
    LIMIT 1;
  `;

  const recentRunsQuery = `
    SELECT
      run_id,
      run_status,
      created_at
    FROM verification_runs
    WHERE program_id = $1
    ORDER BY created_at DESC
    LIMIT 5;
  `;

  const [profile, recentRuns] = await Promise.all([
    pool.query(profileQuery, [params.address]),
    pool.query(recentRunsQuery, [params.address])
  ]);

  return {
    address: params.address,
    profile: profile.rowCount ? profile.rows[0] : null,
    recentVerificationRuns: recentRuns.rows
  };
});

app.get("/v1/programs/verification-feed", async (request) => {
  const windowRaw = z.string().default("24h").parse((request.query as Record<string, unknown> | undefined)?.window);
  const windowToHours: Record<string, number> = {
    "1h": 1,
    "24h": 24,
    "7d": 168
  };
  const hours = windowToHours[windowRaw] ?? 24;

  const query = `
    SELECT
      pv.program_id,
      pv.verification_status,
      pv.source_repo_url,
      pv.source_commit,
      pv.last_checked_at,
      p.last_upgrade_slot
    FROM program_verifications pv
    JOIN programs p ON p.program_id = pv.program_id
    WHERE pv.last_checked_at >= NOW() - ($1::text || ' hours')::interval
    ORDER BY pv.last_checked_at DESC
    LIMIT 200;
  `;

  const result = await pool.query(query, [String(hours)]);
  return {
    window: windowRaw,
    count: result.rowCount,
    items: result.rows
  };
});

app.get("/v1/programs/:programId", async (request, reply) => {
  const params = z.object({ programId: z.string().min(32).max(64) }).parse(request.params);

  const query = `
    SELECT
      p.program_id,
      p.loader_program_id,
      p.programdata_address,
      p.upgrade_authority,
      p.is_upgradeable,
      p.deploy_slot,
      p.last_upgrade_slot,
      p.last_seen_slot,
      pv.verification_status,
      pv.last_checked_at,
      pv.source_repo_url,
      pv.source_commit,
      pv.diff_summary
    FROM programs p
    LEFT JOIN program_verifications pv ON pv.program_id = p.program_id
    WHERE p.program_id = $1
    LIMIT 1;
  `;

  const result = await pool.query(query, [params.programId]);
  if (result.rowCount === 0) {
    return reply.code(404).send({
      error: "not_found",
      message: `Program not found: ${params.programId}`
    });
  }

  const row = result.rows[0];
  return {
    programId: row.program_id,
    loaderProgramId: row.loader_program_id,
    programdataAddress: row.programdata_address,
    upgradeAuthority: row.upgrade_authority,
    isUpgradeable: row.is_upgradeable,
    deploySlot: row.deploy_slot,
    lastUpgradeSlot: row.last_upgrade_slot,
    lastSeenSlot: row.last_seen_slot,
    verification: {
      status: row.verification_status ?? "unverified",
      checkedAt: row.last_checked_at,
      sourceRepoUrl: row.source_repo_url,
      sourceCommit: row.source_commit,
      diffSummary: row.diff_summary
    }
  };
});

app.get("/v1/programs/:programId/verification", async (request, reply) => {
  const params = z.object({ programId: z.string().min(32).max(64) }).parse(request.params);
  const limit = z.coerce.number().int().min(1).max(100).default(20).parse((request.query as Record<string, unknown> | undefined)?.limit);

  const summaryQuery = `
    SELECT
      pv.program_id,
      pv.verification_status,
      pv.source_repo_url,
      pv.source_commit,
      pv.source_subdir,
      pv.build_image,
      pv.verifier_version,
      pv.expected_program_hash,
      pv.onchain_program_hash,
      pv.diff_summary,
      pv.verified_at,
      pv.last_checked_at
    FROM program_verifications pv
    WHERE pv.program_id = $1
    LIMIT 1;
  `;

  const runsQuery = `
    SELECT
      run_id,
      triggered_by,
      run_status,
      queue_latency_ms,
      duration_ms,
      started_at,
      finished_at,
      error_code,
      error_message,
      created_at
    FROM verification_runs
    WHERE program_id = $1
    ORDER BY created_at DESC
    LIMIT $2;
  `;

  const [summary, runs] = await Promise.all([
    pool.query(summaryQuery, [params.programId]),
    pool.query(runsQuery, [params.programId, limit])
  ]);

  if (summary.rowCount === 0 && runs.rowCount === 0) {
    return reply.code(404).send({
      error: "not_found",
      message: `Verification data not found: ${params.programId}`
    });
  }

  return {
    programId: params.programId,
    summary: summary.rowCount ? summary.rows[0] : null,
    runs: runs.rows
  };
});

const shutdown = async () => {
  await app.close();
  await closeDb();
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
