import Link from "next/link";
import { getAddressDetails, getProgramDetails } from "../../../lib/api";

function formatMaybe(value: string | number | null): string {
  if (value === null || value === "") return "N/A";
  return String(value);
}

export default async function AddressPage({
  params
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const [details, maybeProgram] = await Promise.all([
    getAddressDetails(address).catch(() => null),
    getProgramDetails(address).catch(() => null)
  ]);

  return (
    <main id="main-content" className="container page-main">
      <section className="panel program-hero">
        <div>
          <p className="eyebrow">Address</p>
          <h1 className="program-title">{address}</h1>
          <p className="hero-subtitle">Address profile, activity footprint, and linked trust context.</p>
        </div>
        <div className="hero-actions-stack">
          <span className={maybeProgram ? "status-chip status-chip-warn" : "status-chip status-chip-ok"}>
            {maybeProgram ? "program candidate" : "wallet/account"}
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
          <p className="stat-label">Address Type</p>
          <p className="stat-value">{maybeProgram ? "Program Candidate" : "Wallet / Account"}</p>
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
              <dt>Updated At</dt>
              <dd>{details?.profile?.updated_at ?? "N/A"}</dd>
            </div>
          </dl>
        </article>
        <article className="panel">
          <h2 className="section-title">Program Signal</h2>
          {!maybeProgram ? (
            <p className="hero-subtitle">
              This address is not currently indexed as a known program record.
            </p>
          ) : (
            <dl className="detail-list">
              <div>
                <dt>Verification Status</dt>
                <dd>{maybeProgram.verification.status.replaceAll("_", " ")}</dd>
              </div>
              <div>
                <dt>Loader Program</dt>
                <dd>{maybeProgram.loaderProgramId}</dd>
              </div>
              <div>
                <dt>Program View</dt>
                <dd>
                  <Link href={`/program/${address}`}>Open program detail page</Link>
                </dd>
              </div>
            </dl>
          )}
        </article>
      </section>

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
                  <td colSpan={3}>
                    No rows yet. Try program page verification on{" "}
                    <Link href="/program/Example11111111111111111111111111111111111">
                      sample program
                    </Link>
                    .
                  </td>
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
