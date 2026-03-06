import { z } from "zod";

const envSchema = z.object({
  POSTGRES_URL: z.string().min(1).default("postgres://rayscan:rayscan@localhost:5432/rayscan"),
  SOLANA_VERIFY_BIN: z.string().min(1).default("solana-verify"),
  VERIFIER_BUILD_IMAGE: z.string().min(1).default("unknown"),
  VERIFIER_VERSION: z.string().min(1).default("dev"),
  VERIFIER_PORT: z.coerce.number().int().positive().default(8081),
  VERIFIER_LOOP_INTERVAL_MS: z.coerce.number().int().positive().default(1000)
});

export const env = envSchema.parse(process.env);
