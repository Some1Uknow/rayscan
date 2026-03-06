import { z } from "zod";

const envSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(8080),
  POSTGRES_URL: z.string().min(1).default("postgres://rayscan:rayscan@localhost:5432/rayscan"),
  SOLANA_RPC_URL: z.string().url().default("https://api.mainnet-beta.solana.com")
});

export const env = envSchema.parse(process.env);
