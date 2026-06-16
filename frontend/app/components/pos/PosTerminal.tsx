"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon, IconSprite, type IconName } from "../Icon";
import { BrandMark } from "../BrandMark";
import { PinSwitcher } from "../auth/PinSwitcher";
import { useSession } from "../auth/useSession";
import { useTheme } from "../theme/ThemeProvider";
import { ThemeToggle } from "../theme/ThemeToggle";
import { TenantTheme } from "../theme/TenantTheme";
import { logout } from "@/lib/auth";
import { formatPesoExact } from "@/lib/format";
import { resolveAssetUrl } from "@/lib/images";
import {
  getActiveShift,
  getCatalog,
  recordAudit,
  submitOrder,
  type ActiveShift,
  type CatalogProduct,
  type Discount,
  type EwalletQrMethod,
  type PaymentMethod,
  type PaymentQrMap,
  type Sale,
  type StoreBrand,
} from "@/lib/pos";
import { searchCustomers, type CustomerLite } from "@/lib/crm";
import { ShiftCloseModal } from "./ShiftModals";
import { MockQr } from "./MockQr";
import { SalesReturnsModal } from "./SalesReturnsModal";
import { printSaleReceipt, type TicketItem } from "./receiptPrint";
import { buildSaleReceipt } from "@/lib/escpos";
import { useThermalPrinter, type UseThermalPrinter } from "./useThermalPrinter";
import { useBarcodeScanner } from "./useBarcodeScanner";
import { ClockWidget } from "./ClockWidget";
import { ActivationWizard } from "./ActivationWizard";
import { getClockStatus } from "@/lib/timecard";
import { ConfirmDialog } from "../ConfirmDialog";
import {
  DISPLAY_CHANNEL,
  type DisplaySnapshot,
  type EwalletMethod,
} from "@/lib/customerDisplay";

/**
 * The locked shop-floor register, wired to the live multi-tenant catalog.
 * Catalog on the left (real products, images, stock gates), running order on
 * the right. Checkout resolution is a centered, animated glass overlay; the
 * order itself is committed by the ACID endpoint POST /api/v1/pos/orders.
 * VAT is shown 12% inclusive, per PH retail. Money is centavos end-to-end.
 */
const UNCATEGORISED = "Uncategorised";

const PAY_METHODS: { key: PaymentMethod; icon: IconName }[] = [
  { key: "Cash", icon: "peso" },
  { key: "GCash", icon: "wallet" },
  { key: "Maya", icon: "wallet" },
  { key: "QRPH", icon: "card" },
];

interface Line {
  product: CatalogProduct;
  qty: number;
}

const EMPTY_STORE: StoreBrand = {
  name: "Register",
  slug: null,
  address: null,
  phone: null,
  tin: null,
  businessStyle: null,
  vatLabel: null,
  receiptHeader: null,
  receiptFooter: null,
  logoUrl: null,
  ptu: null,
  min: null,
  serial: null,
};

/** centavos → "₱1,234.50" */
const peso = (cents: number) => formatPesoExact(cents / 100);

/** Resolve a cart discount to centavos against the gross. */
function computeDiscountCents(d: Discount | null, gross: number): number {
  if (!d) return 0;
  if (d.type === "percent") return Math.round((gross * Math.min(100, Math.max(0, d.value))) / 100);
  return Math.min(gross, Math.max(0, Math.round(d.value)));
}
function discountText(d: Discount | null): string | null {
  if (!d) return null;
  if (d.label) return d.label;
  return d.type === "percent" ? `${d.value}% off` : `${peso(d.value)} off`;
}

/** Animated-exit helper for the centered overlays. */
function useDismiss(onClose: () => void) {
  const [closing, setClosing] = useState(false);
  const dismiss = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, 200);
  }, [onClose]);
  // Esc closes with the same animated exit as a backdrop click, so every register
  // overlay dismisses identically under the keyboard — matching the back-office
  // modals (ConfirmDialog, ReorderModal) that already honour Esc.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);
  return { closing, dismiss };
}

