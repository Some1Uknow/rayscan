export type VerificationTrigger =
  | "scheduled"
  | "manual"
  | "traffic_hot"
  | "post_upgrade";

export type RunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type VerificationStatus =
  | "verified_reproducible"
  | "source_provided_not_reproducible"
  | "unverified"
  | "verification_failed";

export type VerificationJob = {
  programId: string;
  triggeredBy: VerificationTrigger;
  sourceRepoUrl?: string;
  sourceCommit?: string;
  sourceSubdir?: string;
  toolchainDigest?: string;
  enqueuedAtMs: number;
};

export type VerificationResult = {
  verificationStatus: VerificationStatus;
  onchainProgramHash?: string;
  expectedProgramHash?: string;
  diffSummary?: string;
  verifierVersion?: string;
  buildImage?: string;
};
