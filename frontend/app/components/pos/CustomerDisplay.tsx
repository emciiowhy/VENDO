"use client";

import { useEffect, useRef, useState } from "react";
import { formatPesoExact } from "@/lib/format";
import { resolveAssetUrl } from "@/lib/images";
import { MockQr } from "./MockQr";
import { BrandMark } from "../BrandMark";
import {
  DISPLAY_CHANNEL,
  IDLE_SNAPSHOT,
  type DisplaySnapshot,
  type DisplayLine,
} from "@/lib/customerDisplay";

/**
 * The Customer-Facing Display — the till's second screen. A glanceable,
 * high-contrast mirror of the active cart with zero administrative controls.
 *
 * It subscribes to the terminal's BroadcastChannel (isolated to this
 * browser/terminal) and re-renders on every snapshot the cashier pad publishes.
 * Four states are driven purely by the snapshot's `status`:
 *   idle    → an inviting welcome with the store name and a live clock
 *   active  → the running cart on the left, a sticky total panel on the right
 *   payment → a full-screen e-wallet QR presentation sheet
 *   paid    → a celebratory thank-you with the change due
 *
 * The "just added" emphasis is computed here by diffing successive snapshots
 * (so the screen flashes the line the cashier just rang) — the wire contract is
 * untouched. Money is integer centavos on the wire.
 */
const peso = (cents: number) => formatPesoExact(cents / 100);

/** Live wall-clock, updated each second (rendered as h:mm AM/PM). */
function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function clockText(d: Date): string {
  return d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

export function CustomerDisplay() {
  const [snap, setSnap] = useState<DisplaySnapshot>(IDLE_SNAPSHOT);
  // The line the cashier most recently added/incremented — flashed for ~2.6s.
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const prevQty = useRef<Map<string, number>>(new Map());
  const hiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const now = useClock();

  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(DISPLAY_CHANNEL);
    ch.onmessage = (e: MessageEvent) => {
      const data = e.data;
      // Ignore control frames (e.g. our own ping) — only mirror real snapshots.
      if (!data || typeof data !== "object" || !("status" in data)) return;
      const s = data as DisplaySnapshot;

      // Diff against the previous snapshot to spot the just-rung line. Doing this
      // in the message handler (not an effect) keeps setState out of effect
      // bodies and fires exactly when a new snapshot lands.
      let changed: string | null = null;
      for (const l of s.lines) {
        if (l.qty > (prevQty.current.get(l.id) ?? 0)) changed = l.id;
      }
      const next = new Map<string, number>();
      for (const l of s.lines) next.set(l.id, l.qty);
      prevQty.current = next;

      if (s.lines.length === 0) {
        setJustAdded(null);
      } else if (changed) {
        setJustAdded(changed);
        if (hiTimer.current) clearTimeout(hiTimer.current);
        hiTimer.current = setTimeout(() => setJustAdded(null), 2600);
      }
      setSnap(s);
    };
    // Ask the cashier pad to re-broadcast its current state (in case the display
    // opened mid-order). The pad answers any "ping" with a fresh snapshot.
    ch.postMessage({ __ping: true });
    return () => {
      ch.close();
      if (hiTimer.current) clearTimeout(hiTimer.current);
    };
  }, []);

  const isActive = snap.status !== "idle" && snap.lines.length > 0;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0f1c] text-white flex flex-col selection:bg-brand-500/40">
      <Ambient />

      {/* Brand header */}
      <header className="relative z-10 shrink-0 flex items-center justify-between px-8 lg:px-10 py-6 border-b border-white/10">
        <div className="flex items-center gap-3.5">
          <BrandMark className="w-10 h-10" />
          <div className="leading-tight">
            <div className="text-[19px] font-extrabold tracking-tightest">{snap.storeName}</div>
            <div className="flex items-center gap-1.5 text-[12px] font-semibold text-white/45">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inset-0 rounded-full bg-accent-500/70 cd-ring" />
                <span className="relative w-1.5 h-1.5 rounded-full bg-accent-500" />
              </span>
              Live order
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {isActive && (
            <div className="text-right">
              <div className="text-[10.5px] font-bold tracking-widest uppercase text-white/35">
                Items
              </div>
              <div className="text-[20px] font-extrabold tabular-nums leading-none mt-0.5">
                {snap.count}
              </div>
            </div>
          )}
          <div className="text-right tabular-nums">
            <div className="text-[10.5px] font-bold tracking-widest uppercase text-white/35">
              {now.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })}
            </div>
            <div className="text-[20px] font-extrabold leading-none mt-0.5">{clockText(now)}</div>
          </div>
        </div>
      </header>

      {/* Body */}
      {isActive ? (
        <ActiveScreen snap={snap} justAdded={justAdded} />
      ) : (
        <IdleScreen storeName={snap.storeName} now={now} />
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
      {snap.status === "paid" && snap.paid && (
        <PaidScreen paid={snap.paid} storeName={snap.storeName} />
      )}
    </div>
  );
}

