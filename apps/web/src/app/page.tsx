import { Activity, ChartLine, Coins, WalletCards } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { getSolanaCluster } from "../lib/env";
import { LatestTransactionsFeed } from "./latest-transactions-feed";
import {
  getDashboardOverview,
  getLiveTransactions,
  getNetworkOverview,
  getNetworkTrends,
  getTopTokens
} from "../lib/api";

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

function formatCountOrNa(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
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
  const solanaCluster = getSolanaCluster();
  const [dashboard, network, trends, liveTx, topTokens] = await Promise.all([
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
      cluster: solanaCluster,
      asOf: new Date().toISOString(),
      supply: {
        totalSol: null,
        circulatingSol: null,
        nonCirculatingSol: null,
        circulatingPct: null,
        nonCirculatingPct: null
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
        totalSol: null,
        currentSol: null,
        delinquentSol: null,
        currentPct: null,
        delinquentPct: null
      }
    })),
    getNetworkTrends().catch(() => ({
      asOf: new Date().toISOString(),
      tps: [],
      fees: []
    })),
    getLiveTransactions(10).catch(() => ({ count: 0, items: [] })),
    getTopTokens(6).catch(() => ({ source: "fallback" as const, count: 0, items: [] }))
  ]);

  const tpsSeries = normalizeSeries(trends.tps.map((point) => point.tps));
  const trueTpsSeries = normalizeSeries(trends.tps.map((point) => point.trueTps));
  const feeSeries = normalizeSeries(trends.fees.map((point) => point.avgFeeLamports));
  const solTicker = topTokens.items.find((item) => item.symbol.toUpperCase() === "SOL") ?? null;
  const indexedTxCount = Number(dashboard.counts.tx_count ?? 0);
  const indexedAddressCount = Number(dashboard.counts.addresses_count ?? 0);
  const isIndexColdStart = (Number.isFinite(indexedTxCount) ? indexedTxCount : 0) === 0 &&
    (Number.isFinite(indexedAddressCount) ? indexedAddressCount : 0) === 0;

  return (
    <main id="main-content" className="container page-main">
      <section className="panel route-intro">
        <p className="eyebrow">Explorer Snapshot</p>
        <h1 className="program-title">Rayscan</h1>
        <p className="hero-subtitle">
          General-purpose Solana explorer for transactions, addresses, and token mints.
        </p>
        <form action="/search" className="hero-search" method="get" role="search">
          <label className="sr-only" htmlFor="hero-search">
            Search signature, address, or token mint
          </label>
          <input
            autoComplete="off"
            id="hero-search"
            name="q"
            placeholder="Search signature, address, or token mint…"
            spellCheck={false}
            type="text"
          />
          <button type="submit">Go</button>
        </form>
        <div className="market-strip" aria-label="Network market highlights">
          <span className="market-pill">
            <strong>SOL</strong> {formatUsd(solTicker?.priceUsd, 3)}
          </span>
          <span className={`market-pill ${(solTicker?.change24hPct ?? 0) >= 0 ? "delta-pos" : "delta-neg"}`}>
            24h {formatSignedPercent(solTicker?.change24hPct)}
          </span>
          <span className="market-pill">
            30m Avg Fee{" "}
            {network.network.avgFeeLamports !== null ? network.network.avgFeeLamports.toFixed(2) : "N/A"} lamports
          </span>
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
          <p className="stat-label">30m Avg Fee (Lamports)</p>
          <p className="stat-value">
            {network.network.avgFeeLamports !== null
              ? network.network.avgFeeLamports.toLocaleString("en-US", { maximumFractionDigits: 2 })
              : "N/A"}
          </p>
          <p className="stat-detail">Rolling 30 minute average from enriched indexed fees or RPC fallback.</p>
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
          title="Recent Fee Trend"
          subtitle="Latest 1m bucket"
          icon={Coins}
          values={feeSeries}
          formatter={(value) => value.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          lineTone="green"
        />
      </section>

      <section className="stat-grid">
        <article className="panel stat-card">
          <p className="stat-label">Block / Slot Height</p>
          <p className="stat-value">{formatCountOrNa(network.network.blockHeight)}</p>
          <p className="stat-detail">Slot {formatCountOrNa(network.network.slotHeight)}</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Network Transactions</p>
          <p className="stat-value">{formatCountOrNa(network.network.transactionCount)}</p>
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
            {isIndexColdStart
              ? "Indexer not ingesting yet (local DB is still empty)."
              : `Addresses ${formatCount(dashboard.counts.addresses_count)}`}
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

      <LatestTransactionsFeed initialItems={liveTx.items} />
    </main>
  );
}
