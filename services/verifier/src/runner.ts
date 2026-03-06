import { spawn } from "node:child_process";
import { env } from "./env.js";
import type { VerificationJob, VerificationResult } from "./types.js";

type RunnerOutput = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

function executeCommand(bin: string, args: string[]): Promise<RunnerOutput> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let settled = false;
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const maxLogBytes = env.VERIFIER_LOG_MAX_BYTES;

    const trimTail = (value: string): string => {
      if (value.length <= maxLogBytes) return value;
      return value.slice(value.length - maxLogBytes);
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = trimTail(stdout + chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = trimTail(stderr + chunk.toString("utf8"));
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, env.VERIFIER_JOB_TIMEOUT_MS);

    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        exitCode,
        stdout,
        stderr,
        timedOut
      });
    };

    child.on("close", (code) => {
      finish(code ?? 1);
    });

    child.on("error", (err) => {
      stderr = trimTail(`${stderr}\n${String(err)}`);
      finish(1);
    });
  });
}

function extractField(text: string, label: string): string | undefined {
  const re = new RegExp(`${label}\\s*[:=]\\s*([^\\n]+)`, "i");
  const match = text.match(re);
  return match?.[1]?.trim();
}

function parseVerificationOutput(output: RunnerOutput): VerificationResult {
  const merged = `${output.stdout}\n${output.stderr}`;
  const onchainHash = extractField(merged, "onchain hash");
  const expectedHash = extractField(merged, "expected hash");
  const mismatch = /mismatch|does not match|not reproducible/i.test(merged);
  const timedOut = output.timedOut;

  if (output.exitCode === 0 && !timedOut) {
    return {
      verificationStatus: "verified_reproducible",
      onchainProgramHash: onchainHash,
      expectedProgramHash: expectedHash,
      diffSummary: "Hashes match",
      verifierVersion: env.VERIFIER_VERSION,
      buildImage: env.VERIFIER_BUILD_IMAGE
    };
  }

  if (timedOut) {
    return {
      verificationStatus: "verification_failed",
      onchainProgramHash: onchainHash,
      expectedProgramHash: expectedHash,
      diffSummary: `Verification command timed out after ${env.VERIFIER_JOB_TIMEOUT_MS}ms`,
      verifierVersion: env.VERIFIER_VERSION,
      buildImage: env.VERIFIER_BUILD_IMAGE
    };
  }

  if (mismatch) {
    return {
      verificationStatus: "source_provided_not_reproducible",
      onchainProgramHash: onchainHash,
      expectedProgramHash: expectedHash,
      diffSummary: "Source provided but binary mismatch",
      verifierVersion: env.VERIFIER_VERSION,
      buildImage: env.VERIFIER_BUILD_IMAGE
    };
  }

  return {
    verificationStatus: "verification_failed",
    onchainProgramHash: onchainHash,
    expectedProgramHash: expectedHash,
    diffSummary: `Verification command failed (exit=${output.exitCode})`,
    verifierVersion: env.VERIFIER_VERSION,
    buildImage: env.VERIFIER_BUILD_IMAGE
  };
}

export async function runVerification(job: VerificationJob): Promise<{
  result: VerificationResult;
  logs: string;
}> {
  if (!job.sourceRepoUrl || !job.sourceCommit) {
    return {
      result: {
        verificationStatus: "unverified",
        diffSummary: "Missing source repo or commit metadata",
        verifierVersion: env.VERIFIER_VERSION,
        buildImage: env.VERIFIER_BUILD_IMAGE
      },
      logs: "Skipped verification due to missing source metadata"
    };
  }

  const args = [
    "verify-from-repo",
    "--program-id",
    job.programId,
    "--repo",
    job.sourceRepoUrl,
    "--commit-hash",
    job.sourceCommit
  ];

  const output = await executeCommand(env.SOLANA_VERIFY_BIN, args);
  const result = parseVerificationOutput(output);
  return {
    result,
    logs: `cmd=${env.SOLANA_VERIFY_BIN} ${args.join(" ")}\nstdout:\n${output.stdout}\nstderr:\n${output.stderr}`
  };
}
