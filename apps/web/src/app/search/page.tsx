import Link from "next/link";
import { redirect } from "next/navigation";
import { searchExplorer } from "../../lib/api";

function classifyFallback(q: string): "tx" | "address_or_mint" | "unknown" {
  if (!q) return "unknown";
  if (q.length >= 80) return "tx";
  if (q.length >= 32) return "address_or_mint";
  return "unknown";
}

function normalizeExplorerHref(href: string): string {
  if (href.startsWith("/program/")) {
    return href.replace("/program/", "/address/");
  }
  return href;
}

function looksLikeTxSignature(value: string): boolean {
  // Solana signatures are base58 and typically ~87-88 chars.
  return /^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(value);
}

export default async function SearchPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  if (q && looksLikeTxSignature(q)) {
    redirect(`/tx/${encodeURIComponent(q)}`);
  }

  const result = q ? await searchExplorer(q, 12).catch(() => null) : null;
  const fallbackKind = classifyFallback(q);

  return (
    <main id="main-content" className="container page-main">
      <section className="panel hero-block">
        <p className="eyebrow">Search</p>
        <h1 className="hero-title">Find transactions, addresses, and token mints.</h1>
        <p className="hero-subtitle">
          Paste a signature or address to jump directly into indexed explorer routes.
        </p>
        <div className="hero-actions-row">
          <Link className="ghost-button link-button" href="/addresses">
            Addresses
          </Link>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <h2 className="section-title">Query Result</h2>
          <span className="network-pill">{q ? `${result?.count ?? 0} matches` : "empty"}</span>
        </div>

        {!q ? (
          <p className="hero-subtitle">Enter a query from the top search box to get started.</p>
        ) : result?.bestMatch ? (
          <div className="search-results-stack">
            <article className="search-best panel">
              <p className="stat-label">Best Match</p>
              <h3 className="feature-title">{result.bestMatch.title}</h3>
              <p className="feature-copy">
                {result.bestMatch.subtitle} • confidence {(result.bestMatch.confidence * 100).toFixed(0)}%
              </p>
              <Link className="wallet-button link-button" href={normalizeExplorerHref(result.bestMatch.href)}>
                Open detail page
              </Link>
            </article>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Identifier</th>
                    <th>Match</th>
                    <th>Confidence</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {result.matches.map((match) => (
                    <tr key={`${match.kind}:${match.id}`}>
                      <td>
                        <span className="network-pill">{match.kind}</span>
                      </td>
                      <td className="mono-cell">{match.id}</td>
                      <td>{match.exact ? "exact" : "prefix"}</td>
                      <td>{(match.confidence * 100).toFixed(0)}%</td>
                      <td>
                        <Link className="ghost-button link-button" href={normalizeExplorerHref(match.href)}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="search-results-stack">
            <p className="hero-subtitle">
              No indexed matches yet for <strong>{q}</strong>. You can still open fallback routes.
            </p>
            <article className="panel">
              <h3 className="feature-title">Open As Address / Mint</h3>
              <p className="feature-copy">{q}</p>
              <Link className="ghost-button link-button" href={`/address/${q}`}>
                Go to Address Page
              </Link>
            </article>
            <span className="network-pill">fallback: {fallbackKind.replaceAll("_", " ")}</span>
          </div>
        )}
      </section>
    </main>
  );
}
