const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export type ProgramDetails = {
  programId: string;
  loaderProgramId: string;
  programdataAddress: string | null;
  upgradeAuthority: string | null;
  isUpgradeable: boolean;
  deploySlot: number | null;
  lastUpgradeSlot: number | null;
  lastSeenSlot: number | null;
  verification: {
    status:
      | "verified_reproducible"
      | "source_provided_not_reproducible"
      | "unverified"
      | "verification_failed";
    checkedAt: string | null;
    sourceRepoUrl: string | null;
    sourceCommit: string | null;
    diffSummary: string | null;
  };
};

export type VerificationDetails = {
  programId: string;
  summary: {
    verification_status: string;
    source_repo_url: string | null;
    source_commit: string | null;
    source_subdir: string | null;
    build_image: string | null;
    verifier_version: string | null;
    expected_program_hash: string | null;
    onchain_program_hash: string | null;
    diff_summary: string | null;
    verified_at: string | null;
    last_checked_at: string | null;
  } | null;
  runs: Array<{
    run_id: number;
    triggered_by: string;
    run_status: string;
    queue_latency_ms: number | null;
    duration_ms: number | null;
    started_at: string | null;
    finished_at: string | null;
    error_code: string | null;
    error_message: string | null;
    created_at: string;
  }>;
};

export type VerificationFeedResponse = {
  window: string;
  count: number;
  items: Array<{
    program_id: string;
    verification_status: string;
    source_repo_url: string | null;
    source_commit: string | null;
    last_checked_at: string;
    last_upgrade_slot: string | null;
  }>;
};

export type ExplorerSearchResponse = {
  query: string;
  count: number;
  byKind: {
    program: number;
    address: number;
    tx: number;
  };
  bestMatch: {
    kind: "program" | "address" | "tx";
    id: string;
    title: string;
    subtitle: string;
    href: string;
    exact: boolean;
    confidence: number;
    updatedAt: string | null;
  } | null;
  matches: Array<{
    kind: "program" | "address" | "tx";
    id: string;
    title: string;
    subtitle: string;
    href: string;
    exact: boolean;
    confidence: number;
    updatedAt: string | null;
  }>;
};

export type DashboardOverviewResponse = {
  counts: {
    programs_count: string | number;
    tx_count: string | number;
    addresses_count: string | number;
    verification_run_count: string | number;
  };
  verificationStatusCounts: Array<{
    verification_status: string;
    total: string | number;
  }>;
  recentTransactions: Array<{
    signature: string;
    slot: string | number;
    success: boolean;
    fee_lamports: string | number;
    compute_units: string | number | null;
    priority_fee_lamports: string | number | null;
    created_at: string;
  }>;
  recentPrograms: Array<{
    program_id: string;
    last_seen_slot: string | number | null;
    last_upgrade_slot: string | number | null;
    verification_status: string | null;
    last_checked_at: string | null;
  }>;
};

export type NetworkOverviewResponse = {
  cluster: string;
  asOf: string;
  supply: {
    totalSol: number;
    circulatingSol: number;
    nonCirculatingSol: number;
    circulatingPct: number;
    nonCirculatingPct: number;
  };
  epoch: {
    epoch: number | null;
    progressPct: number | null;
    slotRangeStart: number | null;
    slotRangeEnd: number | null;
    slotIndex: number | null;
    slotsInEpoch: number | null;
    estimatedSecondsRemaining: number | null;
  };
  network: {
    transactionCount: number | null;
    blockHeight: number | null;
    slotHeight: number | null;
    tps: number | null;
    trueTps: number | null;
    avgFeeLamports: number | null;
  };
  stake: {
    totalSol: number;
    currentSol: number;
    delinquentSol: number;
    currentPct: number;
    delinquentPct: number;
  };
};

