import { Activity, BarChart3, ChartLine, Coins, Database, ShieldCheck, TowerControl, WalletCards } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  getAddressesList,
  getDashboardOverview,
  getLiveTransactions,
  getNetworkOverview,
  getNetworkTrends,
  getTopTokens,
  getProgramsList,
  getVerificationFeed
} from "../lib/api";

function statusChipClass(status: string): string {
  if (status === "verified_reproducible" || status === "succeeded") return "status-chip status-chip-ok";
  if (status === "source_provided_not_reproducible" || status === "queued" || status === "running") {
    return "status-chip status-chip-warn";
  }
  return "status-chip status-chip-bad";
}

function compactAddress(value: string): string {
  if (value.length <= 24) return value;
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

function formatCount(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "0";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString("en-US");
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return `${value.toFixed(2)}%`;
}

function formatSol(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} SOL`;
}

function formatUsd(value: number | null | undefined, maxFractionDigits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: maxFractionDigits
  });
}

function formatSignedPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatAgo(value: string | number | null): string {
  if (value === null || value === "") return "N/A";
  const ts = Number(value);
  if (Number.isNaN(ts) || ts <= 0) return String(value);
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatRemaining(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "N/A";
  const total = Math.max(0, Math.floor(seconds));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}

function buildSparkline(values: number[], width = 360, height = 92, padding = 8): {
  linePath: string;
  areaPath: string;
} | null {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = values.map((value, idx) => {
    const x =
      values.length === 1
        ? width / 2
        : padding + (idx / (values.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((value - min) / span) * (height - 2 * padding);
    return { x, y };
  });

  const linePath = points
    .map((point, idx) => `${idx === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

  const first = points[0];
  const last = points[points.length - 1];
  const areaPath = `${linePath} L ${last.x.toFixed(2)} ${(height - padding).toFixed(2)} L ${first.x.toFixed(2)} ${(height - padding).toFixed(2)} Z`;

  return { linePath, areaPath };
}

function normalizeSeries(values: Array<number | null | undefined>): number[] {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function trendDelta(values: number[]): number | null {
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  if (first === 0) return null;
  return ((last - first) / Math.abs(first)) * 100;
}

function TrendCard({
  title,
  subtitle,
  icon: Icon,
  values,
  formatter,
  lineTone
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  values: number[];
  formatter: (value: number) => string;
  lineTone: "cyan" | "purple" | "green";
}) {
  const chart = buildSparkline(values);
  const latest = values.length > 0 ? values[values.length - 1] : null;
  const delta = trendDelta(values);

  return (
    <article className="panel trend-panel">
      <div className="trend-head">
        <div className="trend-title-wrap">
          <Icon className="trend-icon" size={16} />
          <h3 className="section-title">{title}</h3>
        </div>
        <span className="network-pill">{subtitle}</span>
      </div>

      <div className="trend-value-row">
        <p className="stat-value">{latest !== null ? formatter(latest) : "N/A"}</p>
        <span className={delta === null ? "stat-detail" : delta >= 0 ? "delta-pos" : "delta-neg"}>
          {delta === null ? "N/A" : formatSignedPercent(delta)}
        </span>
      </div>

      {chart ? (
        <svg className="trend-svg" viewBox="0 0 360 92" role="img" aria-label={`${title} trend`}>
          <path className={`trend-area trend-area-${lineTone}`} d={chart.areaPath} />
          <path className={`trend-line trend-line-${lineTone}`} d={chart.linePath} />
        </svg>
      ) : (
        <p className="stat-detail">No trend samples available yet.</p>
      )}
    </article>
  );
}

export default async function HomePage() {
  const [feed, dashboard, network, trends, liveTx, programs, addresses, topTokens] = await Promise.all([
    getVerificationFeed("24h").catch(() => ({
      window: "24h",
      count: 0,
      items: []
    })),
    getDashboardOverview().catch(() => ({
      counts: {
        programs_count: 0,
        tx_count: 0,
        addresses_count: 0,
        verification_run_count: 0
      },
      verificationStatusCounts: [],
      recentTransactions: [],
      recentPrograms: []
    })),
    getNetworkOverview().catch(() => ({
      cluster: "mainnet-beta",
      asOf: new Date().toISOString(),
      supply: {
        totalSol: 0,
        circulatingSol: 0,
        nonCirculatingSol: 0,
        circulatingPct: 0,
        nonCirculatingPct: 0
      },
      epoch: {
        epoch: null,
        progressPct: null,
        slotRangeStart: null,
        slotRangeEnd: null,
        slotIndex: null,
        slotsInEpoch: null,
        estimatedSecondsRemaining: null
      },
      network: {
        transactionCount: null,
        blockHeight: null,
        slotHeight: null,
        tps: null,
        trueTps: null,
        avgFeeLamports: null
      },
      stake: {
        totalSol: 0,
        currentSol: 0,
        delinquentSol: 0,
        currentPct: 0,
        delinquentPct: 0
      }
    })),
    getNetworkTrends().catch(() => ({
      asOf: new Date().toISOString(),
      tps: [],
      fees: []
    })),
    getLiveTransactions(10).catch(() => ({ count: 0, items: [] })),
    getProgramsList(10).catch(() => ({ count: 0, items: [] })),
    getAddressesList(10).catch(() => ({ count: 0, items: [] })),
    getTopTokens(6).catch(() => ({ source: "fallback" as const, count: 0, items: [] }))
  ]);

  const tpsSeries = normalizeSeries(trends.tps.map((point) => point.tps));
  const trueTpsSeries = normalizeSeries(trends.tps.map((point) => point.trueTps));
  const feeSeries = normalizeSeries(trends.fees.map((point) => point.avgFeeLamports));
  const solTicker = topTokens.items.find((item) => item.symbol.toUpperCase() === "SOL") ?? null;

  return (
    <main id="main-content" className="container page-main">
      <section className="panel route-intro">
        <p className="eyebrow">Explorer Snapshot</p>
        <h1 className="program-title">Rayscan</h1>
        <p className="hero-subtitle">
          General-purpose Solana explorer for transactions, programs, and addresses.
        </p>
        <div className="market-strip" aria-label="Network market highlights">
          <span className="market-pill">
            <strong>SOL</strong> {formatUsd(solTicker?.priceUsd, 3)}
          </span>
          <span className={`market-pill ${(solTicker?.change24hPct ?? 0) >= 0 ? "delta-pos" : "delta-neg"}`}>
            24h {formatSignedPercent(solTicker?.change24hPct)}
          </span>
          <span className="market-pill">
            Avg Fee {network.network.avgFeeLamports !== null ? network.network.avgFeeLamports.toFixed(2) : "N/A"} lamports
          </span>
        </div>
        <div className="hero-actions-row">
          <Link className="ghost-button link-button" href="/transactions">
            Transactions
          </Link>
          <Link className="ghost-button link-button" href="/programs">
            Programs
          </Link>
          <Link className="ghost-button link-button" href="/addresses">
            Addresses
          </Link>
          <Link className="wallet-button link-button" href="/search">
            Open Search
          </Link>
        </div>
      </section>

      <section className="stat-grid">
        <article className="panel stat-card">
          <p className="stat-label">SOL Supply</p>
          <p className="stat-value">{formatSol(network.supply.totalSol)}</p>
          <p className="stat-detail">
            Circulating {formatSol(network.supply.circulatingSol)} ({formatPercent(network.supply.circulatingPct)})
          </p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Current Epoch</p>
          <p className="stat-value">{network.epoch.epoch ?? "N/A"}</p>
          <p className="stat-detail">
            {formatPercent(network.epoch.progressPct)} • {formatRemaining(network.epoch.estimatedSecondsRemaining)}
          </p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">TPS / True TPS</p>
          <p className="stat-value">
            {network.network.tps !== null ? network.network.tps.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "N/A"}
          </p>
          <p className="stat-detail">
            True TPS{" "}
            {network.network.trueTps !== null
              ? network.network.trueTps.toLocaleString("en-US", { maximumFractionDigits: 2 })
              : "N/A"}
          </p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Avg Fee (Lamports)</p>
          <p className="stat-value">
            {network.network.avgFeeLamports !== null
              ? network.network.avgFeeLamports.toLocaleString("en-US", { maximumFractionDigits: 2 })
              : "N/A"}
          </p>
          <p className="stat-detail">Derived from last 30m indexed data or RPC fees.</p>
        </article>
      </section>

      <section className="trend-grid">
        <TrendCard
          title="Network TPS"
          subtitle="Recent samples"
          icon={Activity}
          values={tpsSeries}
          formatter={(value) => value.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          lineTone="cyan"
        />
        <TrendCard
          title="True TPS"
          subtitle="Non-vote"
          icon={ChartLine}
          values={trueTpsSeries}
          formatter={(value) => value.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          lineTone="purple"
        />
        <TrendCard
          title="Average Fee"
          subtitle="Lamports"
          icon={Coins}
          values={feeSeries}
          formatter={(value) => value.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          lineTone="green"
        />
      </section>

      <section className="stat-grid">
        <article className="panel stat-card">
          <p className="stat-label">Block / Slot Height</p>
          <p className="stat-value">{formatCount(network.network.blockHeight)}</p>
          <p className="stat-detail">Slot {formatCount(network.network.slotHeight)}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Network Transactions</p>
          <p className="stat-value">{formatCount(network.network.transactionCount)}</p>
          <p className="stat-detail">Cluster {network.cluster}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Total Stake</p>
          <p className="stat-value">{formatSol(network.stake.totalSol)}</p>
          <p className="stat-detail">
            Current {formatPercent(network.stake.currentPct)} • Delinquent {formatPercent(network.stake.delinquentPct)}
          </p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Indexed Coverage</p>
          <p className="stat-value">{formatCount(dashboard.counts.tx_count)} Tx</p>
          <p className="stat-detail">
            Programs {formatCount(dashboard.counts.programs_count)} • Addresses {formatCount(dashboard.counts.addresses_count)}
          </p>
        </article>
      </section>

      <section className="panel">
        <div className="section-header">
          <h2 className="section-title section-title-row">
            <WalletCards size={16} /> Token Dashboard
          </h2>
          <span className="network-pill">{topTokens.source === "coingecko" ? "live market feed" : "cached fallback"}</span>
        </div>
        <div className="table-wrap">
          <table className="table token-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Price</th>
                <th>24h</th>
                <th>Market Cap</th>
                <th>Mint</th>
              </tr>
            </thead>
            <tbody>
              {topTokens.items.length === 0 ? (
                <tr>
                  <td colSpan={5}>No token market data available.</td>
                </tr>
              ) : (
                topTokens.items.map((token) => (
                  <tr key={token.mint}>
                    <td>
                      <div className="token-cell">
                        <Image
                          alt={`${token.symbol} icon`}
                          className="token-icon"
                          height={24}
                          src={token.iconUrl}
                          width={24}
                        />
                        <div>
                          <div className="token-name">{token.name}</div>
                          <div className="token-symbol">{token.symbol}</div>
                        </div>
                      </div>
                    </td>
                    <td>{formatUsd(token.priceUsd, token.priceUsd !== null && token.priceUsd < 1 ? 6 : 3)}</td>
                    <td className={(token.change24hPct ?? 0) >= 0 ? "delta-pos" : "delta-neg"}>
                      {formatSignedPercent(token.change24hPct)}
                    </td>
                    <td>{formatUsd(token.marketCapUsd, 0)}</td>
                    <td>
                      <Link className="mono-cell" href={`/address/${token.mint}`}>
                        {compactAddress(token.mint)}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-2">
        <article className="panel">
          <div className="section-header">
            <h2 className="section-title section-title-row">
              <BarChart3 size={16} /> Latest Transactions
            </h2>
            <Link className="network-pill" href="/transactions">
              View All
            </Link>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Signature</th>
                  <th>Time</th>
                  <th>Block</th>
                  <th>Action</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {liveTx.items.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No recent transactions available.</td>
                  </tr>
                ) : (
                  liveTx.items.map((tx) => (
                    <tr key={tx.signature}>
                      <td>
                        <Link className="mono-cell" href={`/tx/${tx.signature}`}>
                          {compactAddress(tx.signature)}
                        </Link>
                      </td>
                      <td>{formatAgo(tx.block_time)}</td>
                      <td>{tx.slot}</td>
                      <td>{tx.action}</td>
                      <td>
                        <span className={tx.success ? "status-chip status-chip-ok" : "status-chip status-chip-bad"}>
                          {tx.success ? "succeeded" : "failed"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="section-header">
            <h2 className="section-title section-title-row">
              <Database size={16} /> Latest Programs
            </h2>
            <Link className="network-pill" href="/programs">
              Open Table
            </Link>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Program</th>
                  <th>Status</th>
                  <th>Last Seen Slot</th>
                </tr>
              </thead>
              <tbody>
                {programs.items.length === 0 ? (
                  <tr>
                    <td colSpan={3}>No indexed programs yet.</td>
                  </tr>
                ) : (
                  programs.items.map((program) => {
                    const status = program.verification_status ?? "unverified";
                    return (
                      <tr key={program.program_id}>
                        <td>
                          <Link className="mono-cell" href={`/program/${program.program_id}`}>
                            {compactAddress(program.program_id)}
                          </Link>
                        </td>
                        <td>
                          <span className={statusChipClass(status)}>{status.replaceAll("_", " ")}</span>
                        </td>
                        <td>{program.last_seen_slot ?? "N/A"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="grid grid-2">
        <article className="panel">
          <div className="section-header">
            <h2 className="section-title section-title-row">
              <TowerControl size={16} /> Latest Addresses
            </h2>
            <Link className="network-pill" href="/addresses">
              Open Table
            </Link>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Last Seen Slot</th>
                  <th>Runs</th>
                </tr>
              </thead>
              <tbody>
                {addresses.items.length === 0 ? (
                  <tr>
                    <td colSpan={3}>No address profiles indexed yet.</td>
                  </tr>
                ) : (
                  addresses.items.map((address) => (
                    <tr key={address.wallet_address}>
                      <td>
                        <Link className="mono-cell" href={`/address/${address.wallet_address}`}>
                          {compactAddress(address.wallet_address)}
                        </Link>
                      </td>
                      <td>{address.last_seen_slot ?? "N/A"}</td>
                      <td>{address.verifier_run_count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel" id="verification-feed">
          <div className="section-header">
            <h2 className="section-title section-title-row">
              <ShieldCheck size={16} /> Program Verification Updates (24h)
            </h2>
            <span className="network-pill">{feed.count} rows</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Program</th>
                  <th>Status</th>
                  <th>Checked</th>
                </tr>
              </thead>
              <tbody>
                {feed.items.length === 0 ? (
                  <tr>
                    <td colSpan={3}>No verification data in current window.</td>
                  </tr>
                ) : (
                  feed.items.slice(0, 10).map((item) => (
                    <tr key={`${item.program_id}-${item.last_checked_at}`}>
                      <td>
                        <Link className="mono-cell" href={`/program/${item.program_id}`}>
                          {compactAddress(item.program_id)}
                        </Link>
                      </td>
                      <td>
                        <span className={statusChipClass(item.verification_status)}>
                          {item.verification_status.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td>{item.last_checked_at}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}
