"use client";

import { useEffect, useState } from "react";
import { formatPesoExact } from "@/lib/format";
import { resolveAssetUrl } from "@/lib/images";
import { MockQr } from "./MockQr";
import {
  DISPLAY_CHANNEL,
  IDLE_SNAPSHOT,
  type DisplaySnapshot,
} from "@/lib/customerDisplay";

/**
 * The Customer-Facing Display — a clean, high-contrast mirror of the active
 * cart with zero administrative controls. Subscribes to the terminal's
 * BroadcastChannel (isolated to this browser/terminal) and re-renders on every
 * snapshot the cashier pad publishes. When an e-wallet checkout is staged, a
 * central QR presentation sheet animates open for the customer to scan.
 */
const peso = (cents: number) => formatPesoExact(cents / 100);

export function CustomerDisplay() {
  const [snap, setSnap] = useState<DisplaySnapshot>(IDLE_SNAPSHOT);

  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(DISPLAY_CHANNEL);
    ch.onmessage = (e: MessageEvent) => {
      const data = e.data;
      // Ignore control frames (e.g. our own ping) — only mirror real snapshots.
      if (data && typeof data === "object" && "status" in data) {
        setSnap(data as DisplaySnapshot);
      }
    };
    // Ask the cashier pad to re-broadcast its current state (in case the display
    // opened mid-order). The pad answers any "ping" with a fresh snapshot.
    ch.postMessage({ __ping: true });
    return () => ch.close();
  }, []);

  return (
    <div className="min-h-screen bg-[#0b1220] text-white flex flex-col selection:bg-brand-500/40">
      {/* Brand header */}
      <header className="shrink-0 flex items-center justify-between px-8 py-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-[11px] bg-brand-500 grid place-items-center font-extrabold text-[18px] tracking-tight">
            V
          </span>
          <div className="leading-tight">
            <div className="text-[18px] font-extrabold tracking-tightest">{snap.storeName}</div>
            <div className="text-[12.5px] font-semibold text-white/45">Customer display</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-bold tracking-widest uppercase text-white/40">Items</div>
          <div className="text-[20px] font-extrabold tabular-nums">{snap.count}</div>
        </div>
      </header>

      {snap.status === "idle" || snap.lines.length === 0 ? (
        <IdleScreen storeName={snap.storeName} />
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Item rows */}
          <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6">
            <div className="max-w-[680px] mx-auto space-y-1">
              {snap.lines.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center gap-4 py-3 border-b border-white/8 last:border-0"
                >
                  <span className="grid place-items-center min-w-[2.75rem] h-11 px-2 rounded-[10px] bg-white/10 font-extrabold text-[17px] tabular-nums">
                    {l.qty}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[19px] font-bold tracking-tight truncate">{l.name}</div>
                    <div className="text-[13.5px] text-white/45 tabular-nums">{peso(l.unitCents)} each</div>
                  </div>
                  <div className="text-[19px] font-extrabold tracking-tight tabular-nums">
                    {peso(l.lineCents)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals tray */}
          <div className="shrink-0 border-t border-white/10 bg-[#0e1729] px-8 py-6">
            <div className="max-w-[680px] mx-auto space-y-2">
              <TotalRow label={`Subtotal (${snap.count} item${snap.count === 1 ? "" : "s"})`} value={peso(snap.grossCents)} dim />
              {snap.discountCents > 0 && (
                <TotalRow
                  label={snap.discountLabel ?? "Discount"}
                  value={`−${peso(snap.discountCents)}`}
                  accent
                />
              )}
              <TotalRow label="VAT (12% incl.)" value={peso(snap.vatCents)} dim />
              <div className="flex items-center justify-between pt-3 mt-1 border-t border-white/12">
                <span className="text-[20px] font-bold">Total</span>
                <span className="text-[2.6rem] leading-none font-extrabold tracking-tightest tabular-nums">
                  {peso(snap.netCents)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* E-wallet QR presentation sheet */}
      {snap.status === "payment" && snap.payment && (
        <QrSheet
          method={snap.payment.method}
          netCents={snap.payment.netCents}
          storeName={snap.storeName}
          qrUrl={snap.payment.qrUrl}
        />
      )}

      {/* Thank-you / paid */}
      {snap.status === "paid" && snap.paid && <PaidScreen paid={snap.paid} storeName={snap.storeName} />}
    </div>
  );
}

function IdleScreen({ storeName }: { storeName: string }) {
  return (
    <div className="flex-1 grid place-items-center px-8 text-center">
      <div>
        <div className="mx-auto w-20 h-20 rounded-[20px] bg-brand-500/15 grid place-items-center">
          <span className="text-brand-400 font-extrabold text-[34px] tracking-tight">₱</span>
        </div>
        <h1 className="mt-6 text-[2rem] font-extrabold tracking-tightest">Welcome to {storeName}</h1>
        <p className="mt-2 text-[15px] text-white/45">Your order will appear here as the cashier rings it up.</p>
      </div>
    </div>
  );
}

function TotalRow({ label, value, dim, accent }: { label: string; value: string; dim?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[15px]">
      <span className={accent ? "text-accent-500 font-semibold" : dim ? "text-white/50" : "text-white/80"}>
        {label}
      </span>
      <span className={"tabular-nums font-bold " + (accent ? "text-accent-500" : "text-white/90")}>{value}</span>
    </div>
  );
}

function PaidScreen({
  paid,
  storeName,
}: {
  paid: NonNullable<DisplaySnapshot["paid"]>;
  storeName: string;
}) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-[#0b1220] px-8 overlay-backdrop">
      <div className="text-center overlay-card">
        <div className="mx-auto w-24 h-24 rounded-full bg-accent-500/15 grid place-items-center">
          <svg viewBox="0 0 24 24" className="w-12 h-12 text-accent-500" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <p className="mt-5 text-[12px] font-bold tracking-widest uppercase text-white/40">{storeName}</p>
        <h1 className="mt-2 text-[2.4rem] font-extrabold tracking-tightest">Salamat!</h1>
        <p className="mt-1 text-[16px] text-white/55">
          {peso(paid.totalCents)} paid via {paid.method}
        </p>
        {paid.changeCents !== null && paid.changeCents > 0 && (
          <div className="mt-6 inline-flex items-center gap-3 rounded-[14px] bg-white/8 px-6 py-4">
            <span className="text-[14px] font-semibold text-white/60">Change</span>
            <span className="text-[1.8rem] font-extrabold tracking-tightest tabular-nums">{peso(paid.changeCents)}</span>
          </div>
        )}
        {paid.reference && (
          <p className="mt-5 text-[13px] text-white/40 font-mono">Ref ••{paid.reference}</p>
        )}
      </div>
    </div>
  );
}

