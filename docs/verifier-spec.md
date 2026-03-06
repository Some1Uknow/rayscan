# Verifier Service Spec

## Goal
Provide auditable, reproducible program verification status for explorer users without adding browsing friction.

## Service: `services/verifier`

Submodules:
- `discover/`: collects candidate program IDs from indexer/API traffic and curated seed sets.
- `queue/`: schedules and prioritizes verification runs.
- `runners/`: executes `solana-verify` in pinned containers.
- `parser/`: parses verifier output into structured status and reason.
- `publish/`: writes DB state and emits completion events.

## Inputs
- program IDs from:
  - transaction traffic
  - manual request endpoint
  - scheduled refresh job
  - post-upgrade detection events

## Priority Rules
1. post-upgrade programs
2. top interacted programs in last 24h
3. newly discovered programs
4. scheduled refresh backlog

## Run Lifecycle
States:
- `queued`
- `running`
- `succeeded`
- `failed`
- `cancelled`

Transitions:
- `queued -> running`
- `running -> succeeded | failed | cancelled`

## Output Mapping

`verified_reproducible`:
- build artifact hash equals on-chain hash
- toolchain and source commit recorded

`source_provided_not_reproducible`:
- source supplied but binary mismatch

`verification_failed`:
- runner/toolchain/external failure

`unverified`:
- no trustworthy source metadata discovered

## API Endpoints (Verifier-Related)
- `GET /v1/programs/:programId`
- `GET /v1/programs/:programId/verification`
- `GET /v1/programs/verification-feed?window=24h`
- `POST /internal/v1/verifications/:programId/run`

## Response Shape (Example)
```json
{
  "programId": "Example11111111111111111111111111111111111",
  "verificationStatus": "verified_reproducible",
  "verificationCheckedAt": "2026-03-06T12:00:00Z",
  "source": {
    "repoUrl": "https://github.com/example/repo",
    "commit": "abc123",
    "subdir": "programs/core"
  },
  "hashes": {
    "onchain": "0x1234",
    "expected": "0x1234"
  },
  "lastRun": {
    "status": "succeeded",
    "durationMs": 18234
  }
}
```

## Operational Controls
- hard cap worker concurrency per cluster
- timeout and kill long-running verification jobs
- dedupe runs with key `programId + sourceCommit + toolchainDigest`
- capture stdout/stderr logs for auditability

## Failure Handling
- transient failures retried with exponential backoff
- deterministic mismatches are not retried until new source or upgrade event
- dead-letter queue for repeated infrastructure failures

## Metrics
- `verifier_queue_depth`
- `verifier_run_duration_ms`
- `verifier_success_total`
- `verifier_failure_total{reason=...}`
- `verification_status_total{status=...}`

## Security
- run each verification in isolated container sandbox
- pin verifier toolchain image digests
- do not execute arbitrary scripts outside controlled build profile
- treat source metadata as untrusted input and sanitize all fields

