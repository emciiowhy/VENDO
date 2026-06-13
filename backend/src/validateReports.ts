/**
 * Staging validation harness for the derived financial reports (Balance Sheet,
 * Cash Flow) and the reorder suggestions. It exercises the REAL HTTP API path —
 * auth, routing, SQL — against a running environment, sweeps EVERY active tenant
 * via Super-Admin impersonation, asserts the accounting invariants, and times
 * each call so the LATERAL→DISTINCT-ON optimisation is measured, not assumed.
 *
 * Report-only: it prints a pass/fail + timing table and ALWAYS exits 0. It never
 * mutates anything (only GETs + the session-minting impersonate POST).
 *
 * ── Why a pasted cookie ──────────────────────────────────────────────────────
 * The seeded SUPER_ADMIN signs in with Google (no tenant slug, so the password
 * path doesn't apply) — that flow isn't scriptable headlessly. So: sign into the
 * staging admin console in a browser, copy your `vendopos_session` cookie value,
 * and hand it to the script. Nothing about auth is changed for this.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   BASE_URL=https://staging.vendopos.example \
 *   ADMIN_SESSION_COOKIE=<paste vendopos_session value> \
 *   npm run validate:reports
 *
 * Optional env:
 *   SESSION_COOKIE_NAME   cookie name (default "vendopos_session")
 *   SLOW_MS               flag any call slower than this (default 500)
 *   CASHFLOW_MONTHS       how many recent months of cash flow to check (default 3)
 */

const BASE = (process.env.BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "vendopos_session";
const ADMIN_VALUE = process.env.ADMIN_SESSION_COOKIE ?? "";
const SLOW_MS = Number(process.env.SLOW_MS ?? 500);
const CASHFLOW_MONTHS = Math.max(1, Number(process.env.CASHFLOW_MONTHS ?? 3));

// ── Tiny HTTP helpers (manual cookies so the admin session is never clobbered) ──

interface Timed<T> {
  status: number;
  ms: number;
  body: T;
}

async function get<T>(path: string, cookie: string): Promise<Timed<T>> {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
  const ms = performance.now() - t0;
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, ms, body };
}

/** Returns the owner session cookie minted by impersonation (admin cookie kept intact). */
async function impersonate(tenantId: string, adminCookie: string): Promise<string | null> {
  const res = await fetch(`${BASE}/api/v1/auth/impersonate`, {
    method: "POST",
    headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ tenantId }),
    redirect: "manual",
  });
  if (res.status !== 200) return null;
  // Node ≥19.7 exposes getSetCookie(); fall back to the combined header otherwise.
  const setCookies: string[] =
    typeof (res.headers as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as { getSetCookie: () => string[] }).getSetCookie()
      : [res.headers.get("set-cookie") ?? ""];
  for (const sc of setCookies) {
    const m = sc.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    if (m && m[1] && m[1] !== "") return `${COOKIE_NAME}=${m[1]}`;
  }
  return null;
}

// ── Report shapes (mirror lib/finance.ts) ─────────────────────────────────────

interface BalanceSheet {
  assets: { totalCents: number };
  liabilities: { totalCents: number };
  equity: { totalCents: number };
  balanced: boolean;
}
interface CashFlow {
  month: string;
  openingCashCents: number;
  netChangeCents: number;
  closingCashCents: number;
  inflows: { amountCents: number }[];
  outflows: { amountCents: number }[];
}
interface Tenant {
  id: string;
  name: string;
  status: string;
}

// ── Invariant checks ──────────────────────────────────────────────────────────

function checkBalanceSheet(bs: BalanceSheet): string[] {
  const fails: string[] = [];
  const reconstructed = bs.liabilities.totalCents + bs.equity.totalCents;
  if (bs.assets.totalCents !== reconstructed) {
    fails.push(`assets ${bs.assets.totalCents} ≠ liabilities+equity ${reconstructed}`);
  }
  if (!bs.balanced) fails.push("balanced flag is false");
  return fails;
}

function checkCashFlow(cf: CashFlow): string[] {
  const fails: string[] = [];
  if (cf.openingCashCents + cf.netChangeCents !== cf.closingCashCents) {
    fails.push(`${cf.month}: opening+net ≠ closing`);
  }
  const inflow = cf.inflows.reduce((s, i) => s + i.amountCents, 0);
  const outflow = cf.outflows.reduce((s, o) => s + o.amountCents, 0);
  if (inflow - outflow !== cf.netChangeCents) {
    fails.push(`${cf.month}: inflows−outflows ≠ netChange`);
  }
  return fails;
}

function recentMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

// ── Per-tenant run ─────────────────────────────────────────────────────────────

interface Row {
  tenant: string;
  outcome: "ok" | "FAIL" | "skipped";
  detail: string;
  slowestMs: number;
  slowestCall: string;
}

