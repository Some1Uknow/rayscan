"use client";

import { Pause, Play, Radio } from "lucide-react";
import Link from "next/link";
import { startTransition, useEffect, useRef, useState } from "react";
import { getPublicApiUrl } from "../lib/env";
import type { LiveTransactionsResponse } from "../lib/api";

const API_URL = getPublicApiUrl();
const LIVE_FEED_LIMIT = 10;

function compactAddress(value: string): string {
  if (value.length <= 24) return value;
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

function formatAgo(value: string | number | null): string {
  if (value === null || value === "") return "N/A";
  const ts = Number(value);
  if (Number.isNaN(ts) || ts <= 0) return String(value);
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

type LatestTransactionsFeedProps = {
  initialItems: LiveTransactionsResponse["items"];
};

export function LatestTransactionsFeed({ initialItems }: LatestTransactionsFeedProps) {
  const [items, setItems] = useState(initialItems);
  const [isPaused, setIsPaused] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [highlightedSignature, setHighlightedSignature] = useState<string | null>(initialItems[0]?.signature ?? null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applySnapshotRef = useRef<(payload: LiveTransactionsResponse) => void>(() => {});

  applySnapshotRef.current = (payload: LiveTransactionsResponse) => {
    startTransition(() => {
      const nextItems = payload.items.slice(0, LIVE_FEED_LIMIT);
      setItems((currentItems) => {
        const previousTop = currentItems[0]?.signature ?? null;
        const nextTop = nextItems[0]?.signature ?? null;

        if (nextTop && nextTop !== previousTop) {
          setHighlightedSignature(nextTop);
          if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
          highlightTimeoutRef.current = setTimeout(() => {
            setHighlightedSignature((current) => (current === nextTop ? null : current));
          }, 1800);
        }

        return nextItems;
      });
      setIsConnected(true);
    });
  };

  useEffect(() => {
    if (isPaused) {
      setIsConnected(false);
      return;
    }

    let isActive = true;
    let source: EventSource | null = null;

    const connect = () => {
      source = new EventSource(`${API_URL}/v1/transactions/live/stream?limit=${LIVE_FEED_LIMIT}&interval_ms=2000`);

      source.addEventListener("snapshot", (event) => {
        if (!isActive) return;
        const payload = JSON.parse((event as MessageEvent<string>).data) as LiveTransactionsResponse;
        applySnapshotRef.current(payload);
      });

      source.addEventListener("stream_error", () => {
        if (!isActive) return;
        setIsConnected(false);
      });

      source.onerror = () => {
        if (!isActive) return;
        setIsConnected(false);
      };

      source.onopen = () => {
        if (!isActive) return;
        setIsConnected(true);
      };
    };

    connect();

    return () => {
      isActive = false;
      setIsConnected(false);
      source?.close();
    };
  }, [isPaused]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

  return (
    <section className="panel">
      <div className="section-header live-feed-header">
        <h2 className="section-title section-title-row">
          <Radio size={16} /> Latest Transactions
        </h2>
        <div className="live-feed-actions">
          <span className={`live-feed-pill ${isPaused ? "live-feed-pill-paused" : isConnected ? "" : "live-feed-pill-idle"}`}>
            <span className="live-feed-dot" aria-hidden />
            {isPaused ? "Paused" : isConnected ? "Live feed" : "Reconnecting"}
          </span>
          <button
            className="ghost-button live-feed-toggle"
            onClick={() => {
              setIsPaused((current) => !current);
            }}
            type="button"
          >
            {isPaused ? <Play size={15} /> : <Pause size={15} />}
            {isPaused ? "Resume" : "Pause"}
          </button>
          <Link className="network-pill" href="/search">
            Open Search
          </Link>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Signature</th>
              <th>Time</th>
              <th>Block</th>
              <th>Action</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5}>No recent transactions available.</td>
              </tr>
            ) : (
              items.map((tx) => (
                <tr
                  key={tx.signature}
                  className={tx.signature === highlightedSignature ? "tx-live-row-active" : undefined}
                >
                  <td>
                    <Link className="mono-cell" href={`/tx/${tx.signature}`}>
                      {compactAddress(tx.signature)}
                    </Link>
                  </td>
                  <td>{formatAgo(tx.block_time)}</td>
                  <td>{tx.slot}</td>
                  <td>{tx.action}</td>
                  <td>
                    <span className={tx.success ? "status-chip status-chip-ok" : "status-chip status-chip-bad"}>
                      {tx.success ? "succeeded" : "failed"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
