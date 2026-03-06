import Link from "next/link";
import { getAddressDetails, getTokenDetails, getTopTokens } from "../../../lib/api";
import { TokenAvatar } from "./token-avatar";

function formatMaybe(value: string | number | null): string {
  if (value === null || value === "") return "Unknown";
  return String(value);
}

function formatLamports(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return `${(value / 1_000_000_000).toLocaleString("en-US", { maximumFractionDigits: 9 })} SOL`;
}

function formatAddressType(value: "token_mint" | "token_account" | "program" | "system_account" | "unknown"): string {
  switch (value) {
    case "token_mint":
      return "Token Mint";
    case "token_account":
      return "Token Account";
    case "program":
      return "Program Account";
    case "system_account":
      return "System Account";
    default:
      return "Wallet / Account";
  }
}

function formatUsd(value: number | null, decimals = 2): string {
  if (value === null || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: decimals
  }).format(value);
}

function formatPct(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatCompactAddress(value: string): string {
  if (value.length <= 20) return value;
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

function formatBlockTime(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "Pending";
  return new Date(value * 1000).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC"
  });
}

function formatTokenAmount(uiAmount: number | null, rawAmount: string | null): string {
  if (uiAmount !== null && !Number.isNaN(uiAmount)) {
    return uiAmount.toLocaleString("en-US", { maximumFractionDigits: 6 });
  }
  return rawAmount ?? "0";
}

function mintLogoFallback(mint: string): string {
  return `https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/assets/mainnet/${mint}/logo.png`;
}

function mintLogoRawFallback(mint: string): string {
  return `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${mint}/logo.png`;
}

