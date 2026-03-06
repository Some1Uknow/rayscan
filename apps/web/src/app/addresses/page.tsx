import Link from "next/link";
import { getAddressesList } from "../../lib/api";

function compactAddress(address: string): string {
  if (address.length <= 24) return address;
  return `${address.slice(0, 8)}...${address.slice(-8)}`;
}

export default async function AddressesPage() {
  const addresses = await getAddressesList(50).catch(() => ({ count: 0, items: [] }));

  return (
    <main id="main-content" className="container page-main">
      <section className="panel route-intro">
        <p className="eyebrow">Addresses</p>
        <h1 className="program-title">Indexed Address Profiles</h1>
        <p className="hero-subtitle">
          Address-level activity profile based on the current indexed dataset.
        </p>
      </section>

      <section className="panel">
        <div className="section-header">
          <h2 className="section-title">Address Table</h2>
          <span className="network-pill">{addresses.count} rows</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Address</th>
                <th>Last Seen Slot</th>
                <th>First Seen Slot</th>
                <th>Verifier Runs</th>
                <th>Updated At</th>
              </tr>
            </thead>
            <tbody>
              {addresses.items.length === 0 ? (
                <tr>
                  <td colSpan={5}>No address profiles indexed yet.</td>
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
                    <td>{address.first_seen_slot ?? "N/A"}</td>
                    <td>{address.verifier_run_count}</td>
                    <td>{address.updated_at}</td>
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
