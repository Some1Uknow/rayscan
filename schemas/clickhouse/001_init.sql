CREATE DATABASE IF NOT EXISTS rayscan;

CREATE TABLE IF NOT EXISTS rayscan.fact_swaps (
  slot UInt64,
  block_time DateTime,
  signature String,
  ix_index UInt16,
  pool_address String,
  user_address String,
  input_mint String,
  output_mint String,
  input_amount UInt128,
  output_amount UInt128,
  fee_amount UInt128,
  program_id String
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(block_time)
ORDER BY (pool_address, block_time, signature, ix_index);

CREATE TABLE IF NOT EXISTS rayscan.fact_pool_snapshots_1m (
  bucket DateTime,
  pool_address String,
  volume_input UInt128,
  volume_output UInt128,
  swaps_count UInt64
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (pool_address, bucket);

CREATE TABLE IF NOT EXISTS rayscan.fact_wallet_activity (
  block_time DateTime,
  wallet_address String,
  signature String,
  action LowCardinality(String),
  pool_address String,
  input_mint String,
  output_mint String,
  input_amount UInt128,
  output_amount UInt128
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(block_time)
ORDER BY (wallet_address, block_time, signature);

