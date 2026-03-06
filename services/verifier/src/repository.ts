import { pool } from "./db.js";
import type { RunStatus, VerificationJob, VerificationResult } from "./types.js";

export async function upsertProgram(job: VerificationJob, slot = 0): Promise<void> {
  const query = `
    INSERT INTO programs (
      program_id,
      loader_program_id,
      last_seen_slot
    )
    VALUES ($1, $2, $3)
    ON CONFLICT (program_id)
    DO UPDATE SET
      last_seen_slot = GREATEST(programs.last_seen_slot, EXCLUDED.last_seen_slot),
      updated_at = NOW();
  `;
  await pool.query(query, [job.programId, "BPFLoaderUpgradeab1e11111111111111111111111", slot]);
}

export async function insertRun(job: VerificationJob): Promise<number> {
  const query = `
    INSERT INTO verification_runs (
      program_id,
      triggered_by,
      run_status,
      toolchain_digest,
      source_repo_url,
      source_commit
    )
    VALUES ($1, $2, 'queued', $3, $4, $5)
    RETURNING run_id;
  `;
  const result = await pool.query(query, [
    job.programId,
    job.triggeredBy,
    job.toolchainDigest ?? null,
    job.sourceRepoUrl ?? null,
    job.sourceCommit ?? null
  ]);
  return Number(result.rows[0].run_id);
}

export async function updateRunStatus(
  runId: number,
  status: RunStatus,
  fields: {
    startedAt?: Date;
    finishedAt?: Date;
    queueLatencyMs?: number;
    durationMs?: number;
    errorCode?: string;
    errorMessage?: string;
    logs?: string;
  } = {}
): Promise<void> {
  const query = `
    UPDATE verification_runs
    SET
      run_status = $2,
      started_at = COALESCE($3, started_at),
      finished_at = COALESCE($4, finished_at),
      queue_latency_ms = COALESCE($5, queue_latency_ms),
      duration_ms = COALESCE($6, duration_ms),
      error_code = COALESCE($7, error_code),
      error_message = COALESCE($8, error_message),
      logs = COALESCE($9, logs)
    WHERE run_id = $1;
  `;
  await pool.query(query, [
    runId,
    status,
    fields.startedAt ?? null,
    fields.finishedAt ?? null,
    fields.queueLatencyMs ?? null,
    fields.durationMs ?? null,
    fields.errorCode ?? null,
    fields.errorMessage ?? null,
    fields.logs ?? null
  ]);
}

export async function upsertVerification(
  job: VerificationJob,
  result: VerificationResult
): Promise<void> {
  const query = `
    INSERT INTO program_verifications (
      program_id,
      verification_status,
      source_repo_url,
      source_commit,
      source_subdir,
      build_image,
      verifier_version,
      expected_program_hash,
      onchain_program_hash,
      diff_summary,
      verified_at,
      last_checked_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      CASE WHEN $2 = 'verified_reproducible' THEN NOW() ELSE NULL END,
      NOW()
    )
    ON CONFLICT (program_id)
    DO UPDATE SET
      verification_status = EXCLUDED.verification_status,
      source_repo_url = EXCLUDED.source_repo_url,
      source_commit = EXCLUDED.source_commit,
      source_subdir = EXCLUDED.source_subdir,
      build_image = EXCLUDED.build_image,
      verifier_version = EXCLUDED.verifier_version,
      expected_program_hash = EXCLUDED.expected_program_hash,
      onchain_program_hash = EXCLUDED.onchain_program_hash,
      diff_summary = EXCLUDED.diff_summary,
      verified_at = EXCLUDED.verified_at,
      last_checked_at = EXCLUDED.last_checked_at,
      updated_at = NOW();
  `;

  await pool.query(query, [
    job.programId,
    result.verificationStatus,
    job.sourceRepoUrl ?? null,
    job.sourceCommit ?? null,
    job.sourceSubdir ?? null,
    result.buildImage ?? null,
    result.verifierVersion ?? null,
    result.expectedProgramHash ?? null,
    result.onchainProgramHash ?? null,
    result.diffSummary ?? null
  ]);
}

