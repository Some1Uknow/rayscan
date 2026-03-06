import Link from "next/link";
import { getProgramsList } from "../../lib/api";

function statusChipClass(status: string): string {
  if (status === "verified_reproducible") return "status-chip status-chip-ok";
  if (status === "source_provided_not_reproducible") return "status-chip status-chip-warn";
  return "status-chip status-chip-bad";
}

function compactAddress(address: string): string {
  if (address.length <= 24) return address;
  return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

export default async function ProgramsPage() {
  const programs = await getProgramsList(50).catch(() => ({ count: 0, items: [] }));

  return (
    <main id="main-content" className="container page-main">
      <section className="panel route-intro">
        <p className="eyebrow">Programs</p>
        <h1 className="program-title">Indexed Program Directory</h1>
        <p className="hero-subtitle">
          Upgradeability and verification status for executable Solana programs.
        </p>
      </section>

      <section className="panel">
        <div className="section-header">
          <h2 className="section-title">Program Table</h2>
          <span className="network-pill">{programs.count} rows</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Program</th>
                <th>Verification</th>
                <th>Last Seen Slot</th>
                <th>Upgradeable</th>
                <th>Checked At</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {programs.items.length === 0 ? (
                <tr>
                  <td colSpan={6}>No programs indexed yet.</td>
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
                      <td>{program.is_upgradeable ? "true" : "false"}</td>
                      <td>{program.last_checked_at ?? "N/A"}</td>
                      <td>{program.source_repo_url ?? "N/A"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
