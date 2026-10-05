import pg from "pg";
import { env } from "./env.js";

/**
 * A single shared connection pool to NeonDB (Postgres).
 *
 * Neon requires TLS and presents a publicly-trusted certificate, so we VERIFY
 * it (`rejectUnauthorized: true`) rather than accepting any cert. Without
 * verification the channel is encrypted but unauthenticated — an attacker with
 * a network position on the host→Neon path could MITM the connection and read
 * or tamper with every row (credentials, customer PII, sales). Most Neon
 * connection strings already include `?sslmode=require`; verifying here closes
 * the authentication gap regardless.
 */
export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  ssl: { rejectUnauthorized: true },
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
