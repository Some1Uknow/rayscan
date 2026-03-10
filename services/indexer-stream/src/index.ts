import { closeDb, upsertTxObservation, upsertWalletProfiles } from "./db.js";
import { env, type IndexerCommitment } from "./env.js";
import {
  extractAccountAddresses,
  fetchSignatureStatuses,
  fetchTransaction,
  normalizeConfirmationStatus
} from "./rpc.js";

type LogsNotification = {
  method: "logsNotification";
  params: {
    result: {
      context: {
        slot: number;
      };
      value: {
        signature: string;
        err: unknown | null;
        logs: string[];
      };
    };
  };
};

type SlotNotification = {
  method: "slotNotification";
  params: {
    result: {
      parent: number;
      root: number;
      slot: number;
    };
  };
};

type SubscriptionAck = {
  id: number;
  result: number;
};

type PendingSignature = {
  signature: string;
  slot: number;
  commitment: IndexerCommitment;
  success: boolean;
  needsEnrichment: boolean;
  detailsAttempts: number;
  firstSeenAt: number;
  nextCheckAt: number;
};

const MAX_ENRICH_CONCURRENCY = 4;
const MAX_DETAILS_ATTEMPTS = 6;
const STALE_PENDING_MS = 15 * 60 * 1000;

const pending = new Map<string, PendingSignature>();
const queuedEnrichment = new Set<string>();
const activeEnrichment = new Set<string>();
let websocket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let drainTimer: ReturnType<typeof setInterval> | null = null;
let shuttingDown = false;
let latestObservedSlot: number | null = null;
let pollInFlight = false;

function sanitizeEndpoint(value: string): string {
  try {
    const url = new URL(value);
    if (url.search) {
      url.search = "?redacted";
    }
    return url.toString();
  } catch {
    return "[redacted-endpoint]";
  }
}

function commitmentRank(value: IndexerCommitment): number {
  switch (value) {
    case "finalized":
      return 3;
    case "confirmed":
      return 2;
    default:
      return 1;
  }
}

function mergeCommitment(current: IndexerCommitment, next: IndexerCommitment): IndexerCommitment {
  return commitmentRank(next) >= commitmentRank(current) ? next : current;
}

function queueForEnrichment(signature: string): void {
  if (queuedEnrichment.has(signature) || activeEnrichment.has(signature)) return;
  if (!pending.has(signature)) return;
  queuedEnrichment.add(signature);
}

async function enrichSignature(signature: string): Promise<void> {
  const current = pending.get(signature);
  if (!current) return;

  current.detailsAttempts += 1;
  const transaction = await fetchTransaction(signature, current.commitment).catch((error: unknown) => {
    console.error(`[indexer-stream] getTransaction failed for ${signature}:`, error);
    return null;
  });

  if (!transaction) {
    if (current.detailsAttempts >= MAX_DETAILS_ATTEMPTS && current.commitment === "finalized") {
      pending.delete(signature);
    }
    return;
  }

  await upsertTxObservation({
    signature,
    slot: transaction.slot,
    blockTime: transaction.blockTime,
    success: transaction.meta ? transaction.meta.err === null : current.success,
    feeLamports: transaction.meta?.fee ?? null,
    computeUnits: transaction.meta?.computeUnitsConsumed ?? null,
    priorityFeeLamports: null,
    commitment: current.commitment,
    observedSlot: latestObservedSlot ?? transaction.slot,
    source: "ws_live"
  });

  const addresses = extractAccountAddresses(transaction);
  await upsertWalletProfiles(addresses, transaction.slot);

  current.slot = transaction.slot;
  current.needsEnrichment = false;

  if (current.commitment === "finalized") {
    pending.delete(signature);
  }
}

async function drainEnrichmentQueue(): Promise<void> {
  if (queuedEnrichment.size === 0) return;

  for (const signature of [...queuedEnrichment]) {
    if (activeEnrichment.size >= MAX_ENRICH_CONCURRENCY) break;
    queuedEnrichment.delete(signature);
    activeEnrichment.add(signature);

    void enrichSignature(signature)
      .catch((error: unknown) => {
        console.error(`[indexer-stream] enrichment failed for ${signature}:`, error);
      })
      .finally(() => {
        activeEnrichment.delete(signature);
      });
  }
}

async function handleLogsNotification(message: LogsNotification): Promise<void> {
  const slot = message.params.result.context.slot;
  const { signature, err } = message.params.result.value;
  latestObservedSlot = Math.max(latestObservedSlot ?? 0, slot);

  const current = pending.get(signature);
  const commitment = current ? mergeCommitment(current.commitment, env.INDEXER_COMMITMENT) : env.INDEXER_COMMITMENT;
  const success = err === null;

  await upsertTxObservation({
    signature,
    slot,
    blockTime: null,
    success,
    feeLamports: null,
    computeUnits: null,
    priorityFeeLamports: null,
    commitment,
    observedSlot: slot,
    source: "ws_logs"
  });

  pending.set(signature, {
    signature,
    slot,
    commitment,
    success,
    needsEnrichment: true,
    detailsAttempts: current?.detailsAttempts ?? 0,
    firstSeenAt: current?.firstSeenAt ?? Date.now(),
    nextCheckAt: Date.now()
  });

  queueForEnrichment(signature);
}

