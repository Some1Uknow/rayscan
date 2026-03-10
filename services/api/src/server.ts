import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import { closeDb, pool } from "./db.js";
import { env } from "./env.js";

const app = Fastify({
  logger: true,
  trustProxy: env.API_TRUST_PROXY
});

const ALLOWED_CORS_ORIGINS = new Set(
  env.API_CORS_ORIGINS
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
);

await app.register(cors, {
  origin: (origin, callback) => {
    // Allow non-browser clients and same-origin requests.
    if (!origin) return callback(null, true);
    callback(null, ALLOWED_CORS_ORIGINS.has(origin));
  }
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

app.addHook("onSend", async (_request, reply, payload) => {
  reply.header("x-content-type-options", "nosniff");
  reply.header("x-frame-options", "DENY");
  reply.header("referrer-policy", "same-origin");
  reply.header("cross-origin-resource-policy", "same-site");
  return payload;
});

app.get("/health", async () => {
  return { ok: true };
});

type RateLimitEntry = {
  windowStartedAt: number;
  count: number;
};

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const EXPENSIVE_PATH_PREFIXES = ["/v1/tokens/", "/v1/transactions/live", "/v1/network/overview", "/v1/network/trends"];

function normalizeRatePath(url: string): string {
  const path = url.split("?")[0] ?? "/";
  if (path.startsWith("/v1/tokens/")) return "/v1/tokens/:mint";
  if (path.startsWith("/v1/tx/")) return "/v1/tx/:signature";
  if (path.startsWith("/v1/addresses/")) return "/v1/addresses/:address";
  return path;
}

function isExpensivePath(path: string): boolean {
  return EXPENSIVE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function pruneRateLimitMap(now: number): void {
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.windowStartedAt >= RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(key);
    }
  }
}

app.addHook("onRequest", async (request, reply) => {
  const now = Date.now();
  if (rateLimitMap.size > 10_000) pruneRateLimitMap(now);

  const path = normalizeRatePath(request.url);
  if (path === "/health") return;
  const ip = request.ip || "unknown";
  const key = `${ip}:${path}`;
  const limit = isExpensivePath(path) ? env.API_RATE_LIMIT_EXPENSIVE_PER_MIN : env.API_RATE_LIMIT_PER_MIN;
  const existing = rateLimitMap.get(key);

  if (!existing || now - existing.windowStartedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, { windowStartedAt: now, count: 1 });
    return;
  }

  existing.count += 1;
  if (existing.count > limit) {
    return reply.code(429).send({
      error: "rate_limited",
      message: "Too many requests for this endpoint; retry in one minute"
    });
  }
});

type SearchMatch = {
  kind: "address" | "tx";
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

type RpcParsedInnerInstruction = {
  index: number;
  instructions: RpcParsedInstruction[];
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
    innerInstructions?: RpcParsedInnerInstruction[] | null;
  } | null;
  transaction: {
    message: {
      instructions: RpcParsedInstruction[];
      accountKeys: RpcAccountKey[];
    };
  };
};

type RpcAccountInfoValue = {
  executable?: unknown;
  owner?: unknown;
  lamports?: unknown;
  data?: unknown;
};

type RpcGetAccountInfoResult = {
  context: { slot: number };
  value: RpcAccountInfoValue | null;
};

type RpcTokenSupplyResult = {
  context: { slot: number };
  value: {
    amount: string;
    decimals: number;
    uiAmount: number | null;
    uiAmountString: string;
  };
};

type RpcTokenLargestAccountsResult = {
  context: { slot: number };
  value: Array<{
    address: string;
    amount: string;
    decimals: number;
    uiAmount: number | null;
    uiAmountString: string;
  }>;
};

type RpcSignatureInfo = {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
};

type RpcProgramAccountSlice = {
  pubkey: string;
  account: {
    data: [string, string] | string;
  };
};

