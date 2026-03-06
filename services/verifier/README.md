# Verifier Service

Queue-driven program verification worker for Rayscan.

## Scope (v0)
- accept verification jobs
- prioritize jobs by trigger reason
- execute run state machine (`queued -> running -> terminal`)
- persist run + status into Postgres tables

## Planned Inputs
- event bus topics:
  - `program.discovered`
  - `program.upgraded`
- internal API trigger:
  - `POST /internal/v1/verifications/:programId/run`

## Runtime Endpoints
- `GET /health`
- `POST /internal/v1/verifications/:programId/run`

## Planned Outputs
- writes:
  - `programs`
  - `program_verifications`
  - `verification_runs`
- publishes:
  - `program.verification.completed`
