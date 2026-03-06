import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
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
              <span className="brand-text">RAYSCAN</span>
            </Link>

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
