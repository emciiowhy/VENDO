import { pool } from "./db.js";
import { hashPassword } from "./auth/auth.crypto.js";

/**
 * Bootstrap the platform SUPER_ADMIN — the one account that opens the /admin
 * console (approve Leads, manage Tenants, platform analytics). A fresh database
 * has no admin and nothing auto-creates one, so run this ONCE after the first
 * deploy.
 *
 * Reads from the environment:
 *   SUPER_ADMIN_EMAIL     (required) the Google address you'll sign in with
 *   SUPER_ADMIN_NAME      (optional) display name; defaults to "Platform Admin"
 *   SUPER_ADMIN_PASSWORD  (optional) sets a password hash too; Google sign-in
 *                         needs no password, so this is only for completeness
 *
 * Idempotent: matches on the email (the global identity key). Re-running
 * promotes/repairs the row to an active, tenant-less SUPER_ADMIN rather than
 * creating a duplicate. SUPER_ADMIN must have tenant_id = NULL (DB CHECK).
 *
 * Run with: `npm run seed:super-admin`
 * (locally with DATABASE_URL pointed at your Neon prod DB, or from a Render shell).
 */
async function seed() {
  const email = (process.env.SUPER_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const name = (process.env.SUPER_ADMIN_NAME ?? "Platform Admin").trim();
  const password = (process.env.SUPER_ADMIN_PASSWORD ?? "").trim();

  if (!email) {
    console.error(
      "[seed:super-admin] SUPER_ADMIN_EMAIL is required. " +
        'e.g. SUPER_ADMIN_EMAIL="you@gmail.com" npm run seed:super-admin',
    );
    process.exitCode = 1;
    return;
  }

  const passwordHash = password ? hashPassword(password) : null;

  // Upsert on the unique lower(email) index. SUPER_ADMIN is tenant-less; we
  // explicitly null tenant_id on both insert and update to satisfy the CHECK.
  const { rows } = await pool.query<{ id: string; created: boolean }>(
    `INSERT INTO users (tenant_id, email, name, role, status, password_hash)
     VALUES (NULL, $1, $2, 'SUPER_ADMIN', 'active', $3)
     ON CONFLICT (lower(email)) DO UPDATE
       SET role = 'SUPER_ADMIN',
           tenant_id = NULL,
           status = 'active',
           name = EXCLUDED.name,
           password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash)
     RETURNING id, (xmax = 0) AS created`,
    [email, name, passwordHash],
  );

  const row = rows[0];
  console.log(
    `[seed:super-admin] ${row.created ? "created" : "updated"} SUPER_ADMIN ${email} (${row.id}). ` +
      `Sign in with Google using this address.` +
      (passwordHash ? " A password was also set." : ""),
  );
}

seed()
  .then(() => pool.end())
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error("[seed:super-admin] failed:", err);
    pool.end().finally(() => process.exit(1));
  });
