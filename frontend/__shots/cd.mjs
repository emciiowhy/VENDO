import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:3000";
const CH = "vendopos-customer-display";

const base = {
  storeName: "Barako & Co.",
  status: "active",
  discountCents: 0,
  discountLabel: null,
  payment: null,
  paid: null,
};
const L = (id, name, qty, unit, imageUrl = null) => ({ id, name, qty, unitCents: unit, lineCents: unit * qty, imageUrl });
// Instant data-URL swatches so the screenshot isn't gated on a remote image.
const IMG = (c) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='200' height='200' fill='${c}'/></svg>`)}`;

const twoItems = [
  L("a", "Kapeng Barako", 2, 12000, IMG("#6f4326")),
  L("b", "Ensaymada", 1, 8500), // no image → qty-chip fallback
];
const threeItems = [...twoItems, L("c", "Ube Cake", 1, 16000, IMG("#7c3aed"))];
const gross = threeItems.reduce((s, l) => s + l.lineCents, 0); // 48500
const vat = Math.round(gross - gross / 1.12);
const activeBase = { ...base, grossCents: gross, vatCents: vat, netCents: gross, count: 4 };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25 });
const page = await ctx.newPage();
await page.goto(BASE + "/pos/customer-display", { waitUntil: "networkidle" });
await page.waitForTimeout(800);

async function post(snap) {
  await page.evaluate(({ ch, snap }) => {
    const b = new BroadcastChannel(ch);
    b.postMessage(snap);
    setTimeout(() => b.close(), 50);
  }, { ch: CH, snap });
  await page.waitForTimeout(500);
}
async function shot(name) {
  await page.screenshot({ path: join(here, `cd-${name}.png`), fullPage: false });
  console.log(`  ✓ cd-${name}.png`);
}

// 1) idle (initial)
await shot("idle");

// 2) active — post 2 items, then 3 (3rd flashes "just added")
await post({ ...activeBase, lines: twoItems, count: 3, grossCents: twoItems.reduce((s, l) => s + l.lineCents, 0), netCents: twoItems.reduce((s, l) => s + l.lineCents, 0) });
await post({ ...activeBase, lines: threeItems });
await shot("active");

// 3) active with discount
await post({ ...activeBase, lines: threeItems, status: "active", discountCents: 5000, discountLabel: "Senior 10%", netCents: gross - 5000 });
await shot("active-discount");

// 4) payment (QRPH)
await post({ ...activeBase, lines: threeItems, status: "payment", payment: { method: "QRPH", netCents: gross, qrUrl: null } });
await shot("payment");

// 5) paid + change
await post({ ...activeBase, lines: threeItems, status: "paid", paid: { totalCents: gross, method: "Cash", reference: "4821", changeCents: 1500 } });
await shot("paid");

await ctx.close();
await browser.close();
console.log("DONE");