async function runTenant(t: Tenant, adminCookie: string): Promise<Row> {
  const ownerCookie = await impersonate(t.id, adminCookie);
  if (!ownerCookie) {
    return { tenant: t.name, outcome: "skipped", detail: "no active owner to impersonate", slowestMs: 0, slowestCall: "—" };
  }

  const fails: string[] = [];
  let slowestMs = 0;
  let slowestCall = "—";
  const track = (label: string, ms: number) => {
    if (ms > slowestMs) {
      slowestMs = ms;
      slowestCall = label;
    }
  };

  // Balance sheet
  const bs = await get<{ ok: boolean; balanceSheet: BalanceSheet }>("/api/v1/finance/balance-sheet", ownerCookie);
  track("balance-sheet", bs.ms);
  if (bs.status !== 200 || !bs.body.ok) fails.push(`balance-sheet HTTP ${bs.status}`);
  else fails.push(...checkBalanceSheet(bs.body.balanceSheet));

  // Cash flow over recent months
  for (const month of recentMonths(CASHFLOW_MONTHS)) {
    const cf = await get<{ ok: boolean; cashFlow: CashFlow }>(`/api/v1/finance/cash-flow?month=${month}`, ownerCookie);
    track(`cash-flow ${month}`, cf.ms);
    if (cf.status !== 200 || !cf.body.ok) fails.push(`cash-flow ${month} HTTP ${cf.status}`);
    else fails.push(...checkCashFlow(cf.body.cashFlow));
  }

  // Reorder suggestions (timing only — no accounting invariant, just must respond)
  const rs = await get<{ ok: boolean }>("/api/v1/procurement/reorder-suggestions", ownerCookie);
  track("reorder-suggestions", rs.ms);
  if (rs.status !== 200 || !rs.body.ok) fails.push(`reorder-suggestions HTTP ${rs.status}`);

  return {
    tenant: t.name,
    outcome: fails.length === 0 ? "ok" : "FAIL",
    detail: fails.join("; ") || "all invariants hold",
    slowestMs,
    slowestCall,
  };
}

// ── Pretty table ────────────────────────────────────────────────────────────────

function pad(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n);
}

function printTable(rows: Row[]): void {
  const H = `${pad("Tenant", 24)}  ${pad("Result", 8)}  ${pad("Slowest", 22)}  Detail`;
  console.log("\n" + H);
  console.log("─".repeat(H.length + 20));
  for (const r of rows) {
    const flag = r.slowestMs > SLOW_MS ? " ⚠" : "  ";
    const mark = r.outcome === "ok" ? "✓ ok" : r.outcome === "skipped" ? "– skip" : "✗ FAIL";
    const slow = `${r.slowestCall} ${Math.round(r.slowestMs)}ms${flag}`;
    console.log(`${pad(r.tenant, 24)}  ${pad(mark, 8)}  ${pad(slow, 22)}  ${r.detail}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!ADMIN_VALUE) {
    console.error(
      "ADMIN_SESSION_COOKIE is required. Sign into the staging admin console, copy your\n" +
        `${COOKIE_NAME} cookie value, and set ADMIN_SESSION_COOKIE to it.`,
    );
    process.exit(0); // report-only: a misconfig is a no-op, not a CI failure
    return;
  }
  const adminCookie = `${COOKIE_NAME}=${ADMIN_VALUE}`;

  console.log(`[validate] target: ${BASE}  (slow threshold ${SLOW_MS}ms, ${CASHFLOW_MONTHS} cash-flow months)`);
  const dir = await get<{ ok: boolean; tenants: Tenant[] }>("/api/v1/admin/tenants", adminCookie);
  if (dir.status !== 200 || !dir.body.ok) {
    console.error(`[validate] could not list tenants (HTTP ${dir.status}) — is the admin cookie valid?`);
    process.exit(0);
    return;
  }

  const active = dir.body.tenants.filter((t) => t.status === "active");
  console.log(`[validate] ${active.length} active tenant(s) of ${dir.body.tenants.length} total`);

  const rows: Row[] = [];
  for (const t of active) {
    rows.push(await runTenant(t, adminCookie));
  }

  printTable(rows);

  const failed = rows.filter((r) => r.outcome === "FAIL");
  const slow = rows.filter((r) => r.slowestMs > SLOW_MS);
  const skipped = rows.filter((r) => r.outcome === "skipped");
  console.log(
    `\n[validate] summary: ${rows.length - failed.length - skipped.length} ok · ${failed.length} FAIL · ` +
      `${skipped.length} skipped · ${slow.length} over ${SLOW_MS}ms`,
  );
  if (failed.length) console.log("[validate] ⚠ invariant failures above need investigation before prod.");
  if (slow.length) console.log("[validate] ⚠ slow tenants above — check query plans / indexes on staging.");
  process.exit(0); // report-only
}

main().catch((err) => {
  console.error("[validate] unexpected error:", err);
  process.exit(0); // report-only — never fail the run
});
