"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { resolveAssetUrl } from "@/lib/images";
import {
  QR_METHODS,
  deletePaymentQr,
  getPaymentQrs,
  uploadPaymentQr,
  type PaymentQrMap,
  type QrMethod,
} from "@/lib/paymentQr";

/**
 * Owner-managed checkout QR codes. The merchant uploads their real GCash / Maya
 * / QRPH "scan to pay" images here; the POS checkout then shows the uploaded
 * code to the customer (on both the cashier overlay and the customer display)
 * instead of the placeholder. Tenant-scoped server-side.
 */

const METHOD_BLURB: Record<QrMethod, string> = {
  GCash: "Your GCash “Scan to Pay” / QR Ph code from the GCash app.",
  Maya: "Your Maya merchant QR from the Maya Business app.",
  QRPH: "Your interoperable QR Ph code accepted by any participating wallet.",
};
const METHOD_TINT: Record<QrMethod, string> = {
  GCash: "text-[#0a6cff]",
  Maya: "text-[#00a85a]",
  QRPH: "text-brand-600",
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; qrs: PaymentQrMap };

export function PaymentQrManager() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getPaymentQrs();
      if (!alive) return;
      if (res.ok) setState({ status: "ready", qrs: res.qrs });
      else setState({ status: "error", message: res.error ?? "Could not load your QR codes." });
    })();
    return () => {
      alive = false;
    };
  }, []);

  function setUrl(method: QrMethod, url: string | null) {
    setState((prev) =>
      prev.status === "ready"
        ? { status: "ready", qrs: { ...prev.qrs, [method]: url } }
        : prev,
    );
  }

  return (
    <div className="max-w-[920px]">
      <div className="rounded-xl2 bg-surface hairline shadow-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid place-items-center w-10 h-10 rounded-[11px] bg-brand-50 text-brand-600 shrink-0">
            <Icon name="wallet" className="w-5 h-5" strokeWidth={1.7} />
          </span>
          <div>
            <h2 className="text-[1.05rem] font-extrabold tracking-tight">Checkout QR codes</h2>
            <p className="mt-0.5 text-[13.5px] text-ink-soft leading-relaxed max-w-[60ch]">
              Upload your own e-wallet QR codes. When a cashier rings up an e-wallet sale, the customer
              scans <span className="font-semibold text-ink">your</span> code — on the terminal and the
              customer display. Rails without an uploaded code fall back to a placeholder.
            </p>
          </div>
        </div>
      </div>

      {state.status === "loading" && (
        <div className="mt-4 grid sm:grid-cols-3 gap-4">
          {QR_METHODS.map((m) => (
            <div key={m} className="h-[300px] rounded-xl2 bg-paper hairline animate-pulse" />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <p className="mt-4 rounded-xl2 bg-rose-50 text-rose-600 text-[13.5px] font-semibold px-4 py-3">
          {state.message}
        </p>
      )}

      {state.status === "ready" && (
        <div className="mt-4 grid sm:grid-cols-3 gap-4">
          {QR_METHODS.map((method) => (
            <QrCard
              key={method}
              method={method}
              url={state.qrs[method]}
              onChange={(url) => setUrl(method, url)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QrCard({
  method,
  url,
  onChange,
}: {
  method: QrMethod;
  url: string | null;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<"upload" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const src = resolveAssetUrl(url);

  async function onPick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be 2MB or smaller.");
      return;
    }
    setError(null);
    setBusy("upload");
    const res = await uploadPaymentQr(method, file);
    setBusy(null);
    if (res.ok) onChange(res.imageUrl);
    else setError(res.error ?? "Upload failed.");
    if (inputRef.current) inputRef.current.value = ""; // allow re-picking same file
  }

  async function onRemove() {
    setError(null);
    setBusy("delete");
    const res = await deletePaymentQr(method);
    setBusy(null);
    if (res.ok) onChange(null);
    else setError(res.error ?? "Could not remove the code.");
  }

  return (
    <div className="rounded-xl2 bg-surface hairline shadow-card p-4 flex flex-col">
      <div className="flex items-center justify-between">
        <span className={"text-[15px] font-extrabold tracking-tight " + METHOD_TINT[method]}>{method}</span>
        {src ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 text-accent-600 px-2 py-0.5 text-[10.5px] font-bold tracking-tight">
            <Icon name="check" className="w-3 h-3" strokeWidth={2.4} />
            Live
          </span>
        ) : (
          <span className="rounded-full bg-paper hairline text-ink-faint px-2 py-0.5 text-[10.5px] font-bold tracking-tight">
            Not set
          </span>
        )}
      </div>

      <div className="mt-3 aspect-square rounded-[14px] bg-paper hairline overflow-hidden grid place-items-center">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`${method} payment QR`} className="w-full h-full object-contain p-2" />
        ) : (
          <div className="text-center px-4">
            <Icon name="image" className="w-9 h-9 mx-auto text-ink-faint" strokeWidth={1.4} />
            <p className="mt-2 text-[12px] text-ink-faint leading-snug">{METHOD_BLURB[method]}</p>
          </div>
        )}
      </div>

      {error && <p className="mt-2.5 text-[12px] font-semibold text-rose-600">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onPick(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== null}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-[10px] bg-brand-500 hover:bg-brand-600 py-2.5 text-[13px] font-semibold text-white shadow-btn tracking-tight transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Icon name="image" className="w-4 h-4" strokeWidth={1.8} />
          {busy === "upload" ? "Uploading…" : src ? "Replace" : "Upload QR"}
        </button>
        {src && (
          <button
            type="button"
            onClick={() => void onRemove()}
            disabled={busy !== null}
            aria-label={`Remove ${method} QR`}
            className="grid place-items-center w-10 h-10 rounded-[10px] bg-surface hairline text-ink-soft hover:text-rose-600 hover:border-rose-200 transition duration-150 disabled:opacity-50"
          >
            <Icon name="trash" className="w-[18px] h-[18px]" strokeWidth={1.7} />
          </button>
        )}
      </div>
    </div>
  );
}