type RuntimeAddressSummary = {
  exists: boolean;
  classification: "token_mint" | "token_account" | "program" | "system_account" | "unknown";
  ownerProgram: string | null;
  executable: boolean;
  lamports: number | null;
  tokenMint: {
    decimals: number | null;
    supplyRaw: string | null;
    supplyUi: number | null;
    mintAuthority: string | null;
    freezeAuthority: string | null;
    isInitialized: boolean | null;
  } | null;
  tokenAccount: {
    mint: string | null;
    owner: string | null;
    state: string | null;
    amountRaw: string | null;
    amountUi: number | null;
    decimals: number | null;
  } | null;
  knownToken: {
    mint: string;
    symbol: string;
    name: string;
    iconUrl: string;
  } | null;
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

type DexScreenerPair = {
  chainId?: unknown;
  priceUsd?: unknown;
  marketCap?: unknown;
  fdv?: unknown;
  priceChange?: {
    h24?: unknown;
  } | null;
  liquidity?: {
    usd?: unknown;
  } | null;
  baseToken?: {
    address?: unknown;
    symbol?: unknown;
    name?: unknown;
  } | null;
  quoteToken?: {
    address?: unknown;
    symbol?: unknown;
    name?: unknown;
  } | null;
  info?: {
    imageUrl?: unknown;
  } | null;
};

type DexScreenerTokenResult = {
  pairs?: DexScreenerPair[] | null;
};

type TopTokenConfig = {
  id: string;
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  fallbackIcon: string;
};

const TOP_TOKEN_CONFIG: TopTokenConfig[] = [
  {
    id: "solana",
    mint: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    name: "Solana",
    decimals: 9,
    fallbackIcon: "https://assets.coingecko.com/coins/images/4128/large/solana.png"
  },
  {
    id: "usd-coin",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbol: "USDC",
    name: "USDC",
    decimals: 6,
    fallbackIcon:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png"
  },
  {
    id: "tether",
    mint: "Es9vMFrzaCERz6fV3uUjzszbmWzxubAEANe1yoynZMHx",
    symbol: "USDT",
    name: "USDT",
    decimals: 6,
    fallbackIcon:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERz6fV3uUjzszbmWzxubAEANe1yoynZMHx/logo.png"
  },
  {
    id: "jupiter-exchange-solana",
    mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    symbol: "JUP",
    name: "Jupiter",
    decimals: 6,
    fallbackIcon:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN/logo.png"
  },
  {
    id: "raydium",
    mint: "4k3Dyjzvzp8eMZwS1y6TQitQxPP5f7M4M4DQh8pwJH7n",
    symbol: "RAY",
    name: "Raydium",
    decimals: 6,
    fallbackIcon:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZwS1y6TQitQxPP5f7M4M4DQh8pwJH7n/logo.png"
  },
  {
    id: "bonk",
    mint: "DezXAZ8z7PnrnRJjz3wXBoRGzz6kVZca6hJr72Y7g4s",
    symbol: "BONK",
    name: "Bonk",
    decimals: 5,
    fallbackIcon:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/DezXAZ8z7PnrnRJjz3wXBoRGzz6kVZca6hJr72Y7g4s/logo.png"
  }
];

type MemoryCacheEntry = {
  expiresAt: number;
  value: unknown;
};

const memoryCache = new Map<string, MemoryCacheEntry>();

function rpcCandidates(): string[] {
  const fallbackUrls = env.SOLANA_RPC_FALLBACK_URLS
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const ordered = [env.SOLANA_RPC_URL, ...fallbackUrls];
  return Array.from(new Set(ordered));
}

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

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const safeLimit = Math.max(1, Math.min(limit, items.length || 1));
  const out = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      out[index] = await task(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: safeLimit }, () => worker()));
  return out;
}

async function callSolanaRpcWithTimeout<T>(
  method: string,
  params: unknown[],
  timeoutMs: number
): Promise<T | null> {
  const endpoints = rpcCandidates();
  for (const endpoint of endpoints) {
    const result = await callSolanaRpcAtEndpoint<T>(endpoint, method, params, timeoutMs);
    if (result !== null) {
      return result;
    }
  }
  return null;
}

async function callSolanaRpcAtEndpoint<T>(
  endpoint: string,
  method: string,
  params: unknown[],
  timeoutMs: number
): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
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

function pruneMemoryCache(now: number): void {
  for (const [key, entry] of memoryCache) {
    if (now >= entry.expiresAt) {
      memoryCache.delete(key);
    }
  }
}

function writeCache<T>(key: string, value: T, ttlMs: number): T {
  const now = Date.now();
  if (memoryCache.size >= env.API_CACHE_MAX_ENTRIES) {
    pruneMemoryCache(now);
  }
  while (memoryCache.size >= env.API_CACHE_MAX_ENTRIES) {
    const oldest = memoryCache.keys().next().value as string | undefined;
    if (!oldest) break;
    memoryCache.delete(oldest);
  }
  memoryCache.set(key, {
    value,
    expiresAt: now + ttlMs
  });
  return value;
}

async function callSolanaRpc<T>(method: string, params: unknown[]): Promise<T | null> {
  return callSolanaRpcWithTimeout<T>(method, params, 6000);
}

function lamportsToSol(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return value / 1_000_000_000;
}

function maybeString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function maybeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function decodeU64FromBase64Slice(base64: string): string | null {
  try {
    const bytes = Buffer.from(base64, "base64");
    if (bytes.length < 8) return null;
    let value = 0n;
    for (let i = 0; i < 8; i += 1) {
      value += BigInt(bytes[i] ?? 0) << (BigInt(i) * 8n);
    }
    return value.toString();
  } catch {
    return null;
  }
}

function uiFromRaw(raw: string, decimals: number | null): number | null {
  if (decimals === null || decimals < 0) return null;
  if (!/^\d+$/.test(raw)) return null;
  try {
    const scale = 10n ** BigInt(decimals);
    const base = BigInt(raw);
    // Convert to Number only when precision is safe.
    if (base <= BigInt(Number.MAX_SAFE_INTEGER) * scale) {
      return Number(base) / Number(scale);
    }
    return null;
  } catch {
    return null;
  }
}

function uiStringFromRaw(raw: string, decimals: number | null, maxFractionDigits = 6): string | null {
  if (decimals === null || decimals < 0) return null;
  if (!/^\d+$/.test(raw)) return null;
  try {
    const value = BigInt(raw);
    const scale = 10n ** BigInt(decimals);
    const whole = value / scale;
    const fraction = value % scale;
    if (decimals === 0) return whole.toString();

    const fractionPadded = fraction.toString().padStart(decimals, "0");
    const fractionCapped = fractionPadded.slice(0, Math.max(0, maxFractionDigits));
    const fractionTrimmed = fractionCapped.replace(/0+$/, "");
    return fractionTrimmed.length > 0 ? `${whole.toString()}.${fractionTrimmed}` : whole.toString();
  } catch {
    return null;
  }
}

