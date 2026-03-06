"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  programId: string;
};

export function RunVerificationButton({ programId }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const onRun = () => {
    setMessage("");
    startTransition(async () => {
      try {
        const res = await fetch(`/api/verifications/${programId}/run`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ triggeredBy: "manual" })
        });

        if (!res.ok) {
          setMessage("Verification queue request failed.");
          return;
        }

        setMessage("Verification queued. Refreshing data...");
        setTimeout(() => {
          router.refresh();
        }, 1200);
      } catch {
        setMessage("Could not reach verifier service.");
      }
    });
  };

  return (
    <div className="run-action">
      <button className="wallet-button" type="button" disabled={isPending} onClick={onRun}>
        {isPending ? "Queueing..." : "Run Verification"}
      </button>
      <p aria-live="polite" className="action-message">
        {message}
      </p>
    </div>
  );
}

