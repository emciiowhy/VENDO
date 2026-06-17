import { pool, query } from "../db.js";
import { notifyVariance } from "../notifications/notifications.repository.js";
import { markPresentFromShift } from "../hr/hr.repository.js";
import {
  buildAuditSnapshot,
  reconcile,
  type ActiveShift,
  type ShiftTally,
  type ShiftZRead,
} from "./pos.schema.js";

/**
 * Cashier shift reconciliation ledger (X-Read / Z-Read). Every query is scoped
 * by `tenantId` (read from the verified session, never the request) and keyed to
 * the operating user, so one cashier can never read or close another's shift —
 * across Tenants or within one.
 *
 * Channel buckets map our four settlement rails into the three the drawer cares
 * about: Cash (physically counted), e-wallet (GCash + Maya) and card (QRPH).
 * Only cash drives the drawer variance; digital rails are recorded for the audit
 * trail but never physically counted.
 */

const TALLY_SQL = `
  coalesce(sum(total_cents) FILTER (WHERE payment_method = 'Cash'), 0)::bigint            AS cash,
  coalesce(sum(total_cents) FILTER (WHERE payment_method IN ('GCash','Maya')), 0)::bigint AS ewallet,
  coalesce(sum(total_cents) FILTER (WHERE payment_method = 'QRPH'), 0)::bigint            AS card,
  coalesce(sum(total_cents), 0)::bigint                                                   AS total,
  count(*) FILTER (WHERE kind = 'sale')::int                                               AS txns`;

interface TallyRow {
  cash: string;
  ewallet: string;
  card: string;
  total: string;
  txns: number;
}

function toTally(r: TallyRow): ShiftTally {
  return {
    cashSalesCents: Number(r.cash),
    ewalletSalesCents: Number(r.ewallet),
    cardSalesCents: Number(r.card),
    totalSalesCents: Number(r.total),
    txnCount: r.txns,
  };
}

