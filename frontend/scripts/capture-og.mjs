// One-off: capture the landing-page hero as the Open Graph / social-card image.
// Usage: node scripts/capture-og.mjs [url]  (defaults to http://localhost:3000/)
// Produces public/og-landing.png at 1200x630 (2x DPR → crisp 2400x1260 pixels).
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] ?? "http://localhost:3000/";
const out = resolve(__dirname, "../public/og-landing.png");

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2,
});
await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
// Hide the Next.js dev-tools indicator (the "N" badge) — a dev-only overlay that
// must never bake into the static social card. Harmless in prod where it's absent.
await page.addStyleTag({
  content: `nextjs-portal, #__next-build-watcher, [data-nextjs-toast],
    [data-next-badge-root], [data-nextjs-dev-tools-button] { display: none !important; }`,
});
// Let hero imagery / fonts settle before the shot.
await page.waitForTimeout(1500);
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log(`[og] captured ${url} -> ${out}`);
