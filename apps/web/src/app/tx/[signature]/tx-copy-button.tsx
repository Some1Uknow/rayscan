"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function TxCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button type="button" className="tx-copy-button" onClick={handleCopy} aria-label="Copy signature">
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}
