import type { RunStatus } from "./types.js";

const allowed: Record<RunStatus, RunStatus[]> = {
  queued: ["running", "cancelled"],
  running: ["succeeded", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: []
};

export function assertTransition(from: RunStatus, to: RunStatus): void {
  if (!allowed[from].includes(to)) {
    throw new Error(`Invalid run status transition: ${from} -> ${to}`);
  }
}

