import { z } from "zod";

const envSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(8080),
  POSTGRES_URL: z.string().min(1).default("postgres://rayscan:rayscan@localhost:5432/rayscan"),
  SOLANA_RPC_URL: z.string().url().default("https://api.mainnet-beta.solana.com"),
  API_CORS_ORIGINS: z.string().default("http://localhost:3000,http://127.0.0.1:3000"),
  API_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(300),
  API_RATE_LIMIT_EXPENSIVE_PER_MIN: z.coerce.number().int().positive().default(60),
  API_CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(1000)
});

export const env = envSchema.parse(process.env);
