import {
  Blocks,
  CheckCircle2,
  Clock3,
  Coins,
  Cpu,
  ExternalLink,
  Fingerprint,
  ListTree,
  ScrollText,
  User
} from "lucide-react";
import Link from "next/link";
import { getTxDetails } from "../../../lib/api";

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

  const changedAccounts = tx.accountChanges.filter((account) => (account.deltaLamports ?? 0) !== 0);

  return (
    <main id="main-content" className="container page-main">
      <section className="panel hero-block">
        <p className="eyebrow">Transaction Detail</p>
        <h1 className="program-title">Transaction</h1>
        <p className="hero-subtitle">{tx.action} • signature-level execution trace</p>
        <div className="tx-signature-row">
          <div className="hash-pill">{tx.signature}</div>
          <div className="hero-actions-row">
            <span className={tx.success ? "status-chip status-chip-ok" : "status-chip status-chip-bad"}>
              {tx.success ? "succeeded" : "failed"}
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
      </section>

      <section className="tx-meta-grid">
        <article className="panel tx-metric">
          <p className="tx-metric-top">
            <Blocks size={14} /> Slot
          </p>
          <p className="stat-value">{tx.slot ?? "N/A"}</p>
          <p className="stat-detail">Source: {tx.source}</p>
        </article>

        <article className="panel tx-metric">
          <p className="tx-metric-top">
            <Clock3 size={14} /> Timestamp
          </p>
          <p className="stat-value">{formatBlockTime(tx.blockTime)}</p>
          <p className="stat-detail">Indexed at {tx.indexedAt}</p>
        </article>

        <article className="panel tx-metric">
          <p className="tx-metric-top">
            <Coins size={14} /> Fee
          </p>
          <p className="stat-value">{formatLamports(tx.feeLamports)}</p>
          <p className="stat-detail">Priority: {formatLamports(tx.priorityFeeLamports)}</p>
        </article>

        <article className="panel tx-metric">
          <p className="tx-metric-top">
            <Cpu size={14} /> Compute Units
          </p>
          <p className="stat-value">{tx.computeUnits ?? "N/A"}</p>
          <p className="stat-detail">Instruction count: {tx.instructionCount}</p>
        </article>

        <article className="panel tx-metric">
          <p className="tx-metric-top">
            <ListTree size={14} /> Instructions
          </p>
          <p className="stat-value">{tx.instructionCount}</p>
          <p className="stat-detail">Action: {tx.action}</p>
        </article>

        <article className="panel tx-metric">
          <p className="tx-metric-top">
            <User size={14} /> Signers
          </p>
          <p className="stat-value">{tx.signerCount}</p>
          <p className="stat-detail">Changed accounts: {tx.balanceSummary.changedAccounts}</p>
        </article>
      </section>

      <section className="grid grid-2">
        <article className="panel">
          <div className="section-header">
            <h2 className="section-title section-title-row">
              <ListTree size={16} /> Instruction Trace
            </h2>
            <span className="network-pill">{tx.instructionCount} rows</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Program</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {tx.instructions.length === 0 ? (
                  <tr>
                    <td colSpan={3}>No parsed instructions available.</td>
                  </tr>
                ) : (
                  tx.instructions.map((instruction) => (
                    <tr key={`${instruction.index}-${instruction.program}`}> 
                      <td>{instruction.index}</td>
                      <td className="mono-cell">{instruction.program}</td>
                      <td>{instruction.type}</td>
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
              <Fingerprint size={16} /> Account Balance Changes
            </h2>
            <span className="network-pill">{changedAccounts.length} changed</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Flags</th>
                  <th>Pre</th>
                  <th>Post</th>
                  <th>Delta</th>
                </tr>
              </thead>
              <tbody>
                {tx.accountChanges.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No account deltas available.</td>
                  </tr>
                ) : (
                  tx.accountChanges.slice(0, 14).map((account) => (
                    <tr key={account.address}>
                      <td className="mono-cell">{compactAddress(account.address)}</td>
                      <td>
                        {account.signer ? "S" : "-"}
                        {account.writable ? " / W" : ""}
                      </td>
                      <td>{formatLamports(account.preLamports)}</td>
                      <td>{formatLamports(account.postLamports)}</td>
                      <td className={(account.deltaLamports ?? 0) >= 0 ? "delta-pos" : "delta-neg"}>
                        {formatLamportsSigned(account.deltaLamports)}
                      </td>
                    </tr>
                  ))
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
              <User size={16} /> Signer Set
            </h2>
            <span className="network-pill">{tx.signers.length} signers</span>
          </div>
          {tx.signers.length === 0 ? (
            <p className="hero-subtitle">Signer metadata is unavailable for this transaction.</p>
          ) : (
            <div className="detail-list">
              {tx.signers.map((signer) => (
                <div key={signer}>
                  <dt>Signer</dt>
                  <dd className="mono-cell">{signer}</dd>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="section-header">
            <h2 className="section-title section-title-row">
              {tx.success ? <CheckCircle2 size={16} /> : <ScrollText size={16} />} Execution Summary
            </h2>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Status</dt>
              <dd>{tx.success ? "succeeded" : "failed"}</dd>
            </div>
            <div>
              <dt>Total Accounts</dt>
              <dd>{tx.balanceSummary.totalAccounts}</dd>
            </div>
            <div>
              <dt>Changed Accounts</dt>
              <dd>{tx.balanceSummary.changedAccounts}</dd>
            </div>
            <div>
              <dt>Signature</dt>
              <dd className="mono-cell">{tx.signature}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="panel">
        <div className="section-header">
          <h2 className="section-title section-title-row">
            <ScrollText size={16} /> Program Logs
          </h2>
          <span className="network-pill">{tx.logMessages.length} lines</span>
        </div>
        {tx.logMessages.length === 0 ? (
          <p className="hero-subtitle">No log messages were returned for this signature.</p>
        ) : (
          <pre className="tx-log-box">{tx.logMessages.join("\n")}</pre>
        )}
      </section>
    </main>
  );
}