/* ----------------------------- ambient layer ----------------------------- */

function Ambient() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-40 -right-32 w-[640px] h-[640px] rounded-full bg-brand-500/20 blur-[120px]" />
      <div className="absolute -bottom-48 -left-32 w-[600px] h-[600px] rounded-full bg-accent-500/12 blur-[130px]" />
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(900px 600px at 70% 0%, black, transparent 80%)",
          WebkitMaskImage: "radial-gradient(900px 600px at 70% 0%, black, transparent 80%)",
        }}
      />
    </div>
  );
}

/* ------------------------------- idle state ------------------------------ */

const IDLE_MESSAGES = [
  "Your order will appear here as it's rung up.",
  "We accept Cash, GCash, Maya & QRPH.",
  "Every sale comes with a BIR-ready receipt.",
];

function IdleScreen({ storeName, now }: { storeName: string; now: Date }) {
  const [msg, setMsg] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setMsg((m) => (m + 1) % IDLE_MESSAGES.length), 4200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative z-10 flex-1 grid place-items-center px-8 text-center">
      <div className="cd-float">
        <div className="relative mx-auto w-28 h-28">
          <span className="absolute inset-0 rounded-[28px] bg-brand-500/25 cd-ring" />
          <span className="absolute inset-0 rounded-[28px] bg-brand-500/15 grid place-items-center backdrop-blur-sm ring-1 ring-white/10">
            <BrandMark className="w-14 h-14" />
          </span>
        </div>
        <p className="mt-9 text-[12px] font-bold tracking-[0.2em] uppercase text-brand-200/90">
          Welcome to
        </p>
        <h1 className="mt-2 text-[clamp(2.4rem,5vw,3.6rem)] font-extrabold tracking-tightest leading-[1.05]">
          {storeName}
        </h1>
        <div className="mt-6 h-7 overflow-hidden">
          <p key={msg} className="cd-row-in text-[16px] text-white/55">
            {IDLE_MESSAGES[msg]}
          </p>
        </div>
        <div className="mt-10 text-[15px] font-semibold text-white/30 tabular-nums">
          {now.toLocaleDateString("en-PH", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ active state ----------------------------- */

function ActiveScreen({
  snap,
  justAdded,
}: {
  snap: DisplaySnapshot;
  justAdded: string | null;
}) {
  return (
    <div className="relative z-10 flex-1 min-h-0 grid lg:grid-cols-[1.55fr_1fr]">
      {/* Cart list */}
      <div className="min-h-0 overflow-y-auto px-8 lg:px-10 py-7">
        <div className="max-w-[760px] mx-auto">
          <h2 className="text-[11px] font-bold tracking-[0.2em] uppercase text-white/35 mb-3">
            Your order
          </h2>
          <div className="space-y-1.5">
            {snap.lines.map((l) => (
              <CartRow key={l.id} line={l} hot={l.id === justAdded} />
            ))}
          </div>
        </div>
      </div>

      {/* Summary panel */}
      <SummaryPanel snap={snap} />
    </div>
  );
}

function CartRow({ line, hot }: { line: DisplayLine; hot: boolean }) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (hot) rowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [hot]);

  return (
    <div
      ref={rowRef}
      className={
        "cd-row-in relative flex items-center gap-4 rounded-2xl px-4 py-3.5 transition-colors duration-500 " +
        (hot ? "bg-brand-500/15 ring-1 ring-brand-400/40" : "bg-white/[0.03]")
      }
    >
      {hot && <span className="absolute left-0 top-3 bottom-3 w-1 rounded-full bg-brand-400" />}
      <RowThumb line={line} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[20px] font-bold tracking-tight truncate">{line.name}</span>
          {hot && (
            <span className="shrink-0 rounded-full bg-brand-400/20 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-brand-200">
              Just added
            </span>
          )}
        </div>
        <div className="text-[13.5px] text-white/40 tabular-nums">{peso(line.unitCents)} each</div>
      </div>
      <div className="text-[21px] font-extrabold tracking-tight tabular-nums">
        {peso(line.lineCents)}
      </div>
    </div>
  );
}

/**
 * Leading element of a cart row: the product photo with the quantity as an
 * overlaid badge. Falls back to the plain quantity chip when there's no image
 * (or the image fails to load), so a missing photo never breaks the row.
 */
function RowThumb({ line }: { line: DisplayLine }) {
  const url = resolveAssetUrl(line.imageUrl);
  const [err, setErr] = useState(false);

  if (!url || err) {
    return (
      <span className="grid place-items-center min-w-[3rem] h-12 px-2 rounded-xl bg-white/10 font-extrabold text-[19px] tabular-nums">
        {line.qty}
      </span>
    );
  }
  return (
    <div className="relative w-12 h-12 shrink-0 rounded-xl overflow-hidden bg-white/10 ring-1 ring-white/10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={line.name}
        className="w-full h-full object-cover"
        onError={() => setErr(true)}
      />
      <span className="absolute -bottom-1.5 -right-1.5 grid place-items-center min-w-[1.45rem] h-[1.45rem] px-1 rounded-lg bg-brand-500 text-white text-[12px] font-extrabold tabular-nums ring-2 ring-[#0a0f1c]">
        {line.qty}
      </span>
    </div>
  );
}

function SummaryPanel({ snap }: { snap: DisplaySnapshot }) {
  return (
    <aside className="min-h-0 border-t lg:border-t-0 lg:border-l border-white/10 bg-white/[0.025] backdrop-blur-sm flex flex-col">
      <div className="flex-1 flex flex-col justify-end px-8 lg:px-9 py-7">
        <div className="space-y-2.5">
          <TotalRow
            label={`Subtotal · ${snap.count} item${snap.count === 1 ? "" : "s"}`}
            value={peso(snap.grossCents)}
            dim
          />
          {snap.discountCents > 0 && (
            <TotalRow
              label={snap.discountLabel ?? "Discount"}
              value={`−${peso(snap.discountCents)}`}
              accent
            />
          )}
          <TotalRow label="VAT (12% included)" value={peso(snap.vatCents)} dim />
        </div>

        <div className="mt-5 pt-5 border-t border-white/12">
          <div className="text-[12px] font-bold tracking-[0.18em] uppercase text-white/40">
            Amount due
          </div>
          <div
            key={snap.netCents}
            className="cd-pop mt-1 text-[clamp(2.8rem,6vw,4rem)] leading-[0.95] font-extrabold tracking-tightest tabular-nums origin-left"
          >
            {peso(snap.netCents)}
          </div>
        </div>
      </div>

      {/* Accepted methods footer */}
      <div className="shrink-0 px-8 lg:px-9 py-5 border-t border-white/10">
        <div className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-white/30 mb-2.5">
          We accept
        </div>
        <div className="flex flex-wrap gap-2">
          {["Cash", "GCash", "Maya", "QRPH"].map((m) => (
            <span
              key={m}
              className="rounded-lg bg-white/8 px-3 py-1.5 text-[13px] font-bold text-white/70"
            >
              {m}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}

function TotalRow({
  label,
  value,
  dim,
  accent,
}: {
  label: string;
  value: string;
  dim?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-[16px]">
      <span
        className={accent ? "text-accent-500 font-semibold" : dim ? "text-white/50" : "text-white/80"}
      >
        {label}
      </span>
      <span className={"tabular-nums font-bold " + (accent ? "text-accent-500" : "text-white/90")}>
        {value}
      </span>
    </div>
  );
}

/* ------------------------------- paid state ------------------------------ */

function PaidScreen({
  paid,
  storeName,
}: {
  paid: NonNullable<DisplaySnapshot["paid"]>;
  storeName: string;
}) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-[#0a0f1c] px-8 overlay-backdrop">
      <Ambient />
      <div className="relative text-center overlay-card">
        {/* sparkle accents */}
        <div className="pointer-events-none absolute inset-x-0 -top-2 flex justify-center gap-10">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-500 cd-sparkle" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400 cd-sparkle" style={{ animationDelay: "260ms" }} />
          <span className="w-1.5 h-1.5 rounded-full bg-accent-500 cd-sparkle" style={{ animationDelay: "520ms" }} />
        </div>
        <div className="relative mx-auto w-28 h-28">
          <span className="absolute inset-0 rounded-full bg-accent-500/20 cd-ring" />
          <span className="absolute inset-0 rounded-full bg-accent-500/15 grid place-items-center ring-1 ring-accent-500/30">
            <svg
              viewBox="0 0 24 24"
              className="w-14 h-14 text-accent-500"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
        </div>
        <p className="mt-6 text-[12px] font-bold tracking-[0.2em] uppercase text-white/40">
          {storeName}
        </p>
        <h1 className="mt-2 text-[clamp(2.6rem,5vw,3.4rem)] font-extrabold tracking-tightest">
          Salamat!
        </h1>
        <p className="mt-2 text-[17px] text-white/55">
          {peso(paid.totalCents)} paid via {paid.method}
        </p>

        {paid.changeCents !== null && paid.changeCents > 0 && (
          <div className="mt-7 inline-flex items-center gap-4 rounded-2xl bg-white/8 ring-1 ring-white/10 px-7 py-5">
            <span className="text-[14px] font-semibold text-white/55 uppercase tracking-wide">
              Change
            </span>
            <span className="text-[2.2rem] leading-none font-extrabold tracking-tightest tabular-nums text-accent-500">
              {peso(paid.changeCents)}
            </span>
          </div>
        )}
        {paid.reference && (
          <p className="mt-6 text-[13px] text-white/40 font-mono">Ref ••{paid.reference}</p>
        )}
        <p className="mt-7 text-[14px] text-white/35">Please take your receipt. See you again!</p>
      </div>
    </div>
  );
}

/* --------------------------- e-wallet QR sheet --------------------------- */

const WALLET: Record<string, { tint: string; glow: string }> = {
  GCash: { tint: "text-[#0a6cff]", glow: "bg-[#0a6cff]/20" },
  Maya: { tint: "text-[#00d632]", glow: "bg-[#00d632]/20" },
  QRPH: { tint: "text-brand-600", glow: "bg-brand-500/20" },
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
  const w = WALLET[method] ?? { tint: "text-brand-600", glow: "bg-brand-500/20" };

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-[#0a0f1c]/92 backdrop-blur-md px-8 overlay-backdrop">
      <Ambient />
      <div className="relative w-full max-w-[460px] rounded-[30px] bg-white text-[#0a0f1c] p-9 text-center shadow-soft overlay-card">
        <span
          className={"absolute -top-12 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full blur-3xl " + w.glow}
        />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#f2f4f8] px-4 py-1.5">
            <span className={"text-[1.25rem] font-extrabold tracking-tightest " + w.tint}>
              {method}
            </span>
          </div>
          <p className="mt-3 text-[14px] text-[#56627a]">
            Scan to pay <span className="font-semibold text-[#0a0f1c]">{storeName}</span>
          </p>

          {/* QR with scanning sweep */}
          <div className="mt-6 mx-auto w-fit rounded-[22px] bg-white ring-1 ring-[rgba(11,18,32,0.1)] p-5">
            <div className="relative overflow-hidden rounded-lg">
              {uploaded ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={uploaded}
                  alt={`${method} payment QR`}
                  className="w-[200px] h-[200px] object-contain"
                />
              ) : (
                <MockQr seed={`${method}|${netCents}|${storeName}`} />
              )}
              <span className="pointer-events-none absolute left-1 right-1 top-0 h-8 bg-gradient-to-b from-brand-500/45 to-transparent cd-scan" />
            </div>
          </div>

          <div className="mt-7">
            <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#8a95a8]">
              Amount due
            </div>
            <div className="text-[clamp(2.4rem,7vw,3rem)] leading-none font-extrabold tracking-tightest tabular-nums">
              {peso(netCents)}
            </div>
          </div>

          {/* Steps */}
          <ol className="mt-6 space-y-2 text-left">
            {[
              `Open your ${method} app and tap Scan / Pay QR`,
              "Point your camera at the code above",
              "Confirm the amount, then show the reference to the cashier",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-[13.5px] text-[#56627a]">
                <span className="grid place-items-center w-5 h-5 rounded-full bg-[#0a0f1c] text-white text-[11px] font-bold shrink-0">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