function handleSlotNotification(message: SlotNotification): void {
  latestObservedSlot = Math.max(latestObservedSlot ?? 0, message.params.result.slot);
}

async function pollPendingSignatures(): Promise<void> {
  if (pollInFlight || pending.size === 0) return;
  pollInFlight = true;

  try {
    const now = Date.now();
    const due = [...pending.values()]
      .filter((entry) => entry.nextCheckAt <= now)
      .sort((a, b) => a.firstSeenAt - b.firstSeenAt)
      .slice(0, env.INDEXER_PENDING_BATCH_LIMIT);

    if (due.length === 0) return;

    const statusResult = await fetchSignatureStatuses(due.map((entry) => entry.signature)).catch((error: unknown) => {
      console.error("[indexer-stream] getSignatureStatuses failed:", error);
      return null;
    });

    const statuses = statusResult?.value ?? [];
    const contextSlot = statusResult?.context.slot ?? latestObservedSlot ?? null;

    for (let index = 0; index < due.length; index += 1) {
      const entry = pending.get(due[index].signature);
      if (!entry) continue;

      const status = statuses[index];
      if (!status) {
        if (now - entry.firstSeenAt > STALE_PENDING_MS) {
          pending.delete(entry.signature);
          continue;
        }
        entry.nextCheckAt = now + env.INDEXER_PENDING_RECHECK_MS;
        continue;
      }

      entry.slot = Math.max(entry.slot, status.slot ?? entry.slot);
      entry.success = status.err === null;
      entry.commitment = mergeCommitment(entry.commitment, normalizeConfirmationStatus(status.confirmationStatus));

      await upsertTxObservation({
        signature: entry.signature,
        slot: entry.slot,
        blockTime: null,
        success: entry.success,
        feeLamports: null,
        computeUnits: null,
        priorityFeeLamports: null,
        commitment: entry.commitment,
        observedSlot: contextSlot ?? entry.slot,
        source: "ws_status"
      });

      if (entry.needsEnrichment && entry.detailsAttempts < MAX_DETAILS_ATTEMPTS) {
        queueForEnrichment(entry.signature);
      }

      if (
        entry.commitment === "finalized" &&
        (!entry.needsEnrichment || entry.detailsAttempts >= MAX_DETAILS_ATTEMPTS)
      ) {
        pending.delete(entry.signature);
        continue;
      }

      entry.nextCheckAt = now + env.INDEXER_PENDING_RECHECK_MS;
    }
  } finally {
    pollInFlight = false;
  }
}

function subscribe(ws: WebSocket): void {
  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "slotSubscribe",
      params: []
    })
  );

  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "logsSubscribe",
      params: [
        "all",
        {
          commitment: env.INDEXER_COMMITMENT
        }
      ]
    })
  );
}

function connect(): void {
  if (shuttingDown || !env.INDEXER_ENABLED) return;

  websocket = new WebSocket(env.SOLANA_WS_URL);

  websocket.addEventListener("open", () => {
    console.log(`[indexer-stream] connected to ${sanitizeEndpoint(env.SOLANA_WS_URL)}`);
    subscribe(websocket as WebSocket);
  });

  websocket.addEventListener("message", (event) => {
    const raw = typeof event.data === "string" ? event.data : "";
    if (!raw) return;

    let message: SubscriptionAck | LogsNotification | SlotNotification | null = null;
    try {
      message = JSON.parse(raw) as SubscriptionAck | LogsNotification | SlotNotification;
    } catch (error) {
      console.error("[indexer-stream] failed to parse WS payload:", error);
      return;
    }

    if (!message || "id" in message) return;
    if (message.method === "slotNotification") {
      handleSlotNotification(message);
      return;
    }
    if (message.method === "logsNotification") {
      void handleLogsNotification(message).catch((error: unknown) => {
        console.error("[indexer-stream] failed to process logs notification:", error);
      });
    }
  });

  websocket.addEventListener("error", (event) => {
    console.error("[indexer-stream] websocket error:", event);
  });

  websocket.addEventListener("close", () => {
    websocket = null;
    if (shuttingDown) return;
    console.error("[indexer-stream] websocket closed; reconnecting");
    reconnectTimer = setTimeout(connect, env.INDEXER_RECONNECT_DELAY_MS);
  });
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[indexer-stream] shutting down on ${signal}`);

  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (pollTimer) clearInterval(pollTimer);
  if (drainTimer) clearInterval(drainTimer);
  if (websocket) websocket.close();

  await closeDb();
  process.exit(0);
}

async function main(): Promise<void> {
  if (!env.INDEXER_ENABLED) {
    console.log("[indexer-stream] disabled via INDEXER_ENABLED=false");
    return;
  }

  pollTimer = setInterval(() => {
    void pollPendingSignatures();
  }, env.INDEXER_PENDING_RECHECK_MS);

  drainTimer = setInterval(() => {
    void drainEnrichmentQueue();
  }, 150);

  connect();

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void main().catch((error: unknown) => {
  console.error("[indexer-stream] fatal error:", error);
  process.exit(1);
});
