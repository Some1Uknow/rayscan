import Fastify from "fastify";
import { z } from "zod";
import { InMemoryPriorityQueue } from "./queue.js";
import { assertTransition } from "./state-machine.js";
import { closeDb } from "./db.js";
import { env } from "./env.js";
import {
  insertRun,
  updateRunStatus,
  upsertProgram,
  upsertVerification
} from "./repository.js";
import { runVerification } from "./runner.js";
import type { RunStatus, VerificationJob } from "./types.js";

export function nowMs(): number {
  return Date.now();
}

async function processJob(job: VerificationJob): Promise<void> {
  try {
    let status: RunStatus = "queued";
    await upsertProgram(job);
    const runId = await insertRun(job);
    console.log(`[verifier] queued program=${job.programId} trigger=${job.triggeredBy}`);

    assertTransition(status, "running");
    status = "running";
    const startedAt = nowMs();
    await updateRunStatus(runId, "running", {
      startedAt: new Date(),
      queueLatencyMs: nowMs() - job.enqueuedAtMs
    });

    try {
      const { result, logs } = await runVerification(job);
      assertTransition(status, "succeeded");
      status = "succeeded";
      const durationMs = nowMs() - startedAt;
      await upsertVerification(job, result);
      await updateRunStatus(runId, "succeeded", {
        finishedAt: new Date(),
        durationMs,
        logs
      });
      console.log(
        `[verifier] succeeded program=${job.programId} status=${result.verificationStatus} duration_ms=${durationMs}`
      );
      // TODO: publish program.verification.completed event
    } catch (error) {
      assertTransition(status, "failed");
      status = "failed";
      const durationMs = nowMs() - startedAt;
      await updateRunStatus(runId, "failed", {
        finishedAt: new Date(),
        durationMs,
        errorCode: "runner_error",
        errorMessage: String(error)
      });
      console.error(
        `[verifier] failed program=${job.programId} duration_ms=${durationMs} error=${String(error)}`
      );
    }
  } catch (error) {
    console.error(`[verifier] pre-run failure program=${job.programId} error=${String(error)}`);
  }
}

async function workerLoop(queue: InMemoryPriorityQueue): Promise<void> {
  for (;;) {
    const next = queue.dequeue();
    if (!next) {
      await new Promise((resolve) => setTimeout(resolve, env.VERIFIER_LOOP_INTERVAL_MS));
      continue;
    }
    await processJob(next);
  }
}

async function main(): Promise<void> {
  const queue = new InMemoryPriorityQueue();
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({
    ok: true,
    queueDepth: queue.size()
  }));

  app.post("/internal/v1/verifications/:programId/run", async (request, reply) => {
    const params = z.object({ programId: z.string().min(32).max(64) }).parse(request.params);
    const body = z
      .object({
        triggeredBy: z
          .enum(["scheduled", "manual", "traffic_hot", "post_upgrade"])
          .default("manual"),
        sourceRepoUrl: z.string().url().optional(),
        sourceCommit: z.string().min(1).optional(),
        sourceSubdir: z.string().min(1).optional(),
        toolchainDigest: z.string().min(1).optional()
      })
      .default({})
      .parse(request.body ?? {});

    const job: VerificationJob = {
      programId: params.programId,
      triggeredBy: body.triggeredBy,
      sourceRepoUrl: body.sourceRepoUrl,
      sourceCommit: body.sourceCommit,
      sourceSubdir: body.sourceSubdir,
      toolchainDigest: body.toolchainDigest,
      enqueuedAtMs: nowMs()
    };
    queue.enqueue(job);

    return reply.code(202).send({
      queued: true,
      programId: params.programId,
      queueDepth: queue.size()
    });
  });

  void workerLoop(queue);
  await app.listen({ port: env.VERIFIER_PORT, host: "0.0.0.0" });

  const shutdown = async (code: number) => {
    await app.close();
    await closeDb();
    process.exit(code);
  };

  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));
}

main().catch((error) => {
  console.error(`[verifier] fatal error: ${String(error)}`);
  closeDb()
    .catch(() => undefined)
    .finally(() => process.exit(1));
});