export function PosTerminal() {
  const session = useSession(["CASHIER", "MANAGER", "MERCHANT_OWNER"]);
  const { theme } = useTheme();

  const [store, setStore] = useState<StoreBrand>(EMPTY_STORE);
  const storeName = store.name;
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [paymentQrs, setPaymentQrs] = useState<PaymentQrMap>({ GCash: null, Maya: null, QRPH: null });
  const [catOrder, setCatOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [cat, setCat] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Transient barcode-scan feedback ("not found" / "out of stock"); cleared on the
  // next keystroke. Scanner success just drops the item in the cart silently.
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, Line>>({});
  const [discount, setDiscount] = useState<Discount | null>(null);
  const [cartOpenMobile, setCartOpenMobile] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);
  // The just-completed sale plus a snapshot of its lines, kept for the printed
  // ticket (the cart itself is cleared the moment payment lands).
  const [receipt, setReceipt] = useState<{ sale: Sale; items: TicketItem[] } | null>(null);
  // The settlement method currently staged in the checkout overlay (drives the
  // customer display's QR sheet). null when the overlay is closed.
  const [checkoutMethod, setCheckoutMethod] = useState<PaymentMethod | null>(null);

  // Shift reconciliation lifecycle (X-Read / Z-Read).
  const [shift, setShift] = useState<ActiveShift | null>(null);
  const [shiftLoading, setShiftLoading] = useState(true);
  // Labor-clock state (distinct from the cash drawer above): whether the operator
  // holds an open timecard. `null` until the first probe resolves — both this and
  // an open drawer are required before the ActivationWizard releases the till.
  const [clockedIn, setClockedIn] = useState<boolean | null>(null);
  // Owner-set default opening float for this operator, pre-filling the X-Read gate.
  const [defaultFloatCents, setDefaultFloatCents] = useState(0);
  const [closeShiftOpen, setCloseShiftOpen] = useState(false);
  // After a cashier closes their drawer we stay on the till and prompt for the
  // next cashier (no full sign-out), so handover is a PIN away.
  const [nextCashierOpen, setNextCashierOpen] = useState(false);
  // Confirmation for sign-out / terminal-lock / drawer actions.
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
    icon?: IconName;
    danger?: boolean;
  } | null>(null);
  // The on-the-floor shift-clock sheet (labor time-tracking, distinct from the
  // cash-drawer X/Z-Read shift above). Lifted here so its open state can suspend
  // the barcode wedge like every other register overlay.
  const [clockOpen, setClockOpen] = useState(false);

  const refreshShift = useCallback(async () => {
    const res = await getActiveShift();
    if (res.ok) setShift(res.shift);
  }, []);

  // The mandatory activation gate. A cashier may only trade once they are BOTH
  // on the labor clock AND holding an open cash drawer; until then the
  // ActivationWizard owns the screen and the workspace behind it is inert.
  // Owners/managers ring up directly (no personal drawer), so they're never
  // gated — preserving the prior OpeningShiftModal behaviour.
  const terminalLocked =
    session.status === "authed" &&
    session.user.role === "CASHIER" &&
    !shiftLoading &&
    clockedIn !== null &&
    !(clockedIn && shift) &&
    !nextCashierOpen;

  // ── Hardware peripherals ───────────────────────────────────────────────────
  // Thermal printer (WebUSB / Web Bluetooth) connection controller. Capability
  // is detected post-mount inside the hook, so this is SSR-safe.
  const thermal = useThermalPrinter();
  // Global barcode/QR wedge capture: a hardware scanner can ring items from
  // anywhere on the floor, not only the search box. Suspended while an overlay
  // owns the screen so a stray scan can't mutate a cart the cashier can't see.
  const scanOverlayOpen =
    checkoutOpen || discountOpen || voidOpen || salesOpen || closeShiftOpen || nextCashierOpen || clockOpen || !!confirm || !!receipt || terminalLocked;
  useBarcodeScanner({
    onScan: (code) => addByScan(code),
    enabled: session.status === "authed" && !loading && !scanOverlayOpen,
  });

  const applyCatalog = useCallback(
    (data: Awaited<ReturnType<typeof getCatalog>>) => {
      if (data.ok) {
        setStore(data.store);
        setProducts(data.products);
        setPaymentQrs(data.paymentQrs);
        // Tab order: declared categories that actually have products, then
        // "Uncategorised" if any product has no category.
        const present = new Set(data.products.map((p) => p.categoryName ?? UNCATEGORISED));
        const ordered = data.categories.map((c) => c.name).filter((n) => present.has(n));
        if (present.has(UNCATEGORISED)) ordered.push(UNCATEGORISED);
        setCatOrder(ordered);
        setCat((cur) => cur ?? ordered[0] ?? null);
      } else {
        setLoadError(data.error ?? "Could not load the catalog.");
      }
      setLoading(false);
    },
    [],
  );

  // Initial load (setState lands after the await, with an alive guard).
  useEffect(() => {
    let alive = true;
    void (async () => {
      const data = await getCatalog();
      if (alive) applyCatalog(data);
    })();
    return () => {
      alive = false;
    };
  }, [applyCatalog]);

  const reloadCatalog = useCallback(async () => {
    applyCatalog(await getCatalog());
  }, [applyCatalog]);

  // Resolve the operator's open shift once the session is confirmed. The
  // OpeningShiftModal gates the till until one exists. (setState lands after
  // the await — never synchronously in the effect body.)
  useEffect(() => {
    if (session.status !== "authed") return;
    let alive = true;
    void (async () => {
      // Probe both gates the wizard cares about — the open drawer shift and the
      // labor clock — in one pass. setState lands after the await (never in the
      // effect body), keeping the set-state-in-effect rule satisfied.
      const [shiftRes, clockRes] = await Promise.all([getActiveShift(), getClockStatus()]);
      if (!alive) return;
      if (shiftRes.ok) {
        setShift(shiftRes.shift);
        setDefaultFloatCents(shiftRes.defaultFloatCents);
      }
      setClockedIn(clockRes.ok ? clockRes.timecard !== null : false);
      setShiftLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [session.status]);

  const lines = Object.values(cart);
  const grossCents = useMemo(() => lines.reduce((s, l) => s + l.product.priceCents * l.qty, 0), [lines]);
  const discountCents = useMemo(() => computeDiscountCents(discount, grossCents), [discount, grossCents]);
  const netCents = Math.max(0, grossCents - discountCents);
  const vatCents = Math.round((netCents * 12) / 112);
  const count = lines.reduce((s, l) => s + l.qty, 0);

  // ── Customer-facing display sync (terminal-local BroadcastChannel) ─────────
  const displayChannel = useRef<BroadcastChannel | null>(null);

  const snapshot = useMemo<DisplaySnapshot>(() => {
    const accent = session.status === "authed" ? session.user.themeColor ?? null : null;
    const logoUrl = session.status === "authed" ? session.user.tenantLogoUrl ?? null : null;
    const status: DisplaySnapshot["status"] = receipt
      ? "paid"
      : checkoutOpen && checkoutMethod && checkoutMethod !== "Cash"
        ? "payment"
        : count > 0
          ? "active"
          : "idle";
    return {
      storeName,
      accent,
      logoUrl,
      status,
      lines: lines.map((l) => ({
        id: l.product.id,
        name: l.product.name,
        qty: l.qty,
        unitCents: l.product.priceCents,
        lineCents: l.product.priceCents * l.qty,
        imageUrl: l.product.imageUrl,
      })),
      grossCents,
      discountCents,
      discountLabel: discountText(discount),
      vatCents,
      netCents,
      count,
      payment:
        status === "payment" && checkoutMethod
          ? {
            method: checkoutMethod as EwalletMethod,
            netCents,
            // Show the owner's uploaded QR for this rail (null → placeholder).
            qrUrl: paymentQrs[checkoutMethod as EwalletQrMethod] ?? null,
          }
          : null,
      paid: receipt
        ? {
          totalCents: receipt.sale.totalCents,
          method: receipt.sale.paymentMethod,
          reference: receipt.sale.paymentRef,
          changeCents: receipt.sale.changeCents,
        }
        : null,
    };
    // discountText is a module-level pure helper.
  }, [storeName, lines, grossCents, discountCents, discount, vatCents, netCents, count, checkoutOpen, checkoutMethod, receipt, paymentQrs, session]);

  const snapshotRef = useRef(snapshot);

  // Open the channel once; answer a display "ping" with the latest snapshot so a
  // screen that opens mid-order catches up immediately.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(DISPLAY_CHANNEL);
    displayChannel.current = ch;
    ch.onmessage = (e: MessageEvent) => {
      if (e.data && typeof e.data === "object" && "__ping" in e.data) {
        ch.postMessage(snapshotRef.current);
      }
    };
    return () => {
      ch.close();
      displayChannel.current = null;
    };
  }, []);

  // Mirror every snapshot change to the customer display (postMessage + ref are
  // not setState, so this effect is rule-safe).
  useEffect(() => {
    snapshotRef.current = snapshot;
    displayChannel.current?.postMessage(snapshot);
  }, [snapshot]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return products.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q),
      );
    }
    return products.filter((p) => (p.categoryName ?? UNCATEGORISED) === cat);
  }, [products, query, cat]);

  function add(p: CatalogProduct) {
    if (p.stock <= 0) return; // hard reject out-of-stock taps
    setCart((c) => {
      const cur = c[p.id]?.qty ?? 0;
      if (cur >= p.stock) return c; // never queue more than is on hand
      return { ...c, [p.id]: { product: p, qty: cur + 1 } };
    });
  }
  // Barcode scan: a USB/Bluetooth scanner types the code then sends Enter. Resolve
  // it to a product — exact SKU match first (what a scanner emits), then a sole
  // filtered result — add it to the cart and clear the box for the next scan. No
  // match / out of stock surfaces a transient message instead of a silent no-op.
  function scanToCart() {
    const code = query.trim();
    if (!code) return;
    const lc = code.toLowerCase();
    const bySku = products.find((p) => (p.sku ?? "").toLowerCase() === lc);
    const target = bySku ?? (visible.length === 1 ? visible[0] : null);
    if (!target) {
      setScanMsg(`No product matches “${code}”.`);
      return;
    }
    if (target.stock <= 0) {
      setScanMsg(`${target.name} is out of stock.`);
      return;
    }
    add(target);
    setQuery("");
    setScanMsg(null);
  }
  // Hardware-scanner path (global wedge capture). No query context exists, so it
  // resolves an exact SKU only — a miss surfaces the same transient message so
  // the cashier knows to key the item manually.
  function addByScan(code: string) {
    const c = code.trim();
    if (!c) return;
    const hit = products.find((p) => (p.sku ?? "").toLowerCase() === c.toLowerCase());
    if (!hit) {
      setScanMsg(`No product matches “${c}”.`);
      return;
    }
    if (hit.stock <= 0) {
      setScanMsg(`${hit.name} is out of stock.`);
      return;
    }
    add(hit);
    setScanMsg(null);
  }
  function setQty(id: string, qty: number) {
    const line = cart[id];
    if (!line) return;
    const capped = Math.min(qty, line.product.stock);
    if (capped <= 0) {
      // The line is being voided out of the active cart — a sensitive action the
      // owner can audit. Best-effort telemetry; never blocks the register.
      void recordAudit({
        action: "void_item",
        itemName: line.product.name,
        itemQty: line.qty,
        valueCents: line.product.priceCents * line.qty,
      });
      setCart((c) => {
        const next = { ...c };
        delete next[id];
        return next;
      });
      return;
    }
    setCart((c) => {
      const cur = c[id];
      if (!cur) return c;
      return { ...c, [id]: { ...cur, qty: capped } };
    });
  }
  function clearCart() {
    setCart({});
    setDiscount(null);
  }

  function onPaid(sale: Sale) {
    // Snapshot the cart lines for the printed ticket BEFORE clearing them.
    const items: TicketItem[] = lines.map((l) => ({
      name: l.product.name,
      qty: l.qty,
      unitCents: l.product.priceCents,
    }));
    setReceipt({ sale, items });
    setCheckoutOpen(false);
    setCartOpenMobile(false);
    clearCart();
    setCheckoutMethod(null);
    void refreshShift(); // roll the just-rung sale into the shift tallies
    // Push the ticket straight to a connected thermal unit on settlement;
    // best-effort, and the HTML receipt stays available as a fallback.
    if (thermal.status === "connected") {
      const cashierName = session.status === "authed" ? session.user.name : null;
      void thermal.print(buildSaleReceipt({ store, sale, items, cashierName, kickDrawer: true }));
    }
  }
  function newSale() {
    setReceipt(null);
    void reloadCatalog(); // reflect the just-decremented stock
  }

  if (session.status !== "authed") {
    return (
      <div
        data-vp-theme=""
        className={
          "theme-root grid-bg min-h-screen grid place-items-center bg-paper text-ink " +
          (theme === "dark" ? "dark" : "")
        }
      >
        <div className="flex items-center gap-3 text-ink-soft">
          <BrandMark className="w-9 h-9 animate-pulse" />
          <span className="text-[14px] font-semibold">Locking terminal…</span>
        </div>
      </div>
    );
  }
  const user = session.user;

  // Escape hatch: owners/managers return to the back office; a cashier "locks"
  // the till by clearing their session (back to the PIN/login screen) — no
  // cross-tenant leakage either way. Logout-style actions ask to confirm first.
  const lockAndSignOut = () => void logout().then(() => (window.location.href = "/login"));
  const exitTerminal = () => {
    if (user.role === "CASHIER") {
      setConfirm({
        title: "Lock terminal?",
        message: "This signs out the till and returns to the Store ID / PIN screen.",
        confirmLabel: "Lock terminal",
        onConfirm: lockAndSignOut,
      });
    } else {
      window.location.href = "/dashboard";
    }
  };
  const requestSignOut = () =>
    setConfirm({
      title: "Sign out?",
      message: "You'll be returned to the login screen and will need to sign in again.",
      confirmLabel: "Sign out",
      onConfirm: lockAndSignOut,
    });
  const exitLabel = user.role === "CASHIER" ? "Lock terminal" : "Exit to dashboard";

  // After a Z-Read the shift is reconciled. The role decides what "done" means:
  //  • CASHIER — a terminal operator: keep the till on screen and immediately ask
  //    "who's next?" via the cashier switcher, so the incoming cashier takes over
  //    with a PIN (no full Store ID re-login between shifts). Their PIN switch
  //    reloads the page as themselves and the X-Read gate prompts a fresh shift.
  //  • MERCHANT_OWNER / MANAGER — they closed the drawer themselves, they're not
  //    bound to this register; return them straight to the back office.
  const isCashier = user.role === "CASHIER";
  const endShiftExit = () => {
    if (isCashier) {
      setCloseShiftOpen(false);
      setShift(null);
      setNextCashierOpen(true);
    } else {
      window.location.href = "/dashboard";
    }
  };

  const cartProps = {
    lines,
    grossCents,
    discountCents,
    discountLabel: discountText(discount),
    netCents,
    vatCents,
    count,
    setQty,
    onDiscount: () => setDiscountOpen(true),
    onVoid: () => setVoidOpen(true),
    onCheckout: () => {
      setCheckoutOpen(true);
      setCheckoutMethod("Cash"); // default rail; the customer screen stays on the order
      // Pull the owner's latest uploaded checkout QRs so a code uploaded mid-shift
      // surfaces immediately — no terminal reload needed. Cart is left untouched.
      void (async () => {
        const data = await getCatalog();
        if (data.ok) setPaymentQrs(data.paymentQrs);
      })();
    },
  };

  const closeCheckout = () => {
    setCheckoutOpen(false);
    setCheckoutMethod(null);
  };

  return (
    <div
      data-vp-theme=""
      className={
        "theme-root h-screen flex flex-col bg-paper text-ink overflow-hidden " +
        (theme === "dark" ? "dark" : "")
      }
    >
      <TenantTheme accent={user.themeColor} />
      <IconSprite />

      {/* Lock bar — relative + raised z-index so it owns its own stacking layer,
          fully separated from the catalog/search column below it. */}
      <header className="relative z-20 shrink-0 glass hairline-b">
        <div className="flex items-center gap-3 px-5 h-[60px]">
          {/* Escape hatch */}
          <button
            type="button"
            onClick={exitTerminal}
            title={exitLabel}
            aria-label={exitLabel}
            className="inline-flex items-center gap-2 rounded-[10px] bg-surface hairline px-3 py-2 text-[13px] font-semibold text-ink-soft hover:text-brand-600 hover:border-brand-200 transition duration-150 ease-in-out"
          >
            <Icon name="arrow" className="w-[18px] h-[18px] rotate-180" strokeWidth={1.8} />
            <span className="hidden sm:inline">{exitLabel}</span>
          </button>

          <div className="flex items-center gap-2.5">
            {user.tenantLogoUrl ? (
              // Store logo is a cross-origin uploads URL; plain <img> avoids Image config.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.tenantLogoUrl}
                alt={storeName}
                className="w-8 h-8 rounded-[8px] object-cover hairline"
              />
            ) : (
              <BrandMark className="w-8 h-8" />
            )}
            <div className="leading-tight">
              <div className="font-extrabold text-[15px] tracking-tightest">{storeName}</div>
              <div className="text-[11px] font-semibold text-ink-faint flex items-center gap-1.5">
                <Icon name="lock" className="w-3 h-3" strokeWidth={1.8} />
                Register 1 · locked terminal
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            <button
              type="button"
              onClick={() =>
                setConfirm({
                  title: "Open cash drawer?",
                  message:
                    "This “No Sale” drawer kick is recorded in the audit log for the owner to review.",
                  confirmLabel: "Open drawer",
                  icon: "wallet",
                  danger: false,
                  onConfirm: () => {
                    void recordAudit({ action: "open_drawer", detail: "No Sale drawer kick" });
                    setConfirm(null);
                  },
                })
              }
              title="Open cash drawer (No Sale)"
              aria-label="Open cash drawer"
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-surface hairline px-3 py-2 text-[13px] font-semibold text-ink-soft hover:text-brand-600 hover:border-brand-200 transition duration-150"
            >
              <Icon name="wallet" className="w-[18px] h-[18px]" strokeWidth={1.7} />
              <span className="hidden lg:inline">Open drawer</span>
            </button>
            <button
              type="button"
              onClick={() => setSalesOpen(true)}
              title="Sales & returns"
              aria-label="Sales and returns"
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-surface hairline px-3 py-2 text-[13px] font-semibold text-ink-soft hover:text-brand-600 hover:border-brand-200 transition duration-150"
            >
              <Icon name="refresh" className="w-[18px] h-[18px]" strokeWidth={1.7} />
              <span className="hidden lg:inline">Returns</span>
            </button>
            <button
              type="button"
              onClick={() => window.open("/pos/customer-display", "vendopos-customer-display", "noopener")}
              title="Open customer display"
              aria-label="Open customer display"
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-surface hairline px-3 py-2 text-[13px] font-semibold text-ink-soft hover:text-brand-600 hover:border-brand-200 transition duration-150"
            >
              <Icon name="monitor" className="w-[18px] h-[18px]" strokeWidth={1.7} />
              <span className="hidden lg:inline">Customer display</span>
            </button>
            <ClockWidget open={clockOpen} onOpenChange={setClockOpen} />
            <Link
              href="/me"
              title="My record — hours, PTO & paystubs"
              aria-label="My record"
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-surface hairline px-3 py-2 text-[13px] font-semibold text-ink-soft hover:text-brand-600 hover:border-brand-200 transition duration-150"
            >
              <Icon name="clock" className="w-[18px] h-[18px]" strokeWidth={1.7} />
              <span className="hidden lg:inline">My record</span>
            </Link>
            <ThemeToggle />
            <div className="hidden sm:flex items-center gap-2.5 rounded-[10px] bg-surface hairline px-3 py-1.5">
              <span className="w-7 h-7 rounded-full bg-accent-500 text-white grid place-items-center font-bold text-[12px]">
                {(user.name[0] ?? "C").toUpperCase()}
              </span>
              <div className="leading-tight">
                <div className="text-[12.5px] font-bold tracking-tight">{user.name}</div>
                <div className="text-[10.5px] font-semibold text-ink-faint tabular-nums">
                  {shift
                    ? `Drawer · ${peso(shift.expectedCashCents)}`
                    : isCashier
                      ? "No open shift"
                      : user.role === "MERCHANT_OWNER"
                        ? "Owner"
                        : "Manager"}
                </div>
              </div>
            </div>
            {shift && (
              <button
                type="button"
                onClick={() => void refreshShift().then(() => setCloseShiftOpen(true))}
                title="End shift (Z-Read)"
                aria-label="End shift"
                className="inline-flex items-center gap-1.5 rounded-[10px] bg-surface hairline px-3 py-2 text-[13px] font-semibold text-ink-soft hover:text-rose-600 hover:border-rose-200 transition duration-150"
              >
                <Icon name="receipt" className="w-[18px] h-[18px]" strokeWidth={1.8} />
                <span className="hidden sm:inline">End shift</span>
              </button>
            )}
            <PinSwitcher
              triggerLabel="Switch"
              triggerClassName="inline-flex items-center gap-1.5 bg-surface hairline rounded-[10px] px-3 py-2 text-[13px] font-semibold hover:border-brand-200 hover:text-brand-600 transition duration-150"
              openShift={shift ? { expectedCashCents: shift.expectedCashCents } : null}
              onCloseShift={() => void refreshShift().then(() => setCloseShiftOpen(true))}
            />
            <button
              type="button"
              onClick={requestSignOut}
              aria-label="Sign out"
              className="grid place-items-center w-9 h-9 rounded-[10px] bg-surface hairline text-ink-soft hover:text-rose-600 hover:border-rose-200 transition duration-150"
            >
              <Icon name="logout" className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      </header>

      {/* Body — blurred and inert while the activation wizard holds the till. */}
      <div
        className={
          "flex-1 min-h-0 grid lg:grid-cols-[1fr_380px] transition duration-200 " +
          (terminalLocked ? "blur-sm pointer-events-none select-none" : "")
        }
        aria-hidden={terminalLocked}
      >
        {/* Catalog */}
        <div className="flex flex-col min-h-0 p-4 sm:p-5">
          <div className="relative z-10 flex flex-wrap items-center gap-2.5">
            <label className="relative flex-1 min-w-[180px]">
              <Icon name="search" className="w-[16px] h-[16px] text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (scanMsg) setScanMsg(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    scanToCart();
                  }
                }}
                placeholder="Search or scan barcode…"
                className="field-input rounded-[10px] pl-9 pr-3 py-2.5 text-[14px] w-full"
              />
            </label>
          </div>

          {scanMsg && (
            <div className="relative z-10 mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-rose-600">
              <Icon name="ban" className="w-[15px] h-[15px]" strokeWidth={1.8} />
              {scanMsg}
            </div>
          )}

          {!query && catOrder.length > 0 && (
            <div className="relative z-10 mt-3 flex gap-2 overflow-x-auto pb-1">
              {catOrder.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCat(c)}
                  className={
                    "shrink-0 px-4 py-2 rounded-[10px] text-[13.5px] font-semibold transition duration-150 " +
                    (cat === c
                      ? "bg-ink dark:bg-[#0b1220] text-white"
                      : "bg-surface hairline text-ink-soft hover:text-ink")
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="py-20 text-center text-ink-soft text-[14px]">Loading catalog…</div>
            ) : loadError ? (
              <div className="py-20 text-center text-rose-600 text-[14px] font-semibold">{loadError}</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 pb-4">
                {visible.map((p) => (
                  <ProductTile key={p.id} product={p} inCart={cart[p.id]?.qty ?? 0} onAdd={() => add(p)} />
                ))}
                {visible.length === 0 && (
                  <div className="col-span-full py-16 text-center text-ink-soft text-[14px]">
                    {products.length === 0 ? "No products in this store yet." : "No products found."}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Cart — sidebar on lg */}
        <CartPanel className="hidden lg:flex" {...cartProps} />
      </div>

      {/* Mobile cart bar */}
      <button
        type="button"
        onClick={() => setCartOpenMobile(true)}
        className="lg:hidden shrink-0 flex items-center justify-between gap-3 px-5 py-3.5 bg-brand-500 text-white font-semibold shadow-btn"
      >
        <span className="flex items-center gap-2">
          <Icon name="cart" className="w-5 h-5" strokeWidth={1.7} />
          {count} item{count === 1 ? "" : "s"}
        </span>
        <span className="tracking-tight">{peso(netCents)} · View cart</span>
      </button>

      {cartOpenMobile && (
        <div className="lg:hidden fixed inset-0 z-[100] flex flex-col justify-end">
          <button aria-label="Close" onClick={() => setCartOpenMobile(false)} className="absolute inset-0 bg-black/50" />
          <div className="relative max-h-[88vh]">
            <CartPanel className="flex rounded-t-xl2" onClose={() => setCartOpenMobile(false)} {...cartProps} />
          </div>
        </div>
      )}

      {/* Centered checkout overlay */}
      {checkoutOpen && (
        <CheckoutOverlay
          lines={lines}
          grossCents={grossCents}
          discountCents={discountCents}
          discountLabel={discountText(discount)}
          netCents={netCents}
          count={count}
          discount={discount}
          paymentQrs={paymentQrs}
          onMethodChange={setCheckoutMethod}
          onClose={closeCheckout}
          onPaid={onPaid}
          onStockConflict={() => void reloadCatalog()}
        />
      )}

      {/* Discount editor */}
      {discountOpen && (
        <DiscountModal
          grossCents={grossCents}
          current={discount}
          onClose={() => setDiscountOpen(false)}
          onApply={(d) => {
            setDiscount(d);
            setDiscountOpen(false);
          }}
        />
      )}

      {/* Void confirmation */}
      {voidOpen && (
        <VoidModal
          count={count}
          onClose={() => setVoidOpen(false)}
          onConfirm={() => {
            // Cancelling a transaction mid-ring is auditable shrinkage surface —
            // record it before the cart is cleared.
            void recordAudit({
              action: "cancel_transaction",
              itemQty: count,
              valueCents: netCents,
              detail: `${count} item${count === 1 ? "" : "s"} cleared before payment`,
            });
            clearCart();
            setVoidOpen(false);
          }}
        />
      )}

      {/* Centered receipt overlay */}
      {receipt && (
        <ReceiptOverlay
          sale={receipt.sale}
          items={receipt.items}
          store={store}
          cashierName={user.name}
          thermal={thermal}
          onClose={newSale}
        />
      )}

      {/* Sales & Returns desk (void / refund completed sales). */}
      {salesOpen && (
        <SalesReturnsModal
          store={store}
          onClose={() => setSalesOpen(false)}
          onReversed={() => {
            void refreshShift();
            void reloadCatalog();
          }}
        />
      )}

      {/* Mandatory terminal-activation gate: Staff ➔ PIN ➔ Clock In ➔ Open
          Drawer ➔ Active. Locks the workspace until the cashier is on the labor
          clock AND has an open cash drawer. Cashiers only — owners/managers ring
          up directly without a personal drawer. */}
      {terminalLocked && (
        <ActivationWizard
          user={user}
          clockedIn={clockedIn === true}
          defaultFloatCents={defaultFloatCents}
          onClockedIn={() => setClockedIn(true)}
          onActivated={(s) => setShift(s)}
          onExit={exitTerminal}
        />
      )}

      {/* Shift reconciliation (Z-Read). */}
      {closeShiftOpen && shift && (
        <ShiftCloseModal
          shift={shift}
          onCancel={() => setCloseShiftOpen(false)}
          onClosed={endShiftExit}
          finishLabel={isCashier ? "Finish & hand over" : "Finish & return to dashboard"}
          finishIcon={isCashier ? "users" : "arrow"}
        />
      )}

      {/* Cashier handover: after a Z-Read, ask who takes the till next. The
          incoming cashier picks their profile + PIN; the switch reloads /pos as
          them and the X-Read gate prompts a fresh shift. */}
      {nextCashierOpen && (
        <PinSwitcher
          autoOpen
          hideTrigger
          openShift={null}
          selectTitle="Next cashier"
          selectSubtitle="Select the cashier taking over the till."
          onClose={() => setNextCashierOpen(false)}
        />
      )}

      {/* Sign-out / lock confirmation. */}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          icon={confirm.icon ?? "logout"}
          danger={confirm.danger ?? true}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm.onConfirm}
        />
      )}
    </div>
  );
}

