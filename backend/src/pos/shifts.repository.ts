import { pool, query } from "../db.js";
import { notifyVariance } from "../notifications/notifications.repository.js";
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
  count(*)::int                                                                            AS txns`;

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
