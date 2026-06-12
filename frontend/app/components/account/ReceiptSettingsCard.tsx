"use client";

import { useEffect, useState } from "react";
import { useToast } from "../Toast";
import { CardSkeleton, PrimaryButton, SectionCard, TextArea, TextField, Toggle } from "./ui";
import { getReceipt, saveReceipt, type ReceiptSettings } from "@/lib/account";

/**
 * Receipt & invoice customization. Display-only fields (header line, footer
 * message, VAT label, logo toggle) plus the serial prefix the POS stamps on
 * every official receipt — e.g. SI → SI-000123. Changing the prefix never breaks
 * the gap-free numbering; the per-store counter keeps incrementing.
 */
export function ReceiptSettingsCard() {
  const { push } = useToast();
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [header, setHeader] = useState("");
  const [footer, setFooter] = useState("");
  const [vatLabel, setVatLabel] = useState("");
  const [prefix, setPrefix] = useState("");
  const [showLogo, setShowLogo] = useState(true);
  const [prefixError, setPrefixError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getReceipt();
      if (!alive) return;
      if (res.ok) hydrate(res.settings);
      else setLoadError(res.error ?? "Could not load receipt settings.");
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  function hydrate(s: ReceiptSettings) {
    setHeader(s.header ?? "");
    setFooter(s.footer ?? "");
    setVatLabel(s.vatLabel ?? "");
    setPrefix(s.invoicePrefix ?? "");
    setShowLogo(s.showLogo);
  }

  if (loadError) {
    return (
      <SectionCard icon="receipt" title="Receipt & invoice">
        <p className="text-[13.5px] font-semibold text-rose-600">{loadError}</p>
      </SectionCard>
    );
  }
  if (!loaded) return <CardSkeleton />;

  async function submit() {
    setBusy(true);
    setPrefixError(null);
    const res = await saveReceipt({
      header,
      footer,
      vatLabel,
      invoicePrefix: prefix.trim().toUpperCase(),
      showLogo,
    });
    setBusy(false);
    if (res.ok) {
      hydrate(res.settings);
      push({ variant: "success", title: "Receipt settings saved" });
      return;
    }
    if (res.errors?.invoicePrefix) setPrefixError(res.errors.invoicePrefix);
    push({ variant: "danger", title: "Couldn’t save", message: res.error ?? res.errors?.invoicePrefix });
  }

  const sample = `${(prefix.trim().toUpperCase() || "SI")}-000123`;

  return (
    <SectionCard
      icon="receipt"
      title="Receipt & invoice"
      description="Customize what prints on every receipt and how your invoice numbers are stamped."
    >
      <div className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField
            label="Invoice serial prefix"
            value={prefix}
            onChange={setPrefix}
            placeholder="SI"
            error={prefixError}
            hint={`Next receipt will read ${sample}`}
          />
          <TextField label="VAT label" value={vatLabel} onChange={setVatLabel} placeholder="VAT REG TIN" />
        </div>
        <TextField
          label="Header line"
          value={header}
          onChange={setHeader}
          placeholder="Thank you for choosing Kape ni Juan!"
        />
        <TextArea
          label="Footer message"
          value={footer}
          onChange={setFooter}
          placeholder="This serves as your official receipt. Come again!"
          rows={2}
        />
        <div className="hairline-t pt-2">
          <Toggle
            label="Print store logo on receipts"
            description="Shows your uploaded logo at the top of every printed receipt."
            checked={showLogo}
            onChange={setShowLogo}
          />
        </div>

        <div className="flex justify-end">
          <PrimaryButton busy={busy} onClick={submit}>
            Save receipt settings
          </PrimaryButton>
        </div>
      </div>
    </SectionCard>
  );
}