/** The id of the caller's currently-open shift, if any (used to stamp sales). */
export async function getActiveShiftId(
  tenantId: string,
  userId: string | null,
): Promise<string | null> {
  if (!userId) return null;
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM cashier_shifts
      WHERE tenant_id = $1 AND cashier_user_id = $2 AND status = 'open' LIMIT 1`,
    [tenantId, userId],
  );
  return rows[0]?.id ?? null;
}

/** The caller's open shift with live running tallies, or null if none is open. */
export async function getActiveShift(
  tenantId: string,
  userId: string,
): Promise<ActiveShift | null> {
  const shiftRes = await query<{
    id: string;
    cashier_name: string;
    opening_cents: number;
    opened_at: Date;
  }>(
    `SELECT id, cashier_name, opening_cents, opened_at
       FROM cashier_shifts
      WHERE tenant_id = $1 AND cashier_user_id = $2 AND status = 'open'
      LIMIT 1`,
    [tenantId, userId],
  );
  const shift = shiftRes.rows[0];
  if (!shift) return null;

  const tallyRes = await query<TallyRow>(
    `SELECT ${TALLY_SQL} FROM sales WHERE shift_id = $1`,
    [shift.id],
  );
  const tally = toTally(tallyRes.rows[0]);

  return {
    id: shift.id,
    cashierName: shift.cashier_name,
    openingCents: shift.opening_cents,
    openedAt: shift.opened_at.toISOString(),
    expectedCashCents: shift.opening_cents + tally.cashSalesCents,
    ...tally,
  };
}

export type OpenShiftResult =
  | { ok: true; shift: ActiveShift }
  | { ok: false; error: "ALREADY_OPEN" };

/**
 * Open a shift for the caller, recording the opening drawer float. Guarded by
 * the partial unique index (one open shift per cashier per Tenant) — a race or
 * double-tap surfaces as ALREADY_OPEN rather than a duplicate row.
 */
export async function openShift(
  tenantId: string,
  userId: string,
  cashierName: string,
  openingCents: number,
): Promise<OpenShiftResult> {
  try {
    const { rows } = await query<{ id: string; opening_cents: number; opened_at: Date }>(
      `INSERT INTO cashier_shifts (tenant_id, cashier_user_id, cashier_name, opening_cents)
       VALUES ($1, $2, $3, $4)
       RETURNING id, opening_cents, opened_at`,
      [tenantId, userId, cashierName, openingCents],
    );
    const row = rows[0];
    // Opening the till auto-logs HR attendance (Present, today/Manila) for the
    // cashier's linked employee record. Best-effort: a derived side-effect must
    // never block or fail the shift open, mirroring notifyVariance below.
    void markPresentFromShift(tenantId, userId).catch((err) =>
      console.error("[shifts] auto-attendance mark failed:", err),
    );
    return {
      ok: true,
      shift: {
        id: row.id,
        cashierName,
        openingCents: row.opening_cents,
        openedAt: row.opened_at.toISOString(),
        expectedCashCents: row.opening_cents,
        cashSalesCents: 0,
        ewalletSalesCents: 0,
        cardSalesCents: 0,
        totalSalesCents: 0,
        txnCount: 0,
      },
    };
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
      return { ok: false, error: "ALREADY_OPEN" };
    }
    throw err;
  }
}

// ── Manager reconciliation matrix (read-only audit) ─────────────────────────

/** One closed shift's drawer reconciliation, for the manager audit matrix. */
export interface ShiftReconciliation {
  id: string;
  cashierUserId: string | null;
  cashierName: string;
  openedAt: string;
  closedAt: string;
  openingCents: number;
  cashSalesCents: number;
  ewalletSalesCents: number;
  cardSalesCents: number;
  totalSalesCents: number;
  txnCount: number;
  expectedCashCents: number;
  countedCashCents: number;
  varianceCents: number;
  /** Derived from the centavo variance — the loss-prevention signal. */
  status: "balanced" | "short" | "over";
  note: string | null;
}

export interface ShiftReconciliationReport {
  from: string;
  to: string;
  rows: ShiftReconciliation[];
  totals: {
    shifts: number;
    /** Net variance across the window (overages net shortages). */
    netVarianceCents: number;
    /** Absolute shrink — the sum of every shortage/overage magnitude. */
    absVarianceCents: number;
    shortCount: number;
    overCount: number;
    balancedCount: number;
  };
}

const MNL = "Asia/Manila";

/** Classify a centavo variance into the drawer-status the matrix badges read. */
function varianceStatus(varianceCents: number): "balanced" | "short" | "over" {
  if (varianceCents === 0) return "balanced";
  return varianceCents < 0 ? "short" : "over";
}

/**
 * List every CLOSED shift reconciled in [from, to] (inclusive Manila dates) for
 * the manager discrepancy matrix. Strictly tenant-fenced (the tenant id comes
 * from the verified session, never the request), newest first. Read-only — the
 * close paths above are the only writers of these rows.
 */
export async function listShiftReconciliations(
  tenantId: string,
  from: string,
  to: string,
): Promise<ShiftReconciliationReport> {
  const { rows } = await query<{
    id: string;
    cashier_user_id: string | null;
    cashier_name: string;
    opened_at: Date;
    closed_at: Date;
    opening_cents: number;
    cash_sales_cents: number;
    ewallet_sales_cents: number;
    card_sales_cents: number;
    total_sales_cents: number;
    txn_count: number;
    expected_cash_cents: number;
    counted_cash_cents: number;
    cash_variance_cents: number;
    note: string | null;
  }>(
    `SELECT id, cashier_user_id, cashier_name, opened_at, closed_at, opening_cents,
            cash_sales_cents, ewallet_sales_cents, card_sales_cents, total_sales_cents,
            txn_count, expected_cash_cents, counted_cash_cents, cash_variance_cents, note
       FROM cashier_shifts
      WHERE tenant_id = $1 AND status = 'closed' AND closed_at IS NOT NULL
        AND (closed_at AT TIME ZONE $4)::date BETWEEN $2 AND $3
      ORDER BY closed_at DESC`,
    [tenantId, from, to, MNL],
  );

  const reconciliations: ShiftReconciliation[] = rows.map((r) => ({
    id: r.id,
    cashierUserId: r.cashier_user_id,
    cashierName: r.cashier_name,
    openedAt: r.opened_at.toISOString(),
    closedAt: r.closed_at.toISOString(),
    openingCents: r.opening_cents,
    cashSalesCents: r.cash_sales_cents,
    ewalletSalesCents: r.ewallet_sales_cents,
    cardSalesCents: r.card_sales_cents,
    totalSalesCents: r.total_sales_cents,
    txnCount: r.txn_count,
    expectedCashCents: r.expected_cash_cents,
    countedCashCents: r.counted_cash_cents,
    varianceCents: r.cash_variance_cents,
    status: varianceStatus(r.cash_variance_cents),
    note: r.note,
  }));

  const totals = reconciliations.reduce(
    (acc, r) => {
      acc.shifts += 1;
      acc.netVarianceCents += r.varianceCents;
      acc.absVarianceCents += Math.abs(r.varianceCents);
      if (r.status === "short") acc.shortCount += 1;
      else if (r.status === "over") acc.overCount += 1;
      else acc.balancedCount += 1;
      return acc;
    },
    { shifts: 0, netVarianceCents: 0, absVarianceCents: 0, shortCount: 0, overCount: 0, balancedCount: 0 },
  );

  return { from, to, rows: reconciliations, totals };
}

export type CloseShiftResult =
  | { ok: true; zread: ShiftZRead }
  | { ok: false; error: "NO_OPEN_SHIFT" };

/**
 * Owner force-close: reconcile and freeze ANOTHER user's open shift — for a
 * cashier who left the till without running their own Z-Read. Same locking and
 * snapshot maths as closeShift, but keyed by the cashier's id (the caller is the
 * owner) and tenant-fenced. When `countedCents` is null the owner didn't count
 * the drawer, so we record the expected amount (zero variance) and tag the note.
 * The audit line keeps the cashier's name; `closedBy` is folded into the note.
 */
export async function forceCloseShiftForCashier(
  tenantId: string,
  cashierUserId: string,
  countedCents: number | null,
  note: string | null,
  closedByName: string,
): Promise<CloseShiftResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const shiftRes = await client.query<{
      id: string;
      cashier_name: string;
      opening_cents: number;
      opened_at: Date;
    }>(
      `SELECT id, cashier_name, opening_cents, opened_at
         FROM cashier_shifts
        WHERE tenant_id = $1 AND cashier_user_id = $2 AND status = 'open'
        FOR UPDATE`,
      [tenantId, cashierUserId],
    );
    const shift = shiftRes.rows[0];
    if (!shift) {
      await client.query("ROLLBACK");
      return { ok: false, error: "NO_OPEN_SHIFT" };
    }

    const tallyRes = await client.query<TallyRow>(
      `SELECT ${TALLY_SQL} FROM sales WHERE shift_id = $1`,
      [shift.id],
    );
    const tally = toTally(tallyRes.rows[0]);
    const expectedCashCents = shift.opening_cents + tally.cashSalesCents;
    // No physical count → record the expectation (balanced) rather than a false
    // shortage; otherwise reconcile against what the owner counted.
    const counted = countedCents ?? expectedCashCents;
    const cashVarianceCents = counted - expectedCashCents;

    const closedNote = [`Force-closed by ${closedByName}`, countedCents === null ? "drawer not counted" : null, note]
      .filter(Boolean)
      .join(" — ");

    const closedAt = new Date();
    const auditSnapshot = buildAuditSnapshot({
      cashierName: shift.cashier_name,
      openedAt: shift.opened_at.toISOString(),
      closedAt: closedAt.toISOString(),
      openingCents: shift.opening_cents,
      expectedCashCents,
      countedCashCents: counted,
      cashVarianceCents,
      note: closedNote,
      ...tally,
    });

    await client.query(
      `UPDATE cashier_shifts
          SET status = 'closed',
              cash_sales_cents = $2, ewallet_sales_cents = $3, card_sales_cents = $4,
              total_sales_cents = $5, txn_count = $6,
              expected_cash_cents = $7, counted_cash_cents = $8, cash_variance_cents = $9,
              note = $10, audit_snapshot = $11, closed_at = $12
        WHERE id = $1`,
      [
        shift.id,
        tally.cashSalesCents,
        tally.ewalletSalesCents,
        tally.cardSalesCents,
        tally.totalSalesCents,
        tally.txnCount,
        expectedCashCents,
        counted,
        cashVarianceCents,
        closedNote,
        auditSnapshot,
        closedAt,
      ],
    );

    await client.query("COMMIT");
    void notifyVariance(tenantId, {
      shiftId: shift.id,
      cashierName: shift.cashier_name,
      varianceCents: cashVarianceCents,
    });
    return {
      ok: true,
      zread: {
        id: shift.id,
        cashierName: shift.cashier_name,
        openingCents: shift.opening_cents,
        openedAt: shift.opened_at.toISOString(),
        closedAt: closedAt.toISOString(),
        expectedCashCents,
        countedCashCents: counted,
        cashVarianceCents,
        note: closedNote,
        auditSnapshot,
        ...tally,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Z-Read: reconcile and freeze the caller's open shift in one transaction.
 * Locks the shift row (FOR UPDATE) so two clicks can't double-close, snapshots
 * the per-channel rollups from the sales stamped to this shift, computes the
 * cash variance to the centavo, and writes the immutable audit payload.
 */
export async function closeShift(
  tenantId: string,
  userId: string,
  countedCents: number,
  note: string | null,
): Promise<CloseShiftResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const shiftRes = await client.query<{
      id: string;
      cashier_name: string;
      opening_cents: number;
      opened_at: Date;
    }>(
      `SELECT id, cashier_name, opening_cents, opened_at
         FROM cashier_shifts
        WHERE tenant_id = $1 AND cashier_user_id = $2 AND status = 'open'
        FOR UPDATE`,
      [tenantId, userId],
    );
    const shift = shiftRes.rows[0];
    if (!shift) {
      await client.query("ROLLBACK");
      return { ok: false, error: "NO_OPEN_SHIFT" };
    }

    const tallyRes = await client.query<TallyRow>(
      `SELECT ${TALLY_SQL} FROM sales WHERE shift_id = $1`,
      [shift.id],
    );
    const tally = toTally(tallyRes.rows[0]);
    const { expectedCashCents, cashVarianceCents } = reconcile(
      shift.opening_cents,
      tally.cashSalesCents,
      countedCents,
    );

    // Freeze the close timestamp once, in JS, so the same instant lands in both
    // the closed_at column and the immutable audit line (they can never drift).
    const closedAt = new Date();
    const auditSnapshot = buildAuditSnapshot({
      cashierName: shift.cashier_name,
      openedAt: shift.opened_at.toISOString(),
      closedAt: closedAt.toISOString(),
      openingCents: shift.opening_cents,
      expectedCashCents,
      countedCashCents: countedCents,
      cashVarianceCents,
      note,
      ...tally,
    });

    await client.query(
      `UPDATE cashier_shifts
          SET status = 'closed',
              cash_sales_cents = $2, ewallet_sales_cents = $3, card_sales_cents = $4,
              total_sales_cents = $5, txn_count = $6,
              expected_cash_cents = $7, counted_cash_cents = $8, cash_variance_cents = $9,
              note = $10, audit_snapshot = $11, closed_at = $12
        WHERE id = $1`,
      [
        shift.id,
        tally.cashSalesCents,
        tally.ewalletSalesCents,
        tally.cardSalesCents,
        tally.totalSalesCents,
        tally.txnCount,
        expectedCashCents,
        countedCents,
        cashVarianceCents,
        note,
        auditSnapshot,
        closedAt,
      ],
    );

    await client.query("COMMIT");
    void notifyVariance(tenantId, {
      shiftId: shift.id,
      cashierName: shift.cashier_name,
      varianceCents: cashVarianceCents,
    });
    return {
      ok: true,
      zread: {
        id: shift.id,
        cashierName: shift.cashier_name,
        openingCents: shift.opening_cents,
        openedAt: shift.opened_at.toISOString(),
        closedAt: closedAt.toISOString(),
        expectedCashCents,
        countedCashCents: countedCents,
        cashVarianceCents,
        note,
        auditSnapshot,
        ...tally,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