function selectBestDexPair(pairs: DexScreenerPair[] | null | undefined, mint: string): DexScreenerPair | null {
  if (!pairs || pairs.length === 0) return null;

  const isSolanaPair = (pair: DexScreenerPair): boolean => maybeString(pair.chainId) === "solana";
  const hasMint = (pair: DexScreenerPair): boolean => {
    const base = maybeString(pair.baseToken?.address);
    const quote = maybeString(pair.quoteToken?.address);
    return base === mint || quote === mint;
  };
  const liquidityScore = (pair: DexScreenerPair): number => maybeNumber(pair.liquidity?.usd) ?? 0;

  return pairs
    .filter((pair) => isSolanaPair(pair) && hasMint(pair))
    .sort((a, b) => liquidityScore(b) - liquidityScore(a))[0] ?? null;
}

async function fetchRuntimeAddressSummary(address: string): Promise<RuntimeAddressSummary> {
  const knownByAddress = TOP_TOKEN_CONFIG.find((token) => token.mint === address) ?? null;
  const fallback: RuntimeAddressSummary = {
    exists: Boolean(knownByAddress),
    classification: knownByAddress ? "token_mint" : "unknown",
    ownerProgram: null,
    executable: false,
    lamports: null,
    tokenMint: null,
    tokenAccount: null,
    knownToken: knownByAddress
      ? {
          mint: knownByAddress.mint,
          symbol: knownByAddress.symbol,
          name: knownByAddress.name,
          iconUrl: knownByAddress.fallbackIcon
        }
      : null
  };

  const accountInfo = await callSolanaRpcWithTimeout<RpcGetAccountInfoResult>(
    "getAccountInfo",
    [address, { encoding: "jsonParsed", commitment: "confirmed" }],
    2500
  );

  if (!accountInfo?.value) {
    return fallback;
  }

  const value = accountInfo.value;
  const ownerProgram = maybeString(value.owner);
  const lamports = maybeNumber(value.lamports);
  const executable = Boolean(value.executable);

  const parsedContainer =
    value.data && typeof value.data === "object" && !Array.isArray(value.data)
      ? (value.data as { parsed?: unknown })
      : null;
  const parsed =
    parsedContainer?.parsed && typeof parsedContainer.parsed === "object"
      ? (parsedContainer.parsed as { type?: unknown; info?: unknown })
      : null;

  const parsedType = maybeString(parsed?.type);
  const parsedInfo =
    parsed?.info && typeof parsed.info === "object" && !Array.isArray(parsed.info)
      ? (parsed.info as Record<string, unknown>)
      : null;

  if (parsedType === "mint" && parsedInfo) {
    const decimals = maybeNumber(parsedInfo.decimals);
    const supplyRaw = parsedInfo.supply === undefined || parsedInfo.supply === null ? null : String(parsedInfo.supply);
    const supplyNum = maybeNumber(parsedInfo.supply);
    const supplyUi =
      supplyNum !== null && decimals !== null && decimals >= 0 ? supplyNum / Math.pow(10, decimals) : null;

    return {
      exists: true,
      classification: "token_mint",
      ownerProgram,
      executable,
      lamports,
      tokenMint: {
        decimals,
        supplyRaw,
        supplyUi,
        mintAuthority: maybeString(parsedInfo.mintAuthority),
        freezeAuthority: maybeString(parsedInfo.freezeAuthority),
        isInitialized: typeof parsedInfo.isInitialized === "boolean" ? parsedInfo.isInitialized : null
      },
      tokenAccount: null,
      knownToken: knownByAddress
        ? {
            mint: knownByAddress.mint,
            symbol: knownByAddress.symbol,
            name: knownByAddress.name,
            iconUrl: knownByAddress.fallbackIcon
          }
        : null
    };
  }

  if (parsedType === "account" && parsedInfo) {
    const mint = maybeString(parsedInfo.mint);
    const tokenAmount =
      parsedInfo.tokenAmount && typeof parsedInfo.tokenAmount === "object" && !Array.isArray(parsedInfo.tokenAmount)
        ? (parsedInfo.tokenAmount as Record<string, unknown>)
        : null;
    const amountRaw = tokenAmount?.amount === undefined || tokenAmount?.amount === null ? null : String(tokenAmount.amount);
    const amountUi = maybeNumber(tokenAmount?.uiAmount);
    const decimals = maybeNumber(tokenAmount?.decimals);
    const knownByMint = mint ? TOP_TOKEN_CONFIG.find((token) => token.mint === mint) ?? null : null;

    return {
      exists: true,
      classification: "token_account",
      ownerProgram,
      executable,
      lamports,
      tokenMint: null,
      tokenAccount: {
        mint,
        owner: maybeString(parsedInfo.owner),
        state: maybeString(parsedInfo.state),
        amountRaw,
        amountUi,
        decimals
      },
      knownToken: knownByMint
        ? {
            mint: knownByMint.mint,
            symbol: knownByMint.symbol,
            name: knownByMint.name,
            iconUrl: knownByMint.fallbackIcon
          }
        : null
    };
  }

  return {
    exists: true,
    classification: executable ? "program" : ownerProgram === "11111111111111111111111111111111" ? "system_account" : "unknown",
    ownerProgram,
    executable,
    lamports,
    tokenMint: null,
    tokenAccount: null,
    knownToken: knownByAddress
      ? {
          mint: knownByAddress.mint,
          symbol: knownByAddress.symbol,
          name: knownByAddress.name,
          iconUrl: knownByAddress.fallbackIcon
        }
      : null
  };
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

function extractTokenTransferRows(
  tx: RpcParsedTransactionResult,
  mint: string,
  decimals: number | null
): Array<{
  index: number;
  action: string;
  amountRaw: string | null;
  amountUi: number | null;
  source: string | null;
  destination: string | null;
  authority: string | null;
}> {
  const rows: Array<{
    index: number;
    action: string;
    amountRaw: string | null;
    amountUi: number | null;
    source: string | null;
    destination: string | null;
    authority: string | null;
  }> = [];

  const orderedInstructions: RpcParsedInstruction[] = [
    ...tx.transaction.message.instructions,
    ...(tx.meta?.innerInstructions ?? [])
      .slice()
      .sort((a, b) => a.index - b.index)
      .flatMap((group) => group.instructions ?? [])
  ];

  orderedInstructions.forEach((ix, idx) => {
    if (!ix.parsed || typeof ix.parsed !== "object") return;
    const parsed = ix.parsed as { type?: unknown; info?: unknown };
    const rawType = maybeString(parsed.type);
    const info =
      parsed.info && typeof parsed.info === "object" && !Array.isArray(parsed.info)
        ? (parsed.info as Record<string, unknown>)
        : null;
    if (!rawType || !info) return;

    const type = rawType.toLowerCase();
    const accepted =
      type === "transferchecked" ||
      type === "transfer" ||
      type === "mintto" ||
      type === "minttochecked" ||
      type === "burn" ||
      type === "burnchecked";
    if (!accepted) return;

    const infoMint = maybeString(info.mint);
    if (infoMint && infoMint !== mint) return;
    if (!infoMint && type !== "transfer") return;

    const tokenAmount =
      info.tokenAmount && typeof info.tokenAmount === "object" && !Array.isArray(info.tokenAmount)
        ? (info.tokenAmount as Record<string, unknown>)
        : null;

    const amountRaw = tokenAmount?.amount
      ? String(tokenAmount.amount)
      : info.amount !== undefined && info.amount !== null
        ? String(info.amount)
        : null;

    const amountUi =
      (tokenAmount ? maybeNumber(tokenAmount.uiAmount) : maybeNumber(info.uiAmount)) ??
      (amountRaw ? uiFromRaw(amountRaw, decimals) : null);
    rows.push({
      index: idx + 1,
      action: humanizeInstructionName(rawType),
      amountRaw,
      amountUi,
      source: maybeString(info.source) ?? maybeString(info.account),
      destination: maybeString(info.destination),
      authority: maybeString(info.authority) ?? maybeString(info.owner)
    });
  });

  const deduped = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.action}:${row.amountRaw ?? "na"}:${row.source ?? "na"}:${row.destination ?? "na"}`;
    if (!deduped.has(key)) {
      deduped.set(key, row);
    }
  }

  return Array.from(deduped.values());
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
      kind: "address",
      id: exactProgram.rows[0].program_id,
      title: exactProgram.rows[0].program_id,
      subtitle: "Program account",
      href: `/address/${encodeURIComponent(exactProgram.rows[0].program_id)}`,
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
      href: `/address/${encodeURIComponent(exactAddress.rows[0].wallet_address)}`,
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
      href: `/tx/${encodeURIComponent(exactTx.rows[0].signature)}`,
      exact: true,
      confidence: 1,
      updatedAt: exactTx.rows[0].created_at
    });
  }

  const partialMatches: SearchMatch[] = [
    ...programMatches.rows.map(
      (row): SearchMatch => ({
        kind: "address",
        id: row.program_id,
        title: row.program_id,
        subtitle: "Program prefix match",
        href: `/address/${encodeURIComponent(row.program_id)}`,
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
        href: `/address/${encodeURIComponent(row.wallet_address)}`,
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
        href: `/tx/${encodeURIComponent(row.signature)}`,
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
          href: `/tx/${encodeURIComponent(query.q)}`,
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
          href: `/address/${encodeURIComponent(query.q)}`,
          exact: false,
          confidence: 0.56,
          updatedAt: null
        }
      ].slice(0, query.limit) as SearchMatch[];
    }
  }

  const byKind = {
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
  const lastGood = readCache<any>("network_overview:last_good");
  const supplyPromise = callSolanaRpcWithTimeout<RpcSupplyResult>(
    "getSupply",
    [{ commitment: "confirmed", excludeNonCirculatingAccountsList: true }],
    9000
  ).then(async (result) => {
    if (result) return result;
    return callSolanaRpcWithTimeout<RpcSupplyResult>(
      "getSupply",
      [{ commitment: "confirmed", excludeNonCirculatingAccountsList: true }],
      9000
    );
  });

  const [supply, epochInfo, slotHeight, blockHeight, txCount, perfSamples, voteAccounts, avgFeeQuery] =
    await Promise.all([
      supplyPromise,
      callSolanaRpcWithTimeout<RpcEpochInfoResult>("getEpochInfo", [{ commitment: "confirmed" }], 6000),
      callSolanaRpcWithTimeout<number>("getSlot", [{ commitment: "confirmed" }], 6000),
      callSolanaRpcWithTimeout<number>("getBlockHeight", [{ commitment: "confirmed" }], 6000),
      callSolanaRpcWithTimeout<number>("getTransactionCount", [{ commitment: "confirmed" }], 6000),
      callSolanaRpcWithTimeout<RpcPerformanceSample[]>("getRecentPerformanceSamples", [1], 6000),
      callSolanaRpcWithTimeout<RpcVoteAccountsResult>("getVoteAccounts", [{ commitment: "confirmed" }], 6000),
      pool.query(
        `
          SELECT AVG(NULLIF(fee_lamports, 0))::float8 AS avg_fee_lamports
          FROM tx_index
          WHERE COALESCE(last_status_at, created_at) >= NOW() - INTERVAL '30 minutes';
        `
      )
    ]);

  const sample = perfSamples?.[0] ?? null;
  const tps = sample && sample.samplePeriodSecs > 0 ? sample.numTransactions / sample.samplePeriodSecs : null;
  const trueTps =
    sample && sample.samplePeriodSecs > 0 && typeof sample.numNonVoteTransactions === "number"
      ? sample.numNonVoteTransactions / sample.samplePeriodSecs
      : null;

  const totalSupplyLamports = maybeNumber(supply?.value.total);
  const circulatingLamports = maybeNumber(supply?.value.circulating);
  const nonCirculatingLamports = maybeNumber(supply?.value.nonCirculating);
  const circulatingPct =
    totalSupplyLamports !== null &&
    totalSupplyLamports > 0 &&
    circulatingLamports !== null
      ? (circulatingLamports / totalSupplyLamports) * 100
      : null;
  const nonCirculatingPct =
    totalSupplyLamports !== null &&
    totalSupplyLamports > 0 &&
    nonCirculatingLamports !== null
      ? (nonCirculatingLamports / totalSupplyLamports) * 100
      : null;

  const currentStakeLamports =
    voteAccounts !== null
      ? voteAccounts.current.reduce((sum, item) => sum + (Number(item.activatedStake) || 0), 0)
      : null;
  const delinquentStakeLamports =
    voteAccounts !== null
      ? voteAccounts.delinquent.reduce((sum, item) => sum + (Number(item.activatedStake) || 0), 0)
      : null;
  const totalStakeLamports =
    currentStakeLamports !== null && delinquentStakeLamports !== null
      ? currentStakeLamports + delinquentStakeLamports
      : null;
  const currentStakePct =
    totalStakeLamports !== null &&
    totalStakeLamports > 0 &&
    currentStakeLamports !== null
      ? (currentStakeLamports / totalStakeLamports) * 100
      : null;
  const delinquentStakePct =
    totalStakeLamports !== null &&
    totalStakeLamports > 0 &&
    delinquentStakeLamports !== null
      ? (delinquentStakeLamports / totalStakeLamports) * 100
      : null;

  const avgFeeLamportsDb = maybeNumber(avgFeeQuery.rows[0]?.avg_fee_lamports);
  const avgFeeLamports =
    avgFeeLamportsDb !== null && avgFeeLamportsDb > 0
      ? avgFeeLamportsDb
      : txCount !== null
        ? 5000
        : null;

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
    cluster: env.SOLANA_CLUSTER,
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

  const mergedPayload = {
    ...payload,
    supply: {
      totalSol: payload.supply.totalSol ?? maybeNumber(lastGood?.supply?.totalSol),
      circulatingSol: payload.supply.circulatingSol ?? maybeNumber(lastGood?.supply?.circulatingSol),
      nonCirculatingSol: payload.supply.nonCirculatingSol ?? maybeNumber(lastGood?.supply?.nonCirculatingSol),
      circulatingPct: payload.supply.circulatingPct ?? maybeNumber(lastGood?.supply?.circulatingPct),
      nonCirculatingPct: payload.supply.nonCirculatingPct ?? maybeNumber(lastGood?.supply?.nonCirculatingPct)
    },
    epoch: {
      ...payload.epoch,
      epoch: payload.epoch.epoch ?? lastGood?.epoch?.epoch ?? null,
      progressPct: payload.epoch.progressPct ?? lastGood?.epoch?.progressPct ?? null,
      slotRangeStart: payload.epoch.slotRangeStart ?? lastGood?.epoch?.slotRangeStart ?? null,
      slotRangeEnd: payload.epoch.slotRangeEnd ?? lastGood?.epoch?.slotRangeEnd ?? null,
      slotIndex: payload.epoch.slotIndex ?? lastGood?.epoch?.slotIndex ?? null,
      slotsInEpoch: payload.epoch.slotsInEpoch ?? lastGood?.epoch?.slotsInEpoch ?? null,
      estimatedSecondsRemaining:
        payload.epoch.estimatedSecondsRemaining ?? lastGood?.epoch?.estimatedSecondsRemaining ?? null
    },
    network: {
      ...payload.network,
      transactionCount: payload.network.transactionCount ?? lastGood?.network?.transactionCount ?? null,
      blockHeight: payload.network.blockHeight ?? lastGood?.network?.blockHeight ?? null,
      slotHeight: payload.network.slotHeight ?? lastGood?.network?.slotHeight ?? null,
      tps: payload.network.tps ?? lastGood?.network?.tps ?? null,
      trueTps: payload.network.trueTps ?? lastGood?.network?.trueTps ?? null,
      avgFeeLamports: payload.network.avgFeeLamports ?? lastGood?.network?.avgFeeLamports ?? null
    },
    stake: {
      totalSol: payload.stake.totalSol ?? maybeNumber(lastGood?.stake?.totalSol),
      currentSol: payload.stake.currentSol ?? maybeNumber(lastGood?.stake?.currentSol),
      delinquentSol: payload.stake.delinquentSol ?? maybeNumber(lastGood?.stake?.delinquentSol),
      currentPct: payload.stake.currentPct ?? maybeNumber(lastGood?.stake?.currentPct),
      delinquentPct: payload.stake.delinquentPct ?? maybeNumber(lastGood?.stake?.delinquentPct)
    }
  };

  const hasLiveRpcData =
    supply !== null ||
    epochInfo !== null ||
    txCount !== null ||
    voteAccounts !== null ||
    (perfSamples?.length ?? 0) > 0;

  if (!hasLiveRpcData && lastGood) {
    return writeCache(
      "network_overview:v1",
      {
        ...lastGood,
        asOf: new Date().toISOString()
      },
      4000
    );
  }

  if (
    hasLiveRpcData &&
    mergedPayload.supply.totalSol !== null &&
    mergedPayload.supply.totalSol > 0 &&
    mergedPayload.network.transactionCount !== null
  ) {
    writeCache("network_overview:last_good", mergedPayload, 12 * 60 * 60 * 1000);
  }

  return writeCache("network_overview:v1", mergedPayload, 4000);
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
  const lastGood = readCache<any>(`network_trends:last_good:${query.limit}`);

  const [perfSamples, feeRows] = await Promise.all([
    callSolanaRpcWithTimeout<RpcPerformanceSample[]>("getRecentPerformanceSamples", [query.limit], 6000),
    pool.query(
      `
        SELECT
          EXTRACT(EPOCH FROM date_trunc('minute', COALESCE(last_status_at, created_at)))::bigint AS bucket_ts,
          AVG(NULLIF(fee_lamports, 0))::float8 AS avg_fee_lamports
        FROM tx_index
        WHERE COALESCE(last_status_at, created_at) >= NOW() - INTERVAL '90 minutes'
          AND fee_lamports > 0
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

  const hasTpsSignal = tps.some((point) => point.tps !== null || point.trueTps !== null);
  const hasFeeSignal = fees.length > 0;

  if (!hasTpsSignal && !hasFeeSignal && lastGood) {
    return writeCache(
      cacheKey,
      {
        ...lastGood,
        asOf: new Date().toISOString()
      },
      5000
    );
  }

  if (hasTpsSignal || hasFeeSignal) {
    writeCache(`network_trends:last_good:${query.limit}`, payload, 12 * 60 * 60 * 1000);
  }

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

app.get("/v1/tokens/:mint", async (request, reply) => {
  const params = z.object({ mint: z.string().min(32).max(64) }).parse(request.params);
  const cacheKey = `token_detail:${params.mint}`;
  const cached = readCache<Record<string, unknown>>(cacheKey);
  if (cached) return cached;
  const knownToken = TOP_TOKEN_CONFIG.find((token) => token.mint === params.mint) ?? null;

  const [runtime, supply, largestAccounts, signaturesByMint, dexScreener, coingeckoRow] = await Promise.all([
    fetchRuntimeAddressSummary(params.mint),
    callSolanaRpcWithTimeout<RpcTokenSupplyResult>("getTokenSupply", [params.mint, { commitment: "confirmed" }], 9000),
    callSolanaRpcWithTimeout<RpcTokenLargestAccountsResult>(
      "getTokenLargestAccounts",
      [params.mint, { commitment: "confirmed" }],
      11000
    ),
    callSolanaRpcWithTimeout<RpcSignatureInfo[]>(
      "getSignaturesForAddress",
      [params.mint, { limit: 16, commitment: "confirmed" }],
      4500
    ),
    fetchJsonWithTimeout<DexScreenerTokenResult>(`https://api.dexscreener.com/latest/dex/tokens/${params.mint}`, 3500),
    knownToken
      ? fetchJsonWithTimeout<CoinGeckoMarketRow[]>(
          `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(knownToken.id)}&order=market_cap_desc&per_page=1&page=1&sparkline=false&price_change_percentage=24h`,
          3000
        )
      : Promise.resolve(null)
  ]);

  if (!runtime.exists && !supply) {
    return reply.code(404).send({
      error: "not_found",
      message: `Token mint not found: ${params.mint}`
    });
  }

  const bestDexPair = selectBestDexPair(dexScreener?.pairs, params.mint);
  const marketFallback = coingeckoRow?.[0] ?? null;
  const marketPrice = maybeNumber(bestDexPair?.priceUsd) ?? marketFallback?.current_price ?? null;
  const marketCap =
    maybeNumber(bestDexPair?.marketCap) ?? maybeNumber(bestDexPair?.fdv) ?? marketFallback?.market_cap ?? null;

  const decimals = supply?.value.decimals ?? runtime.tokenMint?.decimals ?? knownToken?.decimals ?? null;
  const supplyUiEstimated =
    marketPrice && marketPrice > 0 && marketCap && marketCap > 0 ? marketCap / marketPrice : null;
  const supplyUi = supply?.value.uiAmount ?? runtime.tokenMint?.supplyUi ?? supplyUiEstimated ?? null;
  const supplyRawEstimated =
    supplyUi !== null && decimals !== null && decimals >= 0
      ? Math.round(supplyUi * Math.pow(10, decimals)).toString()
      : null;
  const supplyRaw = supply?.value.amount ?? runtime.tokenMint?.supplyRaw ?? supplyRawEstimated;
  const supplyUiString =
    supply?.value.uiAmountString ??
    (supplyRaw ? uiStringFromRaw(supplyRaw, decimals, 9) : null) ??
    (supplyUi !== null && supplyUi !== undefined ? supplyUi.toLocaleString("en-US") : null);

  const baseAddress = maybeString(bestDexPair?.baseToken?.address);
  const quoteAddress = maybeString(bestDexPair?.quoteToken?.address);
  const identityToken = baseAddress === params.mint ? bestDexPair?.baseToken : quoteAddress === params.mint ? bestDexPair?.quoteToken : null;

  const totalSupplyRawBigInt =
    supplyRaw && /^\d+$/.test(supplyRaw)
      ? (() => {
          try {
            return BigInt(supplyRaw);
          } catch {
            return null;
          }
        })()
      : null;

  let holderRows = largestAccounts?.value ?? [];

  if (holderRows.length === 0) {
    const tokenProgramId = runtime.ownerProgram ?? "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    const fallbackAccounts = await callSolanaRpcWithTimeout<RpcProgramAccountSlice[]>(
      "getProgramAccounts",
      [
        tokenProgramId,
        {
          encoding: "base64",
          commitment: "confirmed",
          filters: [
            { dataSize: 165 },
            { memcmp: { offset: 0, bytes: params.mint } }
          ],
          dataSlice: { offset: 64, length: 8 }
        }
      ],
      16000
    );

    if (fallbackAccounts && fallbackAccounts.length > 0) {
      holderRows = fallbackAccounts
        .map((row) => {
          const encoded = Array.isArray(row.account.data) ? row.account.data[0] : row.account.data;
          const amountRaw = decodeU64FromBase64Slice(encoded);
          if (!amountRaw) return null;
          const amountUi = uiFromRaw(amountRaw, decimals);
          const amountUiString = uiStringFromRaw(amountRaw, decimals, 6) ?? amountRaw;
          return {
            address: row.pubkey,
            amount: amountRaw,
            decimals: decimals ?? 0,
            uiAmount: amountUi,
            uiAmountString: amountUiString
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .sort((a, b) => {
          const ai = BigInt(a.amount);
          const bi = BigInt(b.amount);
          if (ai === bi) return 0;
          return ai > bi ? -1 : 1;
        })
        .slice(0, 20);
    }
  }

  const holders = holderRows.slice(0, 15).map((account, idx) => {
    const amountRaw = account.amount;
    const pctOfSupply =
      totalSupplyRawBigInt && totalSupplyRawBigInt > 0n && /^\d+$/.test(amountRaw)
        ? (() => {
            try {
              const holderAmount = BigInt(amountRaw);
              const bps = Number((holderAmount * 10_000n) / totalSupplyRawBigInt);
              return bps / 100;
            } catch {
              return null;
            }
          })()
        : null;

    return {
      rank: idx + 1,
      address: account.address,
      amountRaw,
      amountUi: account.uiAmount,
      amountUiString: account.uiAmountString,
      pctOfSupply
    };
  });

  const shouldProbeHolderSignatures = (signaturesByMint?.length ?? 0) < 12;
  const holderSignaturesBatches = shouldProbeHolderSignatures
    ? await Promise.all(
        holders.slice(0, 4).map((holder) =>
          callSolanaRpcWithTimeout<RpcSignatureInfo[]>(
            "getSignaturesForAddress",
            [holder.address, { limit: 8, commitment: "confirmed" }],
            4500
          )
        )
      )
    : [];

  const signatureMap = new Map<string, RpcSignatureInfo>();
  for (const row of signaturesByMint ?? []) {
    signatureMap.set(row.signature, row);
  }
  for (const batch of holderSignaturesBatches) {
    for (const row of batch ?? []) {
      if (!signatureMap.has(row.signature)) {
        signatureMap.set(row.signature, row);
      }
    }
  }

  const signatureCandidates = Array.from(signatureMap.values())
    .sort((a, b) => b.slot - a.slot)
    .slice(0, 30);

  const txRows = await mapWithConcurrency(signatureCandidates, 6, async (sig) => {
    const tx = await fetchTransactionForAction(sig.signature);
    if (!tx) return [] as Array<{
      signature: string;
      slot: number;
      blockTime: number | null;
      success: boolean;
      action: string;
      amountRaw: string | null;
      amountUi: number | null;
      source: string | null;
      destination: string | null;
      authority: string | null;
    }>;
    const transferRows = extractTokenTransferRows(tx, params.mint, decimals);
    return transferRows.map((row) => ({
      signature: sig.signature,
      slot: tx.slot,
      blockTime: tx.blockTime,
      success: tx.meta ? tx.meta.err === null : sig.err === null,
      action: row.action,
      amountRaw: row.amountRaw,
      amountUi: row.amountUi,
      source: row.source,
      destination: row.destination,
      authority: row.authority
    }));
  });

  const recentTransfers = txRows.flat().slice(0, 24);

  const payload = {
    mint: params.mint,
    runtime,
    identity: {
      symbol:
        maybeString(identityToken?.symbol) ??
        runtime.knownToken?.symbol ??
        knownToken?.symbol ??
        null,
      name:
        maybeString(identityToken?.name) ??
        runtime.knownToken?.name ??
        knownToken?.name ??
        null,
      iconUrl:
        maybeString(bestDexPair?.info?.imageUrl) ??
        runtime.knownToken?.iconUrl ??
        knownToken?.fallbackIcon ??
        null
    },
    market: {
      priceUsd: marketPrice,
      change24hPct: maybeNumber(bestDexPair?.priceChange?.h24) ?? marketFallback?.price_change_percentage_24h ?? null,
      marketCapUsd: marketCap,
      fdvUsd: maybeNumber(bestDexPair?.fdv) ?? marketFallback?.market_cap ?? null,
      source: bestDexPair ? "dexscreener" : marketFallback ? "coingecko" : "none"
    },
    supply: {
      amountRaw: supplyRaw,
      decimals,
      amountUi: supplyUi,
      amountUiString: supplyUiString
    },
    holders,
    recentTransfers
  };

  return writeCache(cacheKey, payload, 30000);
});

type LiveTransactionsPayload = {
  count: number;
  items: Array<{
    signature: string;
    slot: string | number;
    block_time: string | number | null;
    success: boolean;
    fee_lamports: string | number;
    action: string;
    source: string;
  }>;
};

async function getLiveTransactionsPayload(limit: number): Promise<LiveTransactionsPayload> {
  const cacheKey = `transactions:live:${limit}`;
  const cached = readCache<Record<string, unknown>>(cacheKey);
  if (cached) return cached as LiveTransactionsPayload;

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
    [limit]
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

  let signatures = block?.signatures?.slice(0, limit) ?? [];
  if (signatures.length === 0) {
    const fallback = await callSolanaRpc<
      Array<{
        signature: string;
      }>
    >("getSignaturesForAddress", [
      "11111111111111111111111111111111",
      {
        limit,
        commitment: "confirmed"
      }
    ]);
    signatures = fallback?.map((item) => item.signature).slice(0, limit) ?? [];
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
        success: tx.meta ? tx.meta.err === null : false,
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
}

app.get("/v1/transactions/live", async (request) => {
  const query = z
    .object({
      limit: z.coerce.number().int().min(1).max(20).default(10)
    })
    .parse(request.query);

  return getLiveTransactionsPayload(query.limit);
});

app.get("/v1/transactions/live/stream", async (request, reply) => {
  const query = z
    .object({
      limit: z.coerce.number().int().min(1).max(20).default(10),
      interval_ms: z.coerce.number().int().min(1000).max(10000).default(2000)
    })
    .parse(request.query);

  const origin = typeof request.headers.origin === "string" ? request.headers.origin : null;
  const corsOrigin = origin && ALLOWED_CORS_ORIGINS.has(origin) ? origin : null;

  reply.hijack();
  reply.raw.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
    ...(corsOrigin
      ? {
          "access-control-allow-origin": corsOrigin,
          vary: "Origin"
        }
      : {})
  });

  let closed = false;
  let lastFingerprint = "";

  const sendSnapshot = async () => {
    if (closed) return;

    try {
      const payload = await getLiveTransactionsPayload(query.limit);
      const fingerprint = payload.items
        .map((item) => `${item.signature}:${item.slot}:${item.source}:${item.success ? "1" : "0"}`)
        .join("|");

      if (fingerprint === lastFingerprint) return;
      lastFingerprint = fingerprint;
      reply.raw.write(`event: snapshot\n`);
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (error) {
      request.log.error(error, "failed to stream live transactions");
      reply.raw.write(`event: stream_error\n`);
      reply.raw.write(
        `data: ${JSON.stringify({ message: "Unable to refresh live transaction feed right now." })}\n\n`
      );
    }
  };

  reply.raw.write(`retry: ${query.interval_ms}\n\n`);

  const timer = setInterval(() => {
    void sendSnapshot();
  }, query.interval_ms);

  request.raw.on("close", () => {
    closed = true;
    clearInterval(timer);
    reply.raw.end();
  });

  await sendSnapshot();
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
    success: row ? Boolean(row.success) : parsedRpcTx?.meta ? parsedRpcTx.meta.err === null : false,
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

  const [profile, recentRuns, runtime] = await Promise.all([
    pool.query(profileQuery, [params.address]),
    pool.query(recentRunsQuery, [params.address]),
    fetchRuntimeAddressSummary(params.address)
  ]);

  return {
    address: params.address,
    profile: profile.rowCount ? profile.rows[0] : null,
    recentVerificationRuns: recentRuns.rows,
    runtime
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

await app.listen({ port: env.API_PORT, host: env.API_HOST });
