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
  commitment TEXT NOT NULL DEFAULT 'processed',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_status_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_observed_slot BIGINT,
  source TEXT NOT NULL DEFAULT 'stream',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_profiles (
  wallet_address TEXT PRIMARY KEY,
  first_seen_slot BIGINT,
  last_seen_slot BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE IF EXISTS tx_index ADD COLUMN IF NOT EXISTS commitment TEXT;
ALTER TABLE IF EXISTS tx_index ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS tx_index ADD COLUMN IF NOT EXISTS last_status_at TIMESTAMPTZ;
ALTER TABLE IF EXISTS tx_index ADD COLUMN IF NOT EXISTS last_observed_slot BIGINT;

UPDATE tx_index
SET
  commitment = COALESCE(commitment, 'processed'),
  first_seen_at = COALESCE(first_seen_at, created_at, NOW()),
  last_status_at = COALESCE(last_status_at, created_at, NOW()),
  last_observed_slot = COALESCE(last_observed_slot, slot);

ALTER TABLE IF EXISTS tx_index ALTER COLUMN commitment SET DEFAULT 'processed';
ALTER TABLE IF EXISTS tx_index ALTER COLUMN commitment SET NOT NULL;
ALTER TABLE IF EXISTS tx_index ALTER COLUMN first_seen_at SET DEFAULT NOW();
ALTER TABLE IF EXISTS tx_index ALTER COLUMN first_seen_at SET NOT NULL;
ALTER TABLE IF EXISTS tx_index ALTER COLUMN last_status_at SET DEFAULT NOW();
ALTER TABLE IF EXISTS tx_index ALTER COLUMN last_status_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tx_index_commitment_check'
  ) THEN
    ALTER TABLE tx_index
    ADD CONSTRAINT tx_index_commitment_check
    CHECK (commitment IN ('processed', 'confirmed', 'finalized'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tx_index_slot ON tx_index(slot DESC);
CREATE INDEX IF NOT EXISTS idx_tx_index_created_at ON tx_index(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_index_commitment_created_at
  ON tx_index(commitment, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_index_last_status_at
  ON tx_index(last_status_at DESC);
CREATE INDEX IF NOT EXISTS idx_pools_pair ON pools(base_mint, quote_mint);
CREATE INDEX IF NOT EXISTS idx_wallet_profiles_last_seen_slot
  ON wallet_profiles(last_seen_slot DESC NULLS LAST, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_program_verifications_status
  ON program_verifications(verification_status, last_checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_runs_program_created
  ON verification_runs(program_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_runs_status
  ON verification_runs(run_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_programs_program_id_trgm
  ON programs USING gin (program_id gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_wallet_profiles_address_trgm
  ON wallet_profiles USING gin (wallet_address gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tx_index_signature_trgm
  ON tx_index USING gin (signature gin_trgm_ops);
