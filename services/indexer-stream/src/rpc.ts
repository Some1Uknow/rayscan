import { env, type IndexerCommitment } from "./env.js";

type RpcEnvelope<T> = {
  result?: T;
  error?: {
    code: number;
    message: string;
  };
};

type RpcTransactionAccountKey =
  | string
  | {
      pubkey?: string;
      signer?: boolean;
      writable?: boolean;
    };

export type RpcTransactionResult = {
  slot: number;
  blockTime: number | null;
  meta: {
    err: unknown | null;
    fee: number;
    computeUnitsConsumed?: number | null;
  } | null;
  transaction: {
    message: {
      accountKeys: RpcTransactionAccountKey[];
    };
  };
};

export type RpcSignatureStatusesResult = {
  context: {
    slot: number;
  };
  value: Array<{
    slot: number;
    confirmations: number | null;
    err: unknown | null;
    confirmationStatus: "processed" | "confirmed" | "finalized" | null;
  } | null>;
};

async function postRpc<T>(method: string, params: unknown[]): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.INDEXER_RPC_TIMEOUT_MS);

  try {
    const response = await fetch(env.SOLANA_RPC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `${method}-${Date.now()}`,
        method,
        params
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`RPC ${method} failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as RpcEnvelope<T>;
    if (payload.error) {
      throw new Error(`RPC ${method} error ${payload.error.code}: ${payload.error.message}`);
    }

    return payload.result ?? null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchTransaction(
  signature: string,
  commitment: IndexerCommitment
): Promise<RpcTransactionResult | null> {
  const effectiveCommitment = commitment === "processed" ? "confirmed" : commitment;
  return postRpc<RpcTransactionResult>("getTransaction", [
    signature,
    {
      encoding: "jsonParsed",
      commitment: effectiveCommitment,
      maxSupportedTransactionVersion: 0
    }
  ]);
}

export async function fetchSignatureStatuses(signatures: string[]): Promise<RpcSignatureStatusesResult | null> {
  if (signatures.length === 0) return null;
  return postRpc<RpcSignatureStatusesResult>("getSignatureStatuses", [
    signatures,
    {
      searchTransactionHistory: true
    }
  ]);
}

export function normalizeConfirmationStatus(value: string | null | undefined): IndexerCommitment {
  if (value === "finalized") return "finalized";
  if (value === "confirmed") return "confirmed";
  return "processed";
}

export function extractAccountAddresses(transaction: RpcTransactionResult): string[] {
  const keys = transaction.transaction.message.accountKeys ?? [];
  return keys
    .map((key) => {
      if (typeof key === "string") return key;
      return key.pubkey ?? null;
    })
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}