/* ------------------------------ product tile ------------------------------ */

function ProductTile({
  product,
  inCart,
  onAdd,
}: {
  product: CatalogProduct;
  inCart: number;
  onAdd: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const soldOut = product.stock <= 0;
  const low = !soldOut && product.lowStockThreshold > 0 && product.stock <= product.lowStockThreshold;
  const maxed = !soldOut && inCart >= product.stock;
  const imgSrc = imgFailed ? null : resolveAssetUrl(product.imageUrl);

  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={soldOut}
      aria-disabled={soldOut}
      className={
        "relative group text-left rounded-xl2 bg-surface hairline shadow-card p-3 transition duration-150 " +
        (soldOut
          ? "opacity-60 cursor-not-allowed"
          : "hover:border-brand-200 hover:shadow-soft active:scale-[0.98]")
      }
    >
      <div className="relative aspect-square rounded-lg bg-paper hairline overflow-hidden grid place-items-center mb-2.5">
        {imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgSrc}
            alt={product.name}
            className="w-full h-full object-cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <Icon name="image" className="w-8 h-8 text-ink-faint" strokeWidth={1.5} />
        )}

        {low && (
          <span className="absolute top-1.5 right-1.5 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10.5px] font-bold tabular-nums">
            {product.stock} left
          </span>
        )}

        {soldOut && (
          <span className="absolute inset-0 grid place-items-center bg-surface/55">
            <span className="rounded-full bg-ink dark:bg-[#0b1220] text-white px-3 py-1 text-[11px] font-bold tracking-tight">
              Sold out
            </span>
          </span>
        )}
      </div>

      <div className="font-bold tracking-tight leading-tight line-clamp-2">{product.name}</div>
      <div className="mt-0.5 flex items-center justify-between">
        <span className="text-[13.5px] font-semibold text-ink-soft">{peso(product.priceCents)}</span>
        {!soldOut && inCart > 0 && (
          <span className="text-[11px] font-bold text-brand-600">
            {inCart}
            {maxed ? " · max" : ""}
          </span>
        )}
      </div>
    </button>
  );
}

