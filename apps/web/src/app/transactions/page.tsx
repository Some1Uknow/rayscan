import Link from "next/link";
import { getTransactionsList } from "../../lib/api";

function compactSignature(signature: string): string {
  if (signature.length <= 24) return signature;
  return `${signature.slice(0, 8)}...${signature.slice(-8)}`;
}

function formatBlockTime(value: string | number | null): string {
  if (value === null || value === "") return "N/A";
  const n = Number(value);
  if (Number.isNaN(n) || n <= 0) return String(value);
  return new Date(n * 1000).toISOString();
}

export default async function TransactionsPage() {
  const txs = await getTransactionsList(50).catch(() => ({ count: 0, items: [] }));

  return (
    <main id="main-content" className="container page-main">
      <section className="panel route-intro">
        <p className="eyebrow">Transactions</p>
        <h1 className="program-title">Latest Indexed Signatures</h1>
        <p className="hero-subtitle">
          Canonical transaction index with status, fee, compute, and source metadata.
        </p>
      </section>

      <section className="panel">
        <div className="section-header">
          <h2 className="section-title">Transaction Table</h2>
          <span className="network-pill">{txs.count} rows</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Signature</th>
                <th>Slot</th>
                <th>Time</th>
                <th>Status</th>
                <th>Fee</th>
                <th>Compute</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {txs.items.length === 0 ? (
                <tr>
                  <td colSpan={7}>No transactions indexed yet.</td>
                </tr>
              ) : (
                txs.items.map((tx) => (
                  <tr key={tx.signature}>
                    <td>
                      <Link className="mono-cell" href={`/tx/${tx.signature}`}>
                        {compactSignature(tx.signature)}
                      </Link>
                    </td>
                    <td>{tx.slot}</td>
                    <td>{formatBlockTime(tx.block_time)}</td>
                    <td>
                      <span className={tx.success ? "status-chip status-chip-ok" : "status-chip status-chip-bad"}>
                        {tx.success ? "succeeded" : "failed"}
                      </span>
                    </td>
                    <td>{tx.fee_lamports}</td>
                    <td>{tx.compute_units ?? "N/A"}</td>
                    <td>{tx.source}</td>
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
