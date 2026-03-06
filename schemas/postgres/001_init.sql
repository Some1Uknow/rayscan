CREATE TABLE IF NOT EXISTS ray_programs (
  id BIGSERIAL PRIMARY KEY,
  program_id TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS programs (
  program_id TEXT PRIMARY KEY,
  loader_program_id TEXT NOT NULL,
  programdata_address TEXT,
  upgrade_authority TEXT,
  is_upgradeable BOOLEAN NOT NULL DEFAULT TRUE,
  deploy_slot BIGINT,
  last_upgrade_slot BIGINT,
  last_seen_slot BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS program_verifications (
  id BIGSERIAL PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(program_id) ON DELETE CASCADE,
  verification_status TEXT NOT NULL CHECK (
    verification_status IN (
      'verified_reproducible',
      'source_provided_not_reproducible',
      'unverified',
      'verification_failed'
    )
  ),
  source_repo_url TEXT,
  source_commit TEXT,
  source_subdir TEXT,
  build_image TEXT,
  verifier_version TEXT,
  expected_program_hash TEXT,
  onchain_program_hash TEXT,
  diff_summary TEXT,
  verified_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (program_id)
);

CREATE TABLE IF NOT EXISTS verification_runs (
  run_id BIGSERIAL PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES programs(program_id) ON DELETE CASCADE,
  triggered_by TEXT NOT NULL CHECK (
    triggered_by IN ('scheduled', 'manual', 'traffic_hot', 'post_upgrade')
  ),
  run_status TEXT NOT NULL CHECK (
    run_status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')
  ),
  toolchain_digest TEXT,
  source_repo_url TEXT,
  source_commit TEXT,
  queue_latency_ms BIGINT,
  duration_ms BIGINT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  logs TEXT,
  artifacts_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pools (
  id BIGSERIAL PRIMARY KEY,
  pool_address TEXT NOT NULL UNIQUE,
  program_id TEXT NOT NULL,
  base_mint TEXT NOT NULL,
  quote_mint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tx_index (
  signature TEXT PRIMARY KEY,
  slot BIGINT NOT NULL,
  block_time BIGINT,
  success BOOLEAN NOT NULL,
  fee_lamports BIGINT NOT NULL DEFAULT 0,
  compute_units BIGINT,
  priority_fee_lamports BIGINT,
  source TEXT NOT NULL DEFAULT 'stream',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_profiles (
  wallet_address TEXT PRIMARY KEY,
  first_seen_slot BIGINT,
  last_seen_slot BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tx_index_slot ON tx_index(slot DESC);
CREATE INDEX IF NOT EXISTS idx_pools_pair ON pools(base_mint, quote_mint);
CREATE INDEX IF NOT EXISTS idx_program_verifications_status
  ON program_verifications(verification_status, last_checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_runs_program_created
  ON verification_runs(program_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_runs_status
  ON verification_runs(run_status, created_at DESC);
