import type { VerificationJob } from "./types.js";

const triggerPriority: Record<VerificationJob["triggeredBy"], number> = {
  post_upgrade: 0,
  traffic_hot: 1,
  manual: 2,
  scheduled: 3
};

export class InMemoryPriorityQueue {
  private items: VerificationJob[] = [];

  enqueue(job: VerificationJob): void {
    this.items.push(job);
    this.items.sort((a, b) => {
      const byPriority = triggerPriority[a.triggeredBy] - triggerPriority[b.triggeredBy];
      if (byPriority !== 0) return byPriority;
      return a.enqueuedAtMs - b.enqueuedAtMs;
    });
  }

  dequeue(): VerificationJob | undefined {
    return this.items.shift();
  }

  size(): number {
    return this.items.length;
  }
}

