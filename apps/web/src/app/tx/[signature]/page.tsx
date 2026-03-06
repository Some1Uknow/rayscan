import {
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Code2,
  Coins,
  Cpu,
  ExternalLink,
  Fingerprint,
  KeyRound,
  ListTree,
  Pencil,
  ScrollText,
  User
} from "lucide-react";
import Link from "next/link";
import { getTxDetails } from "../../../lib/api";
import { TxCopyButton } from "./tx-copy-button";

function compactAddress(value: string): string {
  if (value.length <= 24) return value;
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

function formatBlockTime(value: string | number | null): string {
  if (value === null || value === "") return "N/A";
  const n = Number(value);
  if (Number.isNaN(n) || n <= 0) return String(value);
  return new Date(n * 1000).toISOString();
}

function formatBlockTimeHuman(value: string | number | null): string {
  if (value === null || value === "") return "N/A";
  const n = Number(value);
  if (Number.isNaN(n) || n <= 0) return String(value);
  return `${new Date(n * 1000).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC"
  })} UTC`;
}

function formatTimeAgo(value: string | number | null): string {
  if (value === null || value === "") return "N/A";
  const n = Number(value);
  if (Number.isNaN(n) || n <= 0) return "N/A";
  const delta = Math.max(0, Math.floor(Date.now() / 1000) - n);
  if (delta < 60) return `${delta}s ago`;
  const mins = Math.floor(delta / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatLamports(value: string | number | null): string {
  if (value === null || value === "") return "N/A";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  const sol = n / 1_000_000_000;
  return `${sol.toLocaleString("en-US", { maximumFractionDigits: 9 })} SOL`;
}

function formatLamportsSigned(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "N/A";
  const sol = value / 1_000_000_000;
  const sign = sol > 0 ? "+" : "";
  return `${sign}${sol.toLocaleString("en-US", { maximumFractionDigits: 9 })} SOL`;
}

function formatCount(value: string | number | null): string {
  if (value === null || value === "") return "N/A";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString("en-US");
}

function formatLamportsOrDash(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "--";
  return formatLamports(value);
}

function isLikelyAddress(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

export default async function TxPage({
  params
}: {
  params: Promise<{ signature: string }>;
}) {
  const { signature } = await params;
  const tx = await getTxDetails(signature).catch(() => null);

  if (!tx) {
    return (
      <main id="main-content" className="container page-main">
        <section className="panel hero-block">
          <p className="eyebrow">Transaction</p>
          <h1 className="program-title">Not Found</h1>
          <p className="hero-subtitle">
            This signature is not in local index data yet. It may not be finalized or indexed yet.
          </p>
          <div className="hero-actions-row">
            <Link className="ghost-button link-button" href={`/search?q=${encodeURIComponent(signature)}`}>
              Search Similar
            </Link>
            <Link
              className="ghost-button link-button"
              href={`https://explorer.solana.com/tx/${encodeURIComponent(signature)}`}
              target="_blank"
              rel="noreferrer"
            >
              Open In Solana Explorer
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const computeLimit = 200_000;
  const computeUnits = Number(tx.computeUnits ?? 0);
  const computePercent =
    Number.isFinite(computeUnits) && computeUnits > 0
      ? Math.max(1, Math.min(100, Math.round((computeUnits / computeLimit) * 100)))
      : 0;
  const primarySigner = tx.signers[0] ?? null;

  return (
    <main id="main-content" className="container page-main tx-page-main">
      <section className="tx-breadcrumb">
        <Link href="/">Home</Link>
        <ChevronRight size={14} />
        <Link href="/search">Search</Link>
        <ChevronRight size={14} />
        <span>Detail</span>
      </section>

      <section className="panel tx-hero-panel">
        <div className="tx-hero-top">
          <div>
            <p className="eyebrow">Transaction Detail</p>
            <h1 className="tx-page-title">Transaction Overview</h1>
            <p className="hero-subtitle">{tx.action}</p>
          </div>
          <div className="hero-actions-row">
            <span className={tx.success ? "status-chip status-chip-ok" : "status-chip status-chip-bad"}>
              {tx.success ? "Finalized" : "Failed"}
            </span>
            <Link
              className="ghost-button link-button"
              href={`https://explorer.solana.com/tx/${encodeURIComponent(tx.signature)}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={14} />
              &nbsp;External Explorer
            </Link>
          </div>
        </div>

        <div className="tx-signature-card">
          <span className="tx-signature-label">Signature</span>
          <code className="tx-signature-text">{tx.signature}</code>
          <TxCopyButton value={tx.signature} />
        </div>
      </section>

      <section className="panel tx-overview-panel">
        <div className="section-header">
          <h2 className="section-title">Overview</h2>
        </div>
        <div className="tx-overview-grid">
          <div className="tx-overview-row">
            <span className="tx-overview-key">Status</span>
            <div className="tx-overview-value tx-overview-status">
              <span className={tx.success ? "status-chip status-chip-ok" : "status-chip status-chip-bad"}>
                <CheckCircle2 size={14} />
                {tx.success ? "Finalized" : "Failed"}
              </span>
              <div className="tx-status-track">
                <span>
                  <i />
                  Processed
                </span>
                <span>
                  <i />
                  Confirmed
                </span>
                <span className="is-active">
                  <i />
                  Finalized
                </span>
              </div>
            </div>
          </div>

          <div className="tx-overview-row">
            <span className="tx-overview-key">Timestamp</span>
            <div className="tx-overview-value">
              <Clock3 size={14} />
              <span>
                {formatTimeAgo(tx.blockTime)} ({formatBlockTimeHuman(tx.blockTime)})
              </span>
            </div>
          </div>

          <div className="tx-overview-row">
            <span className="tx-overview-key">Slot</span>
            <div className="tx-overview-value">
              <span className="mono-cell">{formatCount(tx.slot)}</span>
            </div>
          </div>

          <div className="tx-overview-row">
            <span className="tx-overview-key">Fee</span>
            <div className="tx-overview-value">
              <Coins size={14} />
              <span className="font-mono">{formatLamports(tx.feeLamports)}</span>
              {tx.priorityFeeLamports !== null ? (
                <span className="tx-muted">Priority: {formatLamports(tx.priorityFeeLamports)}</span>
              ) : null}
            </div>
          </div>

          <div className="tx-overview-row">
            <span className="tx-overview-key">Compute Units</span>
            <div className="tx-overview-value tx-overview-compute">
              <Cpu size={14} />
              <span className="font-mono">
                {formatCount(tx.computeUnits)} / {computeLimit.toLocaleString("en-US")}
              </span>
              <div className="tx-compute-bar">
                <span style={{ width: `${computePercent}%` }} />
              </div>
            </div>
          </div>

          <div className="tx-overview-row tx-overview-row-wide">
            <span className="tx-overview-key">Signer</span>
            <div className="tx-overview-value">
              <User size={14} />
              {primarySigner ? (
                <Link href={`/address/${encodeURIComponent(primarySigner)}`} className="mono-cell">
                  {compactAddress(primarySigner)}
                </Link>
              ) : (
                <span>N/A</span>
              )}
              <span className="network-pill">{tx.signerCount} signer(s)</span>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h2 className="section-title section-title-row">
            <Fingerprint size={16} /> Account Input / Output
          </h2>
          <span className="network-pill">{tx.accountChanges.length} accounts</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Flags</th>
                <th>Pre Balance</th>
                <th>Post Balance</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {tx.accountChanges.length === 0 ? (
                <tr>
                  <td colSpan={5}>No account deltas available.</td>
                </tr>
              ) : (
                tx.accountChanges.slice(0, 20).map((account) => {
                  const delta = account.deltaLamports ?? 0;
                  return (
                    <tr key={account.address}>
                      <td>
                        <Link href={`/address/${encodeURIComponent(account.address)}`} className="mono-cell">
                          {compactAddress(account.address)}
                        </Link>
                      </td>
                      <td>
                        <div className="tx-flag-row">
                          {account.signer ? (
                            <span className="tx-flag tx-flag-signer" title="Signer">
                              <KeyRound size={12} />
                            </span>
                          ) : null}
                          {account.writable ? (
                            <span className="tx-flag tx-flag-write" title="Writable">
                              <Pencil size={12} />
                            </span>
                          ) : null}
                          {!account.signer && !account.writable ? <span className="tx-flag-muted">--</span> : null}
                        </div>
                      </td>
                      <td>{formatLamportsOrDash(account.preLamports)}</td>
                      <td>{formatLamportsOrDash(account.postLamports)}</td>
                      <td className={delta > 0 ? "delta-pos" : delta < 0 ? "delta-neg" : "tx-muted"}>
                        {formatLamportsSigned(account.deltaLamports)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel tx-logs-panel">
        <div className="section-header">
          <h2 className="section-title section-title-row">
            <ListTree size={16} /> Instruction &amp; Inner Logs
          </h2>
          <span className="network-pill">{tx.instructionCount} instructions</span>
        </div>
        <div className="tx-logs-grid">
          <article className="tx-sub-panel">
            <div className="section-header">
              <h3 className="tx-sub-title">
                <Code2 size={14} /> Instruction Trace
              </h3>
              <span className="tx-muted">{tx.instructions.length} rows</span>
            </div>
            {tx.instructions.length === 0 ? (
              <p className="hero-subtitle">No parsed instructions available.</p>
            ) : (
              <div className="tx-trace-list">
                {tx.instructions.map((instruction, index) => (
                  <div key={`${instruction.index}-${instruction.program}`} className="tx-trace-row">
                    <span className="tx-trace-index">{index + 1}</span>
                    <div className="tx-trace-body">
                      <p className="tx-trace-main">
                        Program{" "}
                        {isLikelyAddress(instruction.program) ? (
                          <Link
                            href={`/address/${encodeURIComponent(instruction.program)}`}
                            className="mono-cell"
                          >
                            {instruction.program}
                          </Link>
                        ) : (
                          <span className="mono-cell">{instruction.program}</span>
                        )}{" "}
                        invoke [{instruction.index}]
                      </p>
                      <p className="tx-trace-sub">Type: {instruction.type}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="tx-sub-panel">
            <div className="section-header">
              <h3 className="tx-sub-title">
                <ScrollText size={14} /> Program Logs
              </h3>
              <span className="tx-muted">{tx.logMessages.length} lines</span>
            </div>
            {tx.logMessages.length === 0 ? (
              <p className="hero-subtitle">No log messages were returned for this signature.</p>
            ) : (
              <pre className="tx-log-box tx-log-box-large">
                {tx.logMessages.map((line, index) => `${index + 1}. ${line}`).join("\n")}
              </pre>
            )}
          </article>
        </div>
      </section>

      <section className="grid grid-2">
        <article className="panel">
          <div className="section-header">
            <h2 className="section-title section-title-row">
              <User size={16} /> Signers
            </h2>
            <span className="network-pill">{tx.signers.length} signer(s)</span>
          </div>
          {tx.signers.length === 0 ? (
            <p className="hero-subtitle">Signer metadata is unavailable for this transaction.</p>
          ) : (
            <div className="detail-list">
              {tx.signers.map((signer) => (
                <div key={signer}>
                  <dt>Signer</dt>
                  <dd>
                    <Link href={`/address/${encodeURIComponent(signer)}`} className="mono-cell">
                      {signer}
                    </Link>
                  </dd>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="section-header">
            <h2 className="section-title section-title-row">
              <Check size={16} /> Execution Summary
            </h2>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Status</dt>
              <dd>{tx.success ? "Succeeded" : "Failed"}</dd>
            </div>
            <div>
              <dt>Total Accounts</dt>
              <dd>{tx.balanceSummary.totalAccounts.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Changed Accounts</dt>
              <dd>{tx.balanceSummary.changedAccounts.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Data Source</dt>
              <dd>{tx.source}</dd>
            </div>
            <div>
              <dt>Indexed At</dt>
              <dd>{formatBlockTime(tx.indexedAt)}</dd>
            </div>
          </dl>
        </article>
      </section>
    </main>
  );
}