export default async function AddressPage({
  params
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const [details, topTokens] = await Promise.all([
    getAddressDetails(address).catch(() => null),
    getTopTokens(6).catch(() => null)
  ]);

  const runtime = details?.runtime ?? null;
  const addressType = formatAddressType(runtime?.classification ?? "unknown");
  const isTokenMint = runtime?.classification === "token_mint";
  const isTokenAccount = runtime?.classification === "token_account";
  const tokenDetails = isTokenMint ? await getTokenDetails(address).catch(() => null) : null;
  const resolvedRuntime = tokenDetails?.runtime ?? runtime;

  const marketToken = topTokens?.items.find((token) => token.mint === address) ?? null;
  const tokenName = tokenDetails?.identity.name ?? marketToken?.name ?? resolvedRuntime?.knownToken?.name ?? "SPL Token";
  const tokenSymbol = tokenDetails?.identity.symbol ?? marketToken?.symbol ?? resolvedRuntime?.knownToken?.symbol ?? "TOKEN";
  const tokenIcon =
    tokenDetails?.identity.iconUrl ??
    marketToken?.iconUrl ??
    resolvedRuntime?.knownToken?.iconUrl ??
    mintLogoFallback(address);
  const tokenIconFallback = tokenIcon.includes("raw.githubusercontent.com")
    ? mintLogoFallback(address)
    : mintLogoRawFallback(address);

  if (isTokenMint) {
    const supplyUi = tokenDetails?.supply.amountUi ?? resolvedRuntime?.tokenMint?.supplyUi ?? null;
    const supplyRaw = tokenDetails?.supply.amountRaw ?? resolvedRuntime?.tokenMint?.supplyRaw ?? null;
    const supplyDecimals = tokenDetails?.supply.decimals ?? resolvedRuntime?.tokenMint?.decimals ?? null;
    const topHolders = tokenDetails?.holders ?? [];
    const recentTransfers = tokenDetails?.recentTransfers ?? [];
    const largestHolderPct = topHolders[0]?.pctOfSupply ?? null;
    const priceUsd = tokenDetails?.market.priceUsd ?? marketToken?.priceUsd ?? null;
    const change24hPct = tokenDetails?.market.change24hPct ?? marketToken?.change24hPct ?? null;
    const marketCapUsd = tokenDetails?.market.marketCapUsd ?? marketToken?.marketCapUsd ?? null;

    return (
      <main id="main-content" className="container page-main">
        <section className="panel token-hero">
          <div className="token-hero-main">
            <TokenAvatar
              alt={`${tokenSymbol} icon`}
              fallbackLabel={tokenSymbol.slice(0, 4)}
              src={tokenIcon}
              fallbackSrc={tokenIconFallback}
            />
            <div>
              <p className="eyebrow">Token Mint</p>
              <h1 className="program-title">{tokenName}</h1>
              <p className="hero-subtitle">{tokenSymbol} on Solana</p>
              <p className="token-mint-line">
                Mint <span className="mono-cell">{address}</span>
              </p>
            </div>
          </div>
          <div className="hero-actions-stack">
            <span className="status-chip status-chip-warn">Token Mint</span>
            <Link className="ghost-button link-button" href={`/search?q=${encodeURIComponent(address)}`}>
              Open In Search
            </Link>
            <Link
              className="ghost-button link-button"
              href={`https://explorer.solana.com/address/${encodeURIComponent(address)}`}
              target="_blank"
              rel="noreferrer"
            >
              Open In Solana Explorer
            </Link>
          </div>
        </section>

        <section className="panel token-subnav">
          <a href="#token-overview">Overview</a>
          <a href="#token-holders">Holders</a>
          <a href="#token-transfers">Transfers</a>
        </section>

        <section id="token-overview" className="stat-grid">
          <article className="panel stat-card">
            <p className="stat-label">Price</p>
            <p className="stat-value">{formatUsd(priceUsd, priceUsd !== null && priceUsd < 1 ? 6 : 3)}</p>
            <p className={(change24hPct ?? 0) >= 0 ? "delta-pos" : "delta-neg"}>
              {formatPct(change24hPct)}
            </p>
          </article>
          <article className="panel stat-card">
            <p className="stat-label">Market Cap</p>
            <p className="stat-value">{formatUsd(marketCapUsd, 0)}</p>
            <p className="stat-detail">Live feed when available</p>
          </article>
          <article className="panel stat-card">
            <p className="stat-label">Supply (UI)</p>
            <p className="stat-value">
              {supplyUi !== null ? supplyUi.toLocaleString("en-US") : "N/A"}
            </p>
            <p className="stat-detail">Decimals {supplyDecimals ?? "N/A"}</p>
          </article>
          <article className="panel stat-card">
            <p className="stat-label">Largest Holder Share</p>
            <p className="stat-value">{largestHolderPct !== null ? `${largestHolderPct.toFixed(2)}%` : "N/A"}</p>
            <p className="stat-detail">{topHolders.length} tracked holder accounts</p>
          </article>
        </section>

        <section className="grid grid-2">
          <article className="panel">
            <h2 className="section-title">Token Metadata</h2>
            <dl className="detail-list">
              <div>
                <dt>Name</dt>
                <dd>{tokenName}</dd>
              </div>
              <div>
                <dt>Symbol</dt>
                <dd>{tokenSymbol}</dd>
              </div>
              <div>
                <dt>Mint</dt>
                <dd className="mono-cell">{address}</dd>
              </div>
              <div>
                <dt>Decimals</dt>
                <dd>{supplyDecimals ?? "N/A"}</dd>
              </div>
              <div>
                <dt>Supply (Raw)</dt>
                <dd>{supplyRaw ?? "N/A"}</dd>
              </div>
            </dl>
          </article>
          <article className="panel">
            <h2 className="section-title">Mint Authorities</h2>
            <dl className="detail-list">
              <div>
                <dt>Mint Authority</dt>
                <dd className="mono-cell">
                  {resolvedRuntime?.tokenMint?.mintAuthority
                    ? formatCompactAddress(resolvedRuntime.tokenMint.mintAuthority)
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Freeze Authority</dt>
                <dd className="mono-cell">
                  {resolvedRuntime?.tokenMint?.freezeAuthority
                    ? formatCompactAddress(resolvedRuntime.tokenMint.freezeAuthority)
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Initialized</dt>
                <dd>
                  {resolvedRuntime?.tokenMint?.isInitialized === null ||
                  resolvedRuntime?.tokenMint?.isInitialized === undefined
                    ? "Unknown"
                    : resolvedRuntime.tokenMint.isInitialized
                      ? "yes"
                      : "no"}
                </dd>
              </div>
              <div>
                <dt>Owner Program</dt>
                <dd className="mono-cell">
                  {resolvedRuntime?.ownerProgram ?? "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"}
                </dd>
              </div>
            </dl>
          </article>
        </section>

        <section id="token-holders" className="panel">
          <div className="section-header">
            <h2 className="section-title">Top Holders</h2>
            <span className="network-pill">{topHolders.length} rows</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Token Account</th>
                  <th>Balance</th>
                  <th>% Supply</th>
                </tr>
              </thead>
              <tbody>
                {topHolders.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      Holder data is temporarily unavailable (RPC provider may be rate-limiting this mint).
                    </td>
                  </tr>
                ) : (
                  topHolders.map((holder) => (
                    <tr key={holder.address}>
                      <td>{holder.rank}</td>
                      <td>
                        <Link className="mono-cell" href={`/address/${holder.address}`}>
                          {formatCompactAddress(holder.address)}
                        </Link>
                      </td>
                      <td>{formatTokenAmount(holder.amountUi, holder.amountRaw)}</td>
                      <td>{holder.pctOfSupply !== null ? `${holder.pctOfSupply.toFixed(2)}%` : "0.00%"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section id="token-transfers" className="panel">
          <div className="section-header">
            <h2 className="section-title">Recent Transfers</h2>
            <span className="network-pill">{recentTransfers.length} rows</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Signature</th>
                  <th>Time (UTC)</th>
                  <th>Action</th>
                  <th>Amount</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentTransfers.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      Recent transfer data is temporarily unavailable (RPC provider may be rate-limiting this mint).
                    </td>
                  </tr>
                ) : (
                  recentTransfers.map((row) => (
                    <tr key={`${row.signature}-${row.slot}-${row.action}-${row.source ?? "na"}`}>
                      <td>
                        <Link className="mono-cell" href={`/tx/${row.signature}`}>
                          {formatCompactAddress(row.signature)}
                        </Link>
                      </td>
                      <td>{formatBlockTime(row.blockTime)}</td>
                      <td>{row.action}</td>
                      <td>{formatTokenAmount(row.amountUi, row.amountRaw)}</td>
                      <td>
                        {row.source ? (
                          <Link className="mono-cell" href={`/address/${row.source}`}>
                            {formatCompactAddress(row.source)}
                          </Link>
                        ) : (
                          "System"
                        )}
                      </td>
                      <td>
                        {row.destination ? (
                          <Link className="mono-cell" href={`/address/${row.destination}`}>
                            {formatCompactAddress(row.destination)}
                          </Link>
                        ) : (
                          "System"
                        )}
                      </td>
                      <td>
                        <span className={row.success ? "status-chip status-chip-ok" : "status-chip status-chip-bad"}>
                          {row.success ? "ok" : "failed"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main id="main-content" className="container page-main">
      <section className="panel program-hero">
        <div>
          <p className="eyebrow">{isTokenAccount ? "Token Account" : "Address"}</p>
          <h1 className="program-title">{address}</h1>
          <p className="hero-subtitle">{addressType} profile with indexed and runtime account context.</p>
        </div>
        <div className="hero-actions-stack">
          <span className={isTokenAccount ? "status-chip status-chip-warn" : "status-chip status-chip-ok"}>
            {addressType}
          </span>
          <Link className="ghost-button link-button" href={`/search?q=${encodeURIComponent(address)}`}>
            Open In Search
          </Link>
          <Link
            className="ghost-button link-button"
            href={`https://explorer.solana.com/address/${encodeURIComponent(address)}`}
            target="_blank"
            rel="noreferrer"
          >
            Open In Solana Explorer
          </Link>
        </div>
      </section>

      <section className="stat-grid">
        <article className="panel stat-card">
          <p className="stat-label">First Seen Slot</p>
          <p className="stat-value">{formatMaybe(details?.profile?.first_seen_slot ?? null)}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Last Seen Slot</p>
          <p className="stat-value">{formatMaybe(details?.profile?.last_seen_slot ?? null)}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Recent Verifier Runs</p>
          <p className="stat-value">{details?.recentVerificationRuns.length ?? 0}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Lamports</p>
          <p className="stat-value">{formatLamports(runtime?.lamports ?? null)}</p>
        </article>
      </section>

      <section className="grid grid-2">
        <article className="panel">
          <h2 className="section-title">Address Metadata</h2>
          <dl className="detail-list">
            <div>
              <dt>Address</dt>
              <dd>{address}</dd>
            </div>
            <div>
              <dt>Indexed Profile</dt>
              <dd>{details?.profile ? "available" : "not available"}</dd>
            </div>
            <div>
              <dt>Runtime Exists</dt>
              <dd>{runtime?.exists ? "yes" : "unknown"}</dd>
            </div>
            <div>
              <dt>Owner Program</dt>
              <dd>{runtime?.ownerProgram ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>Updated At</dt>
              <dd>{details?.profile?.updated_at ?? "Unknown"}</dd>
            </div>
          </dl>
        </article>
        <article className="panel">
          <h2 className="section-title">Runtime Classification</h2>
          <p className="hero-subtitle">
            This account is currently classified as <strong>{addressType}</strong> from live runtime metadata.
          </p>
        </article>
      </section>

      {runtime?.tokenAccount ? (
        <section className="panel">
          <div className="section-header">
            <h2 className="section-title">Token Account Snapshot</h2>
            <span className="network-pill">{runtime.knownToken?.symbol ?? "SPL account"}</span>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Mint</dt>
              <dd className="mono-cell">{runtime.tokenAccount.mint ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>Owner</dt>
              <dd className="mono-cell">{runtime.tokenAccount.owner ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>State</dt>
              <dd>{runtime.tokenAccount.state ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>Amount (UI)</dt>
              <dd>{runtime.tokenAccount.amountUi !== null ? runtime.tokenAccount.amountUi.toLocaleString("en-US") : "N/A"}</dd>
            </div>
            <div>
              <dt>Amount (Raw)</dt>
              <dd>{runtime.tokenAccount.amountRaw ?? "N/A"}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="panel">
        <div className="section-header">
          <h2 className="section-title">Recent Related Verification Runs</h2>
          <span className="network-pill">{details?.recentVerificationRuns.length ?? 0} rows</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Status</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              {!details || details.recentVerificationRuns.length === 0 ? (
                <tr>
                  <td colSpan={3}>No verification runs recorded for this address yet.</td>
                </tr>
              ) : (
                details.recentVerificationRuns.map((row) => (
                  <tr key={row.run_id}>
                    <td>{row.run_id}</td>
                    <td>
                      <span
                        className={
                          row.run_status === "succeeded"
                            ? "status-chip status-chip-ok"
                            : row.run_status === "running" || row.run_status === "queued"
                              ? "status-chip status-chip-warn"
                              : "status-chip status-chip-bad"
                        }
                      >
                        {row.run_status}
                      </span>
                    </td>
                    <td>{row.created_at}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
