import { buildSaleReceipt, buildTestReceipt } from "@/lib/escpos";
import { decodeEscPos } from "@/lib/escposPreview";
import type { Sale, StoreBrand } from "@/lib/pos";
import type { TicketItem } from "@/app/components/pos/receiptPrint";

/**
 * Dev-only paper proof for the thermal receipt — no printer required. Renders
 * the ESC/POS output decoded back to text at both supported widths (58mm = 32
 * cols, 80mm = 48 cols) so the layout can be verified before defense day.
 * Visit /pos/printer-preview with `npm run dev`.
 */

const SAMPLE_STORE: StoreBrand = {
  name: "Mc Coffee",
  slug: "mc-coffee",
  address: "123 Session Rd, Baguio City",
  phone: "0917 123 4567",
  tin: "123-456-789-000",
  businessStyle: "Coffee Shop",
  vatLabel: "VAT REG TIN",
  receiptHeader: "Single-origin Benguet beans",
  receiptFooter: "Thank you!",
  logoUrl: null,
  ptu: "PTU FP012025",
  min: "MIN 00000001",
  serial: "SN MC-0001",
};

const SAMPLE_ITEMS: TicketItem[] = [
  { name: "Americano", qty: 2, unitCents: 11000 },
  { name: "Spanish Latte", qty: 1, unitCents: 16000 },
  { name: "Pandesal (VAT-exempt)", qty: 4, unitCents: 2500 },
];

const SAMPLE_SALE: Sale = {
  id: "sample",
  reference: "SI-000123",
  subtotalCents: 43200,
  vatCents: 3557,
  vatableSalesCents: 33200,
  vatExemptCents: 10000,
  zeroRatedCents: 0,
  grossCents: 48000,
  discountCents: 4800,
  discountLabel: "Senior 10%",
  totalCents: 43200,
  paymentMethod: "Cash",
  paymentRef: null,
  tenderedCents: 50000,
  changeCents: 6800,
  pointsEarned: 43,
  pointsRedeemed: 0,
  createdAt: new Date().toISOString(),
};

function Proof({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h2 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px", color: "#9aa3b2" }}>{title}</h2>
      <pre
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: 12,
          lineHeight: 1.5,
          background: "#fff",
          color: "#101218",
          border: "1px solid #e3e1d9",
          borderRadius: 10,
          padding: 16,
          whiteSpace: "pre",
          overflowX: "auto",
          margin: 0,
        }}
      >
        {text}
      </pre>
    </div>
  );
}

export default function PrinterPreviewPage() {
  const sale58 = decodeEscPos(buildSaleReceipt({ store: SAMPLE_STORE, sale: SAMPLE_SALE, items: SAMPLE_ITEMS, cashierName: "Ronna Balsac", width: 32 }), 32);
  const sale80 = decodeEscPos(buildSaleReceipt({ store: SAMPLE_STORE, sale: SAMPLE_SALE, items: SAMPLE_ITEMS, cashierName: "Ronna Balsac", width: 48 }), 48);
  const test58 = decodeEscPos(buildTestReceipt(SAMPLE_STORE, 32), 32);
  const test80 = decodeEscPos(buildTestReceipt(SAMPLE_STORE, 48), 48);

  return (
    <main style={{ minHeight: "100vh", background: "#f6f4ee", padding: 32, color: "#101218" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>Thermal receipt preview</h1>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 24px" }}>
          Dev-only paper proof — decodes the ESC/POS byte stream back to text. No printer required. Styling
          (bold / double-size) isn&apos;t shown; this verifies column alignment and content.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
          <Proof title="Receipt — 58mm (32 cols)" text={sale58} />
          <Proof title="Receipt — 80mm (48 cols)" text={sale80} />
          <Proof title="Test print — 58mm (32 cols)" text={test58} />
          <Proof title="Test print — 80mm (48 cols)" text={test80} />
        </div>
      </div>
    </main>
  );
}
