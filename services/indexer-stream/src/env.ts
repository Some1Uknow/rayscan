import { z } from "zod";

const isProduction = process.env.NODE_ENV === "production";

function booleanFlag(defaultValue: boolean) {
  return z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((value) => {
      if (typeof value === "boolean") return value;
      if (typeof value !== "string") return defaultValue;
      return !["0", "false", "no", "off"].includes(value.toLowerCase());
    });
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  INDEXER_ENABLED: booleanFlag(true),
  POSTGRES_URL: isProduction
    ? z.string().min(1)
    : z.string().min(1).default("postgres://rayscan:rayscan@localhost:5432/rayscan"),
  SOLANA_CLUSTER: z.string().min(1).default("mainnet-beta"),
  SOLANA_RPC_URL: isProduction
    ? z.string().url()
    : z.string().url().default("https://api.mainnet-beta.solana.com"),
  SOLANA_WS_URL: z.string().url(),
  INDEXER_COMMITMENT: z.enum(["processed", "confirmed"]).default("processed"),
  INDEXER_RECONNECT_DELAY_MS: z.coerce.number().int().positive().default(1500),
  INDEXER_PENDING_RECHECK_MS: z.coerce.number().int().positive().default(2000),
  INDEXER_PENDING_BATCH_LIMIT: z.coerce.number().int().positive().max(512).default(128),
  INDEXER_RPC_TIMEOUT_MS: z.coerce.number().int().positive().default(12000)
});

export const env = envSchema.parse(process.env);

export type IndexerCommitment = "processed" | "confirmed" | "finalized";
