import { z } from "zod";

const envSchema = z.object({
  POSTGRES_URL: z.string().min(1).default("postgres://rayscan:rayscan@localhost:5432/rayscan"),
  SOLANA_VERIFY_BIN: z.string().min(1).default("solana-verify"),
  VERIFIER_BUILD_IMAGE: z.string().min(1).default("unknown"),
  VERIFIER_VERSION: z.string().min(1).default("dev"),
  VERIFIER_HOST: z.string().min(1).default("127.0.0.1"),
  VERIFIER_PORT: z.coerce.number().int().positive().default(8081),
  VERIFIER_LOOP_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  VERIFIER_JOB_TIMEOUT_MS: z.coerce.number().int().positive().default(180000),
  VERIFIER_LOG_MAX_BYTES: z.coerce.number().int().positive().default(200000),
  VERIFIER_INTERNAL_TOKEN: z
    .string()
    .optional()
    .transform((value) => {
      const normalized = value?.trim();
      return normalized && normalized.length > 0 ? normalized : undefined;
    })
    .refine((value) => value === undefined || value.length >= 16, {
      message: "VERIFIER_INTERNAL_TOKEN must be at least 16 characters when set"
    })
});

export const env = envSchema.parse(process.env);