/* -------------------------------- cart panel -------------------------------- */

interface CartProps {
  className?: string;
  onClose?: () => void;
  lines: Line[];
  grossCents: number;
  discountCents: number;
  discountLabel: string | null;
  netCents: number;
  vatCents: number;
  count: number;
  setQty: (id: string, qty: number) => void;
  onDiscount: () => void;
  onVoid: () => void;
  onCheckout: () => void;
}

function CartPanel({
  className = "",
  onClose,
  lines,
  grossCents,
  discountCents,
  discountLabel,
  netCents,
  vatCents,
  count,
  setQty,
  onDiscount,
  onVoid,
  onCheckout,
}: CartProps) {
  const empty = lines.length === 0;
  return (
    <aside className={"flex-col bg-surface min-h-0 lg:border-l lg:border-[rgba(11,18,32,0.07)] " + className}>
      <div className="shrink-0 flex items-center justify-between px-5 py-4 hairline-b">
        <h2 className="font-extrabold tracking-tight flex items-center gap-2">
          <Icon name="cart" className="w-[18px] h-[18px] text-brand-600" strokeWidth={1.7} />
          Current order
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onDiscount}
            disabled={empty}
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-paper hairline px-2.5 py-1.5 text-[12px] font-bold text-ink-soft hover:text-brand-600 hover:border-brand-200 transition duration-150 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Icon name="tag" className="w-[15px] h-[15px]" strokeWidth={1.7} />
            Discount
          </button>
          <button
            type="button"
            onClick={onVoid}
            disabled={empty}
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-paper hairline px-2.5 py-1.5 text-[12px] font-bold text-ink-soft hover:text-rose-600 hover:border-rose-200 transition duration-150 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Icon name="ban" className="w-[15px] h-[15px]" strokeWidth={1.7} />
            Void
          </button>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close" className="lg:hidden text-ink-faint hover:text-ink p-1 ml-0.5">
              <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {lines.length === 0 ? (
          <div className="h-full grid place-items-center text-center text-ink-faint py-16">
            <div>
              <Icon name="cart" className="w-10 h-10 mx-auto opacity-40" strokeWidth={1.4} />
              <p className="mt-3 text-[13.5px] font-semibold">No items yet</p>
              <p className="text-[12.5px]">Tap a product to start an order.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {lines.map((l) => (
              <div key={l.product.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-bold tracking-tight truncate">{l.product.name}</div>
                  <div className="text-[12px] text-ink-faint">{peso(l.product.priceCents)} ea</div>
                </div>
                <div className="flex items-center gap-1.5">
                  <QtyBtn onClick={() => setQty(l.product.id, l.qty - 1)} label="decrease" symbol="−" />
                  <span className="w-6 text-center text-[14px] font-bold tabular-nums">{l.qty}</span>
                  <QtyBtn
                    onClick={() => setQty(l.product.id, l.qty + 1)}
                    label="increase"
                    disabled={l.qty >= l.product.stock}
                  />
                </div>
                <div className="w-[68px] text-right text-[13.5px] font-bold tracking-tight tabular-nums">
                  {peso(l.product.priceCents * l.qty)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals + checkout trigger */}
      <div className="shrink-0 px-5 py-4 hairline-t space-y-3">
        <div className="space-y-1 text-[13px]">
          <Row label={`Items (${count})`} value={peso(grossCents)} />
          {discountCents > 0 && (
            <div className="flex items-center justify-between text-accent-600 font-semibold">
              <span className="flex items-center gap-1.5">
                <Icon name="tag" className="w-[14px] h-[14px]" strokeWidth={1.8} />
                {discountLabel ?? "Discount"}
              </span>
              <span className="tabular-nums">−{peso(discountCents)}</span>
            </div>
          )}
          <Row label="VAT (12% incl.)" value={peso(vatCents)} muted />
          <div className="flex items-center justify-between pt-1.5 mt-1 hairline-t">
            <span className="text-[14px] font-bold">Total</span>
            <span className="text-[1.4rem] font-extrabold tracking-tightest">{peso(netCents)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onCheckout}
          disabled={empty}
          className="w-full inline-flex items-center justify-center gap-2 rounded-[10px] bg-brand-500 hover:bg-brand-600 py-3.5 font-semibold text-white shadow-btn tracking-tight transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon name="bolt" className="w-[18px] h-[18px]" strokeWidth={1.8} />
          {empty ? "Add items to charge" : `Checkout · ${peso(netCents)}`}
        </button>
      </div>
    </aside>
  );
}

/* ----------------------------- checkout overlay ----------------------------- */

const FAST_CASH = [100, 200, 500, 1000]; // standard PH bills, in pesos

function CheckoutOverlay({
  lines,
  grossCents,
  discountCents,
  discountLabel,
  netCents,
  count,
  discount,
  paymentQrs,
  onMethodChange,
  onClose,
  onPaid,
  onStockConflict,
}: {
  lines: Line[];
  grossCents: number;
  discountCents: number;
  discountLabel: string | null;
  netCents: number;
  count: number;
  discount: Discount | null;
  paymentQrs: PaymentQrMap;
  onMethodChange?: (m: PaymentMethod) => void;
  onClose: () => void;
  onPaid: (sale: Sale) => void;
  onStockConflict: () => void;
}) {
  const { closing, dismiss } = useDismiss(onClose);
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [tendered, setTendered] = useState("");
  const [refCode, setRefCode] = useState("");
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [redeem, setRedeem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEwallet = method !== "Cash";
  // The owner's uploaded scan-to-pay code for the staged rail, if any.
  const uploadedQr = isEwallet ? resolveAssetUrl(paymentQrs[method as EwalletQrMethod]) : null;

  // Loyalty redemption (1 pt = ₱1). Capped at the customer's balance AND at the
  // payable so it can't overdraw or drive the total negative — mirrors the
  // server, which re-derives and clamps it authoritatively. Derived (not stored)
  // so it self-corrects if the customer or cart changes.
  const maxRedeemablePoints = customer ? Math.min(customer.loyaltyPoints, Math.floor(netCents / 100)) : 0;
  const redeemPoints = redeem ? maxRedeemablePoints : 0;
  const redeemCents = redeemPoints * 100;
  const dueCents = Math.max(0, netCents - redeemCents);
  const dueVatCents = Math.round((dueCents * 12) / 112);

  const tenderedCents = Math.round((Number(tendered) || 0) * 100);
  const cashShort = method === "Cash" && tenderedCents < dueCents;
  const changeCents = method === "Cash" ? Math.max(0, tenderedCents - dueCents) : 0;

  const addBill = (php: number) => setTendered((p) => String((Number(p) || 0) + php));
  const setExact = () => setTendered(String(dueCents / 100));

  async function charge() {
    if (cashShort) return;
    setBusy(true);
    setError(null);
    const res = await submitOrder({
      items: lines.map((l) => ({ productId: l.product.id, qty: l.qty })),
      paymentMethod: method,
      tenderedCents: method === "Cash" ? tenderedCents : undefined,
      referenceCode: isEwallet && refCode ? refCode : undefined,
      discount: discount ?? undefined,
      customerId: customer?.id,
      redeemPoints: redeemPoints > 0 ? redeemPoints : undefined,
    });
    if (res.ok) {
      onPaid(res.sale);
      return;
    }
    setBusy(false);
    setError(res.error ?? (res.errors ? Object.values(res.errors)[0] : "Checkout failed."));
    // Stock moved under us — refresh the catalog so the floor sees the truth.
    if (res.available !== undefined || res.productId) onStockConflict();
  }

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label="Checkout">
      <button
        type="button"
        aria-label="Close"
        onClick={dismiss}
        className={"absolute inset-0 glass overlay-backdrop " + (closing ? "closing" : "")}
      />
      {/* Strict 3-zone flex column: the panel is capped at 88vh and clips its
          own overflow, the header/footer are fixed (shrink-0), and only the body
          scrolls — so an expanded e-wallet QR + reference can never push the
          Charge button below the fold. */}
      <div className={"relative flex flex-col w-full max-w-[420px] max-h-[88vh] overflow-hidden rounded-xl2 bg-surface hairline shadow-soft overlay-card " + (closing ? "closing" : "")}>
        <div className="shrink-0 flex items-center justify-between px-6 py-4 hairline-b">
          <h3 className="text-[1.15rem] font-extrabold tracking-tightest">Checkout</h3>
          <button type="button" onClick={dismiss} aria-label="Close" className="text-ink-faint hover:text-ink transition p-1">
            <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          {/* Summary */}
          <div className="rounded-[12px] bg-paper hairline px-4 py-3 space-y-1 text-[13px]">
            <Row label={`Items (${count})`} value={peso(grossCents)} />
            {discountCents > 0 && (
              <div className="flex items-center justify-between text-accent-600 font-semibold">
                <span>{discountLabel ?? "Discount"}</span>
                <span className="tabular-nums">−{peso(discountCents)}</span>
              </div>
            )}
            {redeemCents > 0 && (
              <div className="flex items-center justify-between text-accent-600 font-semibold">
                <span className="flex items-center gap-1.5">
                  <Icon name="heart" className="w-[14px] h-[14px]" strokeWidth={1.8} />
                  {redeemPoints} pt{redeemPoints === 1 ? "" : "s"} redeemed
                </span>
                <span className="tabular-nums">−{peso(redeemCents)}</span>
              </div>
            )}
            <Row label="VAT (12% incl.)" value={peso(dueVatCents)} muted />
            <div className="flex items-center justify-between pt-1.5 mt-1 hairline-t">
              <span className="text-[14px] font-bold">Total due</span>
              <span className="text-[1.35rem] font-extrabold tracking-tightest">{peso(dueCents)}</span>
            </div>
          </div>

          {/* Customer (optional) — attach for loyalty + purchase history */}
          <CheckoutCustomer
            customer={customer}
            onChange={(c) => {
              setCustomer(c);
              setRedeem(false); // a fresh customer starts with no redemption staged
            }}
          />

          {/* Loyalty redemption — only when the attached customer has points */}
          {customer && customer.loyaltyPoints > 0 && (
            <RedeemPoints
              points={customer.loyaltyPoints}
              maxRedeemable={maxRedeemablePoints}
              redeeming={redeem}
              redeemCents={redeemCents}
              onToggle={() => setRedeem((r) => !r)}
            />
          )}

          {/* Payment method */}
          <div>
            <div className="text-[12px] font-bold tracking-wide text-ink-faint uppercase mb-2">Settlement</div>
            <div className="grid grid-cols-4 gap-2">
              {PAY_METHODS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => {
                    setMethod(m.key);
                    onMethodChange?.(m.key); // mirror the staged rail to the customer screen
                  }}
                  className={
                    "flex flex-col items-center gap-1 py-2.5 rounded-[10px] text-[11.5px] font-bold tracking-tight transition duration-150 ease-in-out " +
                    (method === m.key
                      ? "bg-brand-50 text-brand-700 ring-2 ring-brand-200"
                      : "bg-paper hairline text-ink-soft hover:text-ink")
                  }
                >
                  <Icon name={m.icon} className="w-[18px] h-[18px]" strokeWidth={1.6} />
                  {m.key}
                </button>
              ))}
            </div>
          </div>

          {/* Cash tendered + Fast-Cash smart row */}
          {method === "Cash" && (
            <div className="space-y-2.5">
              <div className="flex gap-2">
                {FAST_CASH.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => addBill(b)}
                    className="flex-1 rounded-[10px] bg-paper hairline py-2 text-[12.5px] font-bold tracking-tight text-ink hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200 active:scale-[0.97] transition duration-150 ease-in-out tabular-nums"
                  >
                    ₱{b.toLocaleString("en-PH")}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-ink-soft whitespace-nowrap">Cash received</span>
                <span className="relative flex-1">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint text-[14px]">₱</span>
                  <input
                    value={tendered}
                    onChange={(e) => setTendered(e.target.value.replace(/[^\d.]/g, ""))}
                    onKeyDown={(e) => {
                      // Enter settles the sale straight from the amount field — the
                      // cashier never leaves the keyboard to reach the Charge button.
                      if (e.key === "Enter" && !cashShort && !busy && netCents > 0) {
                        e.preventDefault();
                        void charge();
                      }
                    }}
                    inputMode="decimal"
                    autoFocus
                    placeholder="0.00"
                    className="field-input rounded-[10px] pl-7 pr-3 py-2.5 text-[14px] w-full text-right tabular-nums transition duration-150 ease-in-out"
                  />
                </span>
                <button
                  type="button"
                  onClick={setExact}
                  className="rounded-[10px] bg-paper hairline px-3 py-2.5 text-[12.5px] font-bold text-ink-soft hover:text-brand-600 hover:border-brand-200 transition duration-150 ease-in-out"
                >
                  Exact
                </button>
              </label>
              {!cashShort && tenderedCents > 0 && (
                <div className="flex items-center justify-between rounded-[10px] bg-accent-50 px-3.5 py-2 text-[13.5px] font-bold text-accent-600">
                  <span>Change due</span>
                  <span className="tabular-nums">{peso(changeCents)}</span>
                </div>
              )}
              {/* Symmetric counterpart to "Change due": when the cash is short, say
                  by exactly how much so the cashier asks for the right amount — not
                  a silent disabled button. */}
              {cashShort && tenderedCents > 0 && (
                <div className="flex items-center justify-between rounded-[10px] bg-rose-50 px-3.5 py-2 text-[13.5px] font-bold text-rose-600">
                  <span>Short by</span>
                  <span className="tabular-nums">{peso(dueCents - tenderedCents)}</span>
                </div>
              )}
            </div>
          )}

          {/* E-wallet QR + reference — slides open for GCash / Maya / QRPH */}
          {isEwallet && (
            <div className="step-in space-y-2.5">
              {/* Scan-to-pay QR (mirrored on the customer display). Condensed
                  padding/gaps keep the expanded form short on laptop heights. */}
              <div className="rounded-[14px] bg-paper hairline p-3 flex items-center gap-3.5">
                <div className="shrink-0 rounded-[12px] bg-white ring-1 ring-[rgba(11,18,32,0.1)] p-2 w-[96px] h-[96px] grid place-items-center">
                  {uploadedQr ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={uploadedQr} alt={`${method} payment QR`} className="w-full h-full object-contain" />
                  ) : (
                    <MockQr seed={`${method}|${netCents}`} className="w-[80px] h-[80px] text-[#0b1220]" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-bold tracking-tight">Scan to pay with {method}</div>
                  <p className="mt-0.5 text-[12px] text-ink-soft leading-snug">
                    {uploadedQr ? (
                      <>
                        Customer scans your {method} code (also shown on the customer display) for{" "}
                        <span className="font-semibold text-ink tabular-nums">{peso(netCents)}</span>.
                      </>
                    ) : (
                      <>
                        Placeholder code — upload your {method} QR in{" "}
                        <span className="font-semibold text-ink">Checkout QR</span> settings.
                      </>
                    )}
                  </p>
                </div>
              </div>

              <label className="block text-[13px] font-semibold text-ink-soft">
                {method} reference — last 4 digits
              </label>
              <input
                value={refCode}
                onChange={(e) => setRefCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy && netCents > 0) {
                    e.preventDefault();
                    void charge();
                  }
                }}
                inputMode="numeric"
                placeholder="e.g. 4821"
                className="field-input rounded-[10px] px-3.5 py-2.5 text-[14px] w-full tabular-nums tracking-[0.2em] transition duration-150 ease-in-out"
              />
              <p className="text-[12px] text-ink-faint">Logged to the sales ledger for reconciliation.</p>
            </div>
          )}

          {error && (
            <p className="text-[13px] font-semibold text-rose-600 bg-rose-50 rounded-[10px] px-3.5 py-2.5">{error}</p>
          )}
        </div>

        <div className="shrink-0 px-6 py-4 hairline-t">
          <button
            type="button"
            onClick={() => void charge()}
            disabled={busy || cashShort || netCents <= 0}
            className="w-full inline-flex items-center justify-center gap-2 rounded-[10px] bg-brand-500 hover:bg-brand-600 py-3.5 font-semibold text-white shadow-btn tracking-tight transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon name="check" className="w-[18px] h-[18px]" strokeWidth={2} />
            {busy ? "Processing…" : cashShort ? "Insufficient cash" : `Charge ${peso(dueCents)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ receipt overlay ------------------------------ */

function ReceiptOverlay({
  sale,
  items,
  store,
  cashierName,
  thermal,
  onClose,
}: {
  sale: Sale;
  items: TicketItem[];
  store: StoreBrand;
  cashierName: string;
  thermal: UseThermalPrinter;
  onClose: () => void;
}) {
  const { closing, dismiss } = useDismiss(onClose);
  const storeName = store.name;
  const sendThermal = () =>
    void thermal.print(buildSaleReceipt({ store, sale, items, cashierName, kickDrawer: true }));
  return (
    <div className="fixed inset-0 z-[110] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label="Receipt">
      <div className={"absolute inset-0 glass overlay-backdrop " + (closing ? "closing" : "")} />
      <div className={"relative w-full max-w-[360px] rounded-xl2 bg-surface hairline shadow-soft p-7 text-center overlay-card " + (closing ? "closing" : "")}>
        <div className="mx-auto w-16 h-16 rounded-full bg-accent-50 grid place-items-center">
          <Icon name="check" className="w-8 h-8 text-accent-600" strokeWidth={2.3} />
        </div>
        <p className="mt-4 text-[11px] font-bold tracking-wide text-ink-faint uppercase">{storeName}</p>
        <h3 className="mt-1 text-[1.3rem] font-extrabold tracking-tightest">Payment received</h3>
        <p className="mt-1 text-[13.5px] text-ink-soft">
          {peso(sale.totalCents)} paid via {sale.paymentMethod}
          {sale.paymentRef ? ` ·${sale.paymentRef}` : ""}
        </p>

        <div className="mt-4 rounded-[12px] bg-paper hairline divide-y divide-[rgba(11,18,32,0.07)] text-[13px] text-left">
          <RcptRow label="Invoice ref" value={sale.reference} mono />
          {sale.discountCents > 0 && (
            <RcptRow label={sale.discountLabel ?? "Discount"} value={`−${peso(sale.discountCents)}`} />
          )}
          <RcptRow label="VAT (12% incl.)" value={peso(sale.vatCents)} />
          {sale.paymentRef && <RcptRow label={`${sale.paymentMethod} ref`} value={`••${sale.paymentRef}`} mono />}
          {sale.paymentMethod === "Cash" && sale.tenderedCents !== null && (
            <>
              <RcptRow label="Cash" value={peso(sale.tenderedCents)} />
              <RcptRow label="Change" value={peso(sale.changeCents ?? 0)} strong />
            </>
          )}
          {sale.pointsRedeemed > 0 && <RcptRow label="Points redeemed" value={`−${sale.pointsRedeemed}`} />}
          {sale.pointsEarned > 0 && <RcptRow label="Points earned" value={`+${sale.pointsEarned}`} />}
        </div>

        {/* Direct-to-device thermal printing (only when the browser supports a
            transport). On settlement an already-connected unit prints
            automatically; here the cashier can connect one or reprint. */}
        {thermal.support.any && (
          <div className="mt-4 rounded-[12px] bg-paper hairline px-3.5 py-3 text-left">
            {thermal.status === "connected" ? (
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-accent-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-500" />
                  {thermal.deviceName}
                </span>
                <button
                  type="button"
                  onClick={sendThermal}
                  className="inline-flex items-center gap-1.5 rounded-[8px] bg-surface hairline px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft hover:text-brand-600 transition duration-150"
                >
                  <Icon name="receipt" className="w-[15px] h-[15px]" strokeWidth={1.8} />
                  Reprint
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="mr-auto text-[12px] font-semibold text-ink-faint">Thermal printer</span>
                {thermal.support.usb && (
                  <button
                    type="button"
                    onClick={() => void thermal.connect("usb")}
                    disabled={thermal.status === "connecting"}
                    className="rounded-[8px] bg-surface hairline px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft hover:text-brand-600 transition duration-150 disabled:opacity-50"
                  >
                    USB
                  </button>
                )}
                {thermal.support.bluetooth && (
                  <button
                    type="button"
                    onClick={() => void thermal.connect("bluetooth")}
                    disabled={thermal.status === "connecting"}
                    className="rounded-[8px] bg-surface hairline px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft hover:text-brand-600 transition duration-150 disabled:opacity-50"
                  >
                    Bluetooth
                  </button>
                )}
              </div>
            )}
            {thermal.error && <p className="mt-2 text-[12px] font-semibold text-rose-600">{thermal.error}</p>}
          </div>
        )}

        <div className="mt-6 grid grid-cols-[auto_1fr] gap-2.5">
          <button
            type="button"
            onClick={() => printSaleReceipt({ store, sale, items, cashierName })}
            title="Print receipt"
            aria-label="Print receipt"
            className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-surface hairline px-4 py-3.5 font-semibold text-ink-soft hover:text-brand-600 hover:border-brand-200 transition duration-150"
          >
            <Icon name="receipt" className="w-[18px] h-[18px]" strokeWidth={1.8} />
            Print
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="w-full rounded-[10px] bg-brand-500 hover:bg-brand-600 py-3.5 font-semibold text-white shadow-btn tracking-tight transition duration-150 ease-in-out"
          >
            New sale
          </button>
        </div>
      </div>
    </div>
  );
}

function RcptRow({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-ink-soft">{label}</span>
      <span className={(mono ? "font-mono " : "") + (strong ? "font-bold " : "font-semibold ") + "tabular-nums tracking-tight"}>
        {value}
      </span>
    </div>
  );
}

/* ------------------------------ discount modal ------------------------------ */

function DiscountModal({
  grossCents,
  current,
  onClose,
  onApply,
}: {
  grossCents: number;
  current: Discount | null;
  onClose: () => void;
  onApply: (d: Discount | null) => void;
}) {
  const { closing, dismiss } = useDismiss(onClose);
  const [mode, setMode] = useState<"percent" | "fixed">(current?.type ?? "percent");
  const [value, setValue] = useState(
    current ? String(current.type === "fixed" ? current.value / 100 : current.value) : "",
  );
  const num = Number(value) || 0;
  const previewCents =
    mode === "percent"
      ? Math.round((grossCents * Math.min(100, num)) / 100)
      : Math.min(grossCents, Math.round(num * 100));

  function applyCustom() {
    if (num <= 0) return;
    if (mode === "percent") {
      const pct = Math.min(100, num);
      onApply({ type: "percent", value: pct, label: `${pct}% off` });
    } else {
      const cents = Math.round(num * 100);
      onApply({ type: "fixed", value: cents, label: `${peso(cents)} off` });
    }
  }

  return (
    <div className="fixed inset-0 z-[110] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label="Apply discount">
      <button type="button" aria-label="Close" onClick={dismiss} className={"absolute inset-0 glass overlay-backdrop " + (closing ? "closing" : "")} />
      <div className={"relative w-full max-w-[360px] rounded-xl2 bg-surface hairline shadow-soft overlay-card " + (closing ? "closing" : "")}>
        <div className="flex items-center justify-between px-6 py-4 hairline-b">
          <h3 className="text-[1.1rem] font-extrabold tracking-tight">Apply discount</h3>
          <button type="button" onClick={dismiss} aria-label="Close" className="text-ink-faint hover:text-ink transition p-1">
            <Icon name="x" className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Presets */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onApply({ type: "percent", value: 10, label: "10% off" })}
              className="rounded-[12px] bg-paper hairline px-3 py-3 text-left hover:border-brand-200 hover:bg-brand-50 active:scale-[0.98] transition duration-150 ease-in-out"
            >
              <div className="text-[15px] font-extrabold tracking-tight">10%</div>
              <div className="text-[12px] text-ink-soft">Promo</div>
            </button>
            <button
              type="button"
              onClick={() => onApply({ type: "percent", value: 20, label: "Senior/PWD 20%" })}
              className="rounded-[12px] bg-paper hairline px-3 py-3 text-left hover:border-brand-200 hover:bg-brand-50 active:scale-[0.98] transition duration-150 ease-in-out"
            >
              <div className="text-[15px] font-extrabold tracking-tight">20%</div>
              <div className="text-[12px] text-ink-soft">Senior / PWD</div>
            </button>
          </div>

          <div className="flex items-center gap-3 text-[12px] font-semibold text-ink-faint">
            <span className="h-px flex-1 bg-ink/8" />
            OR CUSTOM
            <span className="h-px flex-1 bg-ink/8" />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-[10px] bg-paper hairline p-0.5">
              {(["percent", "fixed"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={
                    "px-3 py-2 rounded-[8px] text-[13px] font-bold transition duration-150 ease-in-out " +
                    (mode === m ? "bg-surface shadow-card text-ink" : "text-ink-soft")
                  }
                >
                  {m === "percent" ? "%" : "₱"}
                </button>
              ))}
            </div>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              placeholder={mode === "percent" ? "e.g. 15" : "e.g. 50.00"}
              className="field-input rounded-[10px] px-3.5 py-2.5 text-[14px] flex-1 tabular-nums transition duration-150 ease-in-out"
            />
          </div>

          {previewCents > 0 && (
            <div className="flex items-center justify-between rounded-[10px] bg-accent-50 px-3.5 py-2 text-[13.5px] font-bold text-accent-600">
              <span>Discount</span>
              <span className="tabular-nums">−{peso(previewCents)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-6 py-4 hairline-t">
          {current && (
            <button
              type="button"
              onClick={() => onApply(null)}
              className="px-4 py-2.5 rounded-[10px] text-[14px] font-semibold text-ink-soft hover:text-rose-600 hover:bg-rose-50 transition duration-150"
            >
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={applyCustom}
            disabled={num <= 0}
            className="flex-1 rounded-[10px] bg-brand-500 hover:bg-brand-600 py-3 font-semibold text-[14px] text-white shadow-btn tracking-tight transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply discount
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- checkout customer ---------------------------- */

/**
 * Optional CRM customer attach for the checkout overlay. Type to search the
 * tenant's customer book by name/phone; picking one attaches the sale to them
 * (loyalty accrues, and it shows in their purchase history). Walk-in = none.
 * Search runs in the change handler (not an effect) so there's no
 * set-state-in-effect concern; results clear on selection.
 */
function CheckoutCustomer({
  customer,
  onChange,
}: {
  customer: CustomerLite | null;
  onChange: (c: CustomerLite | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CustomerLite[]>([]);
  const [open, setOpen] = useState(false);

  async function runSearch(value: string) {
    setQ(value);
    if (value.trim().length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    const res = await searchCustomers(value);
    if (res.ok) {
      setResults(res.customers);
      setOpen(true);
    }
  }

  if (customer) {
    return (
      <div>
        <div className="text-[12px] font-bold tracking-wide text-ink-faint uppercase mb-2">Customer</div>
        <div className="flex items-center justify-between rounded-[10px] bg-brand-50 px-3.5 py-2.5">
          <div className="min-w-0">
            <div className="font-semibold text-[14px] text-brand-700 truncate">{customer.name}</div>
            <div className="text-[12px] text-brand-600">{customer.loyaltyPoints} pts{customer.phone ? ` · ${customer.phone}` : ""}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQ("");
              setResults([]);
            }}
            className="text-[12.5px] font-semibold text-ink-soft hover:text-rose-600 transition shrink-0 ml-3"
          >
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="text-[12px] font-bold tracking-wide text-ink-faint uppercase mb-2">Customer (optional)</div>
      <div className="relative">
        <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-[16px] h-[16px] text-ink-faint" strokeWidth={1.7} />
        <input
          value={q}
          onChange={(e) => void runSearch(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Walk-in — search name or phone to attach"
          className="field-input w-full rounded-[10px] pl-9 pr-3 py-2.5 text-[13.5px]"
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-[10] left-0 right-0 mt-1 rounded-[10px] bg-surface hairline shadow-soft overflow-hidden">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className="w-full flex items-center justify-between px-3.5 py-2.5 text-left hover:bg-paper transition"
            >
              <span className="font-semibold text-[13.5px]">{c.name}</span>
              <span className="text-[12px] text-ink-faint">{c.phone ?? `${c.loyaltyPoints} pts`}</span>
            </button>
          ))}
        </div>
      )}
      {open && q.trim() && results.length === 0 && (
        <p className="mt-1.5 text-[12px] text-ink-faint">No match — sell as walk-in, or add them in CRM.</p>
      )}
    </div>
  );
}

/* ----------------------------- redeem points ----------------------------- */

/**
 * Loyalty redemption toggle for the checkout overlay. Shown only when the
 * attached customer has points; tapping applies the maximum redeemable (1 pt =
 * ₱1, capped to the payable) as a discount the server re-derives and deducts.
 */
function RedeemPoints({
  points,
  maxRedeemable,
  redeeming,
  redeemCents,
  onToggle,
}: {
  points: number;
  maxRedeemable: number;
  redeeming: boolean;
  redeemCents: number;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] bg-accent-50 px-3.5 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-accent-700">
          <Icon name="heart" className="w-[15px] h-[15px]" strokeWidth={1.8} />
          Loyalty points
        </div>
        <div className="text-[12px] text-accent-600">
          {redeeming
            ? `Redeeming −${peso(redeemCents)}`
            : `${points} pt${points === 1 ? "" : "s"} available · worth ${peso(points * 100)}`}
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={!redeeming && maxRedeemable <= 0}
        className={
          "shrink-0 rounded-[9px] px-3 py-2 text-[12.5px] font-bold tracking-tight transition duration-150 ease-in-out disabled:opacity-40 disabled:cursor-not-allowed " +
          (redeeming
            ? "bg-surface hairline text-ink-soft hover:text-rose-600 hover:border-rose-200"
            : "bg-accent-500 text-white hover:bg-accent-600 shadow-btn")
        }
      >
        {redeeming ? "Remove" : `Redeem ${maxRedeemable} pt${maxRedeemable === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}

/* ------------------------------- void modal ------------------------------- */

function VoidModal({ count, onClose, onConfirm }: { count: number; onClose: () => void; onConfirm: () => void }) {
  const { closing, dismiss } = useDismiss(onClose);
  return (
    <div className="fixed inset-0 z-[110] grid place-items-center px-5" role="dialog" aria-modal="true" aria-label="Void order">
      <button type="button" aria-label="Close" onClick={dismiss} className={"absolute inset-0 glass overlay-backdrop " + (closing ? "closing" : "")} />
      <div className={"relative w-full max-w-[360px] rounded-xl2 bg-surface hairline shadow-soft p-6 overlay-card " + (closing ? "closing" : "")}>
        <div className="grid place-items-center w-11 h-11 rounded-[12px] bg-rose-50 text-rose-600">
          <Icon name="ban" className="w-5 h-5" strokeWidth={1.8} />
        </div>
        <h3 className="mt-4 text-[1.1rem] font-extrabold tracking-tight">Void this order?</h3>
        <p className="mt-1.5 text-[13.5px] text-ink-soft leading-relaxed">
          The {count} item{count === 1 ? "" : "s"} and any discount in the current order will be cleared.
          This can&apos;t be undone.
        </p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={dismiss}
            className="px-4 py-2.5 rounded-[10px] text-[14px] font-semibold text-ink-soft hover:bg-paper transition duration-150"
          >
            Keep order
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="bg-rose-600 hover:bg-rose-700 text-white font-semibold text-[14px] px-5 py-2.5 rounded-[10px] transition duration-150"
          >
            Void order
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- bits --------------------------------- */

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-ink-faint" : "text-ink-soft"}>{label}</span>
      <span className={"tabular-nums " + (muted ? "text-ink-faint" : "font-semibold")}>{value}</span>
    </div>
  );
}

function QtyBtn({
  onClick,
  label,
  symbol,
  disabled,
}: {
  onClick: () => void;
  label: string;
  symbol?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid place-items-center w-7 h-7 rounded-[8px] bg-paper hairline text-ink-soft hover:text-ink hover:border-brand-200 transition duration-150 ease-in-out text-[16px] font-bold leading-none disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {symbol ?? <Icon name="plus" className="w-4 h-4" strokeWidth={2} />}
    </button>
  );
}
