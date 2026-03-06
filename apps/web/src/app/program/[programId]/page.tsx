import Link from "next/link";
import { notFound } from "next/navigation";
import { getProgramDetails, getProgramVerification } from "../../../lib/api";

function statusChipClass(status: string): string {
  if (status === "verified_reproducible") return "status-chip status-chip-ok";
  if (status === "source_provided_not_reproducible") return "status-chip status-chip-warn";
  return "status-chip status-chip-bad";
}

function formatMaybe(value: string | number | boolean | null): string {
  if (value === null || value === "") return "N/A";
  return String(value);
}

function formatStatus(status: string): string {
  return status.replaceAll("_", " ");
}

function runStatusChipClass(status: string): string {
  if (status === "succeeded") return "status-chip status-chip-ok";
  if (status === "queued" || status === "running") return "status-chip status-chip-warn";
  return "status-chip status-chip-bad";
}

export default async function ProgramPage({
  params
}: {
  params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;

  const details = await getProgramDetails(programId).catch(() => null);
  if (!details) {
    notFound();
  }

  const verification = await getProgramVerification(programId).catch(() => ({
    programId,
    summary: null,
    runs: []
  }));

  return (
    <main id="main-content" className="container page-main">
      <section className="panel program-hero">
        <div>
          <p className="eyebrow">Program</p>
          <h1 className="program-title">{details.programId}</h1>
          <p className="hero-subtitle">
            Program account overview with runtime metadata and verification records.
          </p>
        </div>
        <div className="hero-actions-stack">
          <span className={statusChipClass(details.verification.status)}>
            {formatStatus(details.verification.status)}
          </span>
          <Link
            className="ghost-button"
            href={`https://explorer.solana.com/address/${details.programId}`}
            target="_blank"
            rel="noreferrer"
          >
            Open In Solana Explorer
          </Link>
        </div>
      </section>

      <section className="stat-grid">
        <article className="panel stat-card">
          <p className="stat-label">Verification Checked</p>
          <p className="stat-value">{formatMaybe(details.verification.checkedAt)}</p>
          <p className="stat-detail">Latest verification check timestamp.</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Verification Commit</p>
          <p className="stat-value">{formatMaybe(details.verification.sourceCommit)}</p>
          <p className="stat-detail">Source commit recorded for verification.</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Last Seen Slot</p>
          <p className="stat-value">{formatMaybe(details.lastSeenSlot)}</p>
          <p className="stat-detail">Latest indexed slot for this program.</p>
        </article>
        <article className="panel stat-card">
          <p className="stat-label">Upgradeable</p>
          <p className="stat-value">{formatMaybe(details.isUpgradeable)}</p>
          <p className="stat-detail">True if upgrade authority still exists.</p>
        </article>
      </section>

      <section className="grid grid-2">
        <article className="panel">
          <h2 className="section-title">Verification</h2>
          <dl className="detail-list">
            <div>
              <dt>Status</dt>
              <dd>{formatStatus(details.verification.status)}</dd>
            </div>
            <div>
              <dt>Repo</dt>
              <dd>{formatMaybe(details.verification.sourceRepoUrl)}</dd>
            </div>
            <div>
              <dt>Commit</dt>
              <dd>{formatMaybe(details.verification.sourceCommit)}</dd>
            </div>
            <div>
              <dt>Diff Summary</dt>
              <dd>{formatMaybe(details.verification.diffSummary)}</dd>
            </div>
            <div>
              <dt>Last Checked</dt>
              <dd>{formatMaybe(details.verification.checkedAt)}</dd>
            </div>
          </dl>
        </article>

        <article className="panel">
          <h2 className="section-title">Program Metadata</h2>
          <dl className="detail-list">
            <div>
              <dt>Loader</dt>
              <dd>{formatMaybe(details.loaderProgramId)}</dd>
            </div>
            <div>
              <dt>Programdata Address</dt>
              <dd>{formatMaybe(details.programdataAddress)}</dd>
            </div>
            <div>
              <dt>Upgrade Authority</dt>
              <dd>{formatMaybe(details.upgradeAuthority)}</dd>
            </div>
            <div>
              <dt>Last Upgrade Slot</dt>
              <dd>{formatMaybe(details.lastUpgradeSlot)}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="grid grid-2">
        <article className="panel">
          <h2 className="section-title">Verification Evidence</h2>
          {!verification.summary ? (
            <p className="hero-subtitle">No verification evidence available yet.</p>
          ) : (
            <dl className="detail-list">
              <div>
                <dt>Verifier Version</dt>
                <dd>{formatMaybe(verification.summary.verifier_version)}</dd>
              </div>
              <div>
                <dt>Build Image</dt>
                <dd>{formatMaybe(verification.summary.build_image)}</dd>
              </div>
              <div>
                <dt>Expected Hash</dt>
                <dd>{formatMaybe(verification.summary.expected_program_hash)}</dd>
              </div>
              <div>
                <dt>Onchain Hash</dt>
                <dd>{formatMaybe(verification.summary.onchain_program_hash)}</dd>
              </div>
            </dl>
          )}
        </article>
        <article className="panel">
          <h2 className="section-title">Program Profile</h2>
          <p className="hero-subtitle">
            Core program attributes from indexed chain data.
          </p>
          <dl className="detail-list">
            <div>
              <dt>Deploy Slot</dt>
              <dd>{formatMaybe(details.deploySlot)}</dd>
            </div>
            <div>
              <dt>Upgradeable</dt>
              <dd>{formatMaybe(details.isUpgradeable)}</dd>
            </div>
            <div>
              <dt>Verification Checks</dt>
              <dd>{verification.runs.length}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="panel">
        <div className="section-header">
          <h2 className="section-title">Verification Activity</h2>
          <span className="network-pill">{verification.runs.length} runs</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Check ID</th>
                <th>Status</th>
                <th>Triggered By</th>
                <th>Duration</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              {verification.runs.length === 0 ? (
                <tr>
                  <td colSpan={5}>No verification checks yet.</td>
                </tr>
              ) : (
                verification.runs.map((run) => (
                  <tr key={run.run_id}>
                    <td>{run.run_id}</td>
                    <td>
                      <span className={runStatusChipClass(run.run_status)}>{run.run_status}</span>
                    </td>
                    <td>{run.triggered_by}</td>
                    <td>{formatMaybe(run.duration_ms)}</td>
                    <td>{run.created_at}</td>
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
