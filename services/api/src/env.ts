import { z } from "zod";

const isProduction = process.env.NODE_ENV === "production";

function booleanFlag(defaultValue: boolean) {
  return z
    .union([z.string(), z.boolean(), z.number()])
    .optional()
    .transform((value) => {
      if (value === undefined) return defaultValue;
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value !== 0;
      return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
    });
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().int().positive().default(8080),
  API_TRUST_PROXY: booleanFlag(isProduction),
  POSTGRES_URL: isProduction
    ? z.string().min(1)
    : z.string().min(1).default("postgres://rayscan:rayscan@localhost:5432/rayscan"),
  SOLANA_CLUSTER: z.string().min(1).default("mainnet-beta"),
  SOLANA_RPC_URL: isProduction
    ? z.string().url()
    : z.string().url().default("https://api.mainnet-beta.solana.com"),
  SOLANA_RPC_FALLBACK_URLS: z.string().default(""),
  API_CORS_ORIGINS: isProduction
    ? z.string().min(1)
    : z.string().default("http://localhost:3000,http://127.0.0.1:3000"),
  API_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(300),
  API_RATE_LIMIT_EXPENSIVE_PER_MIN: z.coerce.number().int().positive().default(60),
  API_CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(1000)
});

export const env = envSchema.parse(process.env);
