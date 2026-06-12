import pg from "pg";
import { env } from "./env.js";

/**
 * A single shared connection pool to NeonDB (Postgres).
 *
 * Neon requires TLS. Most Neon connection strings already include
 * `?sslmode=require`; we also set `ssl` here so it works either way.
 */
export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("[db] unexpected idle client error:", err.message);
});

/** Thin helper so call sites read like `query(sql, params)`. */
export function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params);
}
