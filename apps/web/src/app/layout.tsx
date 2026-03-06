import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { NavLink } from "./nav-link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rayscan",
  description: "General-purpose Solana explorer with Raydium-first depth"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div className="bg-orb bg-orb-a" aria-hidden />
        <div className="bg-orb bg-orb-b" aria-hidden />

        <header className="site-header">
          <div className="container header-inner">
            <Link className="brand" href="/">
              <span className="brand-mark" aria-hidden>
                R
              </span>
              <span>Rayscan</span>
            </Link>

            <nav aria-label="Primary" className="header-nav">
              <NavLink href="/" label="Overview" />
              <NavLink href="/transactions" label="Transactions" activePrefixes={["/tx"]} />
              <NavLink href="/programs" label="Programs" activePrefixes={["/program"]} />
            </nav>

            <form action="/search" className="header-search" method="get" role="search">
              <label className="sr-only" htmlFor="global-search">
                Search signature, address, or program
              </label>
              <input
                autoComplete="off"
                id="global-search"
                name="q"
                placeholder="Search signature, address, or program…"
                spellCheck={false}
                type="text"
              />
              <button type="submit">Go</button>
            </form>

            <div className="header-actions">
              <span className="network-pill">Mainnet</span>
            </div>
          </div>
        </header>

        {children}
      </body>
    </html>
  );
}
