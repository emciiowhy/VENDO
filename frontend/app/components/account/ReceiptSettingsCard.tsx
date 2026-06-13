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
  const [ptu, setPtu] = useState("");
  const [min, setMin] = useState("");
  const [serial, setSerial] = useState("");
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
    setPtu(s.ptu ?? "");
    setMin(s.min ?? "");
    setSerial(s.serial ?? "");
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
      ptu,
      min,
      serial,
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

        <div className="hairline-t pt-4">
          <div className="text-[13px] font-bold tracking-tight">BIR accreditation</div>
          <p className="mt-0.5 text-[12.5px] text-ink-soft">
            From your BIR Permit to Use (PTU). Printed in the receipt footer for a valid invoice; leave
            blank if you don’t have one yet.
          </p>
          <div className="mt-3 grid sm:grid-cols-3 gap-4">
            <TextField label="Permit to Use (PTU) No." value={ptu} onChange={setPtu} placeholder="FP000000000000" />
            <TextField label="Machine ID No. (MIN)" value={min} onChange={setMin} placeholder="00000000000000" />
            <TextField label="Serial No." value={serial} onChange={setSerial} placeholder="ABC123456" />
          </div>
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
