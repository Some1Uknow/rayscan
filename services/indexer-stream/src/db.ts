import { Pool } from "pg";
import { env, type IndexerCommitment } from "./env.js";

export const pool = new Pool({
  connectionString: env.POSTGRES_URL
});

export type TxObservation = {
  signature: string;
  slot: number;
  blockTime: number | null;
  success: boolean;
  feeLamports: number | null;
  computeUnits: number | null;
  priorityFeeLamports: number | null;
  commitment: IndexerCommitment;
  observedSlot: number | null;
  source: string;
};

function commitmentRankSql(column: string): string {
  return `CASE ${column} WHEN 'processed' THEN 1 WHEN 'confirmed' THEN 2 WHEN 'finalized' THEN 3 ELSE 0 END`;
}

export async function upsertTxObservation(input: TxObservation): Promise<void> {
  await pool.query(
    `
      INSERT INTO tx_index (
        signature,
        slot,
        block_time,
        success,
        fee_lamports,
        compute_units,
        priority_fee_lamports,
        commitment,
        first_seen_at,
        last_status_at,
        last_observed_slot,
        source,
        created_at
      )
      VALUES (
        $1,
        $2::bigint,
        $3::bigint,
        $4::boolean,
        COALESCE($5::bigint, 0),
        $6::bigint,
        $7::bigint,
        $8::text,
        NOW(),
        NOW(),
        COALESCE($9::bigint, $2::bigint),
        $10::text,
        NOW()
      )
      ON CONFLICT (signature) DO UPDATE SET
        slot = GREATEST(tx_index.slot, EXCLUDED.slot),
        block_time = COALESCE(EXCLUDED.block_time, tx_index.block_time),
        success = CASE
          WHEN ${commitmentRankSql("EXCLUDED.commitment")} >= ${commitmentRankSql("tx_index.commitment")}
            THEN EXCLUDED.success
          ELSE tx_index.success
        END,
        fee_lamports = CASE
          WHEN $5::bigint IS NULL THEN tx_index.fee_lamports
          ELSE $5::bigint
        END,
        compute_units = COALESCE($6::bigint, tx_index.compute_units),
        priority_fee_lamports = COALESCE($7::bigint, tx_index.priority_fee_lamports),
        commitment = CASE
          WHEN ${commitmentRankSql("EXCLUDED.commitment")} >= ${commitmentRankSql("tx_index.commitment")}
            THEN EXCLUDED.commitment
          ELSE tx_index.commitment
        END,
        last_status_at = NOW(),
        last_observed_slot = GREATEST(
          COALESCE(tx_index.last_observed_slot, 0),
          COALESCE($9::bigint, EXCLUDED.slot, 0)
        ),
        source = CASE
          WHEN ${commitmentRankSql("EXCLUDED.commitment")} >= ${commitmentRankSql("tx_index.commitment")}
            THEN EXCLUDED.source
          ELSE tx_index.source
        END;
    `,
    [
      input.signature,
      input.slot,
      input.blockTime,
      input.success,
      input.feeLamports,
      input.computeUnits,
      input.priorityFeeLamports,
      input.commitment,
      input.observedSlot,
      input.source
    ]
  );
}

export async function upsertWalletProfiles(addresses: string[], slot: number): Promise<void> {
  const normalizedAddresses = [...new Set(addresses)].sort((left, right) => left.localeCompare(right));
  if (normalizedAddresses.length === 0) return;
  await pool.query(
    `
      INSERT INTO wallet_profiles (
        wallet_address,
        first_seen_slot,
        last_seen_slot,
        updated_at
      )
      SELECT
        address,
        $2,
        $2,
        NOW()
      FROM UNNEST($1::text[]) AS address
      ON CONFLICT (wallet_address) DO UPDATE SET
        first_seen_slot = LEAST(COALESCE(wallet_profiles.first_seen_slot, EXCLUDED.first_seen_slot), EXCLUDED.first_seen_slot),
        last_seen_slot = GREATEST(COALESCE(wallet_profiles.last_seen_slot, EXCLUDED.last_seen_slot), EXCLUDED.last_seen_slot),
        updated_at = NOW();
    `,
    [normalizedAddresses, slot]
  );
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
