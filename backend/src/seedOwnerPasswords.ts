import { pool } from "./db.js";
import { hashPassword } from "./auth/auth.crypto.js";

/**
 * One-time backfill: give every existing OWNER/MANAGER who has no password a
 * known default (`123123123`) so they can sign in with Store ID + email +
 * password right away. Going forward they reset it themselves (sign in with
 * Google, then set a new password under Account).
 *
 * Idempotent — only touches rows where `password_hash IS NULL`, so re-running
 * never overwrites a password someone has already set. Each row gets a freshly
 * salted hash. Run with: `npm run seed:owner-passwords`.
 */
const DEFAULT_PASSWORD = "123123123";

async function backfill() {
  const { rows } = await pool.query<{ id: string; email: string; role: string }>(
    `SELECT id, email, role
       FROM users
      WHERE role IN ('MERCHANT_OWNER', 'MANAGER')
        AND password_hash IS NULL`,
  );

  if (rows.length === 0) {
    console.log("[seed:owner-passwords] nothing to do — every owner/manager already has a password.");
    return;
  }

  for (const u of rows) {
    await pool.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [u.id, hashPassword(DEFAULT_PASSWORD)]);
    console.log(`[seed:owner-passwords] set default password for ${u.role} ${u.email}`);
  }

  console.log(
    `[seed:owner-passwords] done. ${rows.length} owner/manager account(s) now default to "${DEFAULT_PASSWORD}". They should reset it via Google → Account.`,
  );
}

backfill()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed:owner-passwords] failed:", err);
    pool.end().finally(() => process.exit(1));
  });