/* --------------------------- e-wallet QR sheet --------------------------- */

const WALLET_TINT: Record<string, string> = {
  GCash: "text-[#0a6cff]",
  Maya: "text-[#00d632]",
  QRPH: "text-brand-400",
};

function QrSheet({
  method,
  netCents,
  storeName,
  qrUrl,
}: {
  method: string;
  netCents: number;
  storeName: string;
  qrUrl: string | null;
}) {
  const uploaded = resolveAssetUrl(qrUrl);
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-[#0b1220]/92 backdrop-blur-sm px-8 overlay-backdrop">
      <div className="w-full max-w-[420px] rounded-[28px] bg-white text-[#0b1220] p-8 text-center shadow-soft overlay-card">
        <div className="flex items-center justify-center gap-2">
          <span className={"text-[1.4rem] font-extrabold tracking-tightest " + (WALLET_TINT[method] ?? "text-brand-600")}>
            {method}
          </span>
        </div>
        <p className="mt-1 text-[13.5px] text-[#56627a]">Scan to pay {storeName}</p>

        <div className="mt-6 mx-auto w-fit rounded-[20px] bg-white ring-1 ring-[rgba(11,18,32,0.1)] p-5">
          {uploaded ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={uploaded} alt={`${method} payment QR`} className="w-[180px] h-[180px] object-contain" />
          ) : (
            <MockQr seed={`${method}|${netCents}|${storeName}`} />
          )}
        </div>

        <div className="mt-6">
          <div className="text-[11px] font-bold tracking-widest uppercase text-[#8a95a8]">Amount due</div>
          <div className="text-[2.6rem] leading-none font-extrabold tracking-tightest tabular-nums">
            {peso(netCents)}
          </div>
        </div>

        <p className="mt-5 text-[12.5px] text-[#8a95a8] leading-relaxed">
          Open your {method} app, scan the code, then show the reference number to the cashier.
        </p>
      </div>
    </div>
  );
}