export type LiveTransactionsResponse = {
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

export type NetworkTrendsResponse = {
  asOf: string;
  tps: Array<{
    index: number;
    slot: number;
    tps: number | null;
    trueTps: number | null;
  }>;
  fees: Array<{
    index: number;
    bucketTs: number;
    avgFeeLamports: number;
  }>;
};

export type TopTokensResponse = {
  source: "coingecko" | "fallback";
  count: number;
  items: Array<{
    mint: string;
    symbol: string;
    name: string;
    iconUrl: string;
    priceUsd: number | null;
    marketCapUsd: number | null;
    change24hPct: number | null;
  }>;
};

export type TransactionsListResponse = {
  count: number;
  items: Array<{
    signature: string;
    slot: string | number;
    block_time: string | number | null;
    success: boolean;
    fee_lamports: string | number;
    compute_units: string | number | null;
    priority_fee_lamports: string | number | null;
    source: string;
    created_at: string;
  }>;
};

export type ProgramsListResponse = {
  count: number;
  items: Array<{
    program_id: string;
    last_seen_slot: string | number | null;
    last_upgrade_slot: string | number | null;
    is_upgradeable: boolean;
    verification_status: string | null;
    last_checked_at: string | null;
    source_repo_url: string | null;
  }>;
};

export type AddressesListResponse = {
  count: number;
  items: Array<{
    wallet_address: string;
    first_seen_slot: string | number | null;
    last_seen_slot: string | number | null;
    updated_at: string;
    verifier_run_count: string | number;
  }>;
};

export type TxDetails = {
  signature: string;
  slot: string | number | null;
  blockTime: string | number | null;
  success: boolean;
  feeLamports: string | number;
  computeUnits: string | number | null;
  priorityFeeLamports: string | number | null;
  source: string;
  indexedAt: string;
  action: string;
  instructionCount: number;
  signerCount: number;
  signers: string[];
  instructions: Array<{
    index: number;
    program: string;
    type: string;
  }>;
  accountChanges: Array<{
    address: string;
    signer: boolean;
    writable: boolean;
    preLamports: number | null;
    postLamports: number | null;
    deltaLamports: number | null;
  }>;
  logMessages: string[];
  balanceSummary: {
    totalAccounts: number;
    changedAccounts: number;
  };
};

export type AddressDetails = {
  address: string;
  profile: {
    wallet_address: string;
    first_seen_slot: string | number | null;
    last_seen_slot: string | number | null;
    updated_at: string;
  } | null;
  recentVerificationRuns: Array<{
    run_id: string | number;
    run_status: string;
    created_at: string;
  }>;
  runtime: {
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
};

export type TokenDetails = {
  mint: string;
  runtime: AddressDetails["runtime"];
  identity: {
    symbol: string | null;
    name: string | null;
    iconUrl: string | null;
  };
  market: {
    priceUsd: number | null;
    change24hPct: number | null;
    marketCapUsd: number | null;
    fdvUsd: number | null;
    source: "dexscreener" | "coingecko" | "none";
  };
  supply: {
    amountRaw: string | null;
    decimals: number | null;
    amountUi: number | null;
    amountUiString: string | null;
  };
  holders: Array<{
    rank: number;
    address: string;
    amountRaw: string;
    amountUi: number | null;
    amountUiString: string;
    pctOfSupply: number | null;
  }>;
  recentTransfers: Array<{
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
};

type FetchJsonOptions = {
  revalidate?: number;
};

async function fetchJson<T>(path: string, options: FetchJsonOptions = {}): Promise<T> {
  const init: RequestInit & { next?: { revalidate: number } } = {};
  if (typeof options.revalidate === "number") {
    init.next = { revalidate: options.revalidate };
  } else {
    init.cache = "no-store";
  }

  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) {
    throw new Error(`API error ${res.status} for ${path}`);
  }
  return (await res.json()) as T;
}

export function getProgramDetails(programId: string): Promise<ProgramDetails> {
  return fetchJson<ProgramDetails>(`/v1/programs/${programId}`);
}

export function getProgramVerification(programId: string): Promise<VerificationDetails> {
  return fetchJson<VerificationDetails>(`/v1/programs/${programId}/verification`);
}

export function getVerificationFeed(window: "1h" | "24h" | "7d" = "24h"): Promise<VerificationFeedResponse> {
  return fetchJson<VerificationFeedResponse>(`/v1/programs/verification-feed?window=${window}`);
}

export function searchExplorer(query: string, limit = 8): Promise<ExplorerSearchResponse> {
  return fetchJson<ExplorerSearchResponse>(
    `/v1/search?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(String(limit))}`
  );
}

export function getDashboardOverview(revalidate = 5): Promise<DashboardOverviewResponse> {
  return fetchJson<DashboardOverviewResponse>("/v1/dashboard/overview", { revalidate });
}

export function getNetworkOverview(revalidate = 5): Promise<NetworkOverviewResponse> {
  return fetchJson<NetworkOverviewResponse>("/v1/network/overview", { revalidate });
}

export function getNetworkTrends(revalidate = 5): Promise<NetworkTrendsResponse> {
  return fetchJson<NetworkTrendsResponse>("/v1/network/trends?limit=30", { revalidate });
}

export function getLiveTransactions(limit = 10, revalidate = 2): Promise<LiveTransactionsResponse> {
  return fetchJson<LiveTransactionsResponse>(`/v1/transactions/live?limit=${encodeURIComponent(String(limit))}`, {
    revalidate
  });
}

export function getTopTokens(limit = 6, revalidate = 15): Promise<TopTokensResponse> {
  return fetchJson<TopTokensResponse>(`/v1/markets/tokens?limit=${encodeURIComponent(String(limit))}`, {
    revalidate
  });
}

export function getTransactionsList(limit = 20, revalidate = 5): Promise<TransactionsListResponse> {
  return fetchJson<TransactionsListResponse>(`/v1/transactions?limit=${encodeURIComponent(String(limit))}`, {
    revalidate
  });
}

export function getProgramsList(limit = 20, revalidate = 10): Promise<ProgramsListResponse> {
  return fetchJson<ProgramsListResponse>(`/v1/programs?limit=${encodeURIComponent(String(limit))}`, {
    revalidate
  });
}

export function getAddressesList(limit = 20, revalidate = 10): Promise<AddressesListResponse> {
  return fetchJson<AddressesListResponse>(`/v1/addresses?limit=${encodeURIComponent(String(limit))}`, {
    revalidate
  });
}

export function getTxDetails(signature: string): Promise<TxDetails> {
  return fetchJson<TxDetails>(`/v1/tx/${signature}`);
}

export function getAddressDetails(address: string): Promise<AddressDetails> {
  return fetchJson<AddressDetails>(`/v1/addresses/${address}`);
}

export function getTokenDetails(mint: string): Promise<TokenDetails> {
  return fetchJson<TokenDetails>(`/v1/tokens/${mint}`);
}
