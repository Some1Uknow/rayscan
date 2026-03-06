import { Pool } from "pg";
import { env } from "./env.js";

export const pool = new Pool({
  connectionString: env.POSTGRES_URL
});

export async function closeDb(): Promise<void> {
  await pool.end();
}

