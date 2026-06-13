import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:3000";

const jobs = [
  { name: "mkt-industry", url: "/industry" },
  { name: "mkt-industry-cafe", url: "/industry/cafes-bakeries" },
  { name: "mkt-products", url: "/products" },
  { name: "mkt-product-pos", url: "/products/point-of-sale" },
  { name: "mkt-hardware", url: "/hardware" },
  { name: "mkt-company-about", url: "/company/about" },
];

const browser = await chromium.launch();
for (const job of jobs) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25 });
  const page = await ctx.newPage();
  await page.goto(BASE + job.url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  // Force scroll-reveal content visible so full-page shots aren't blank below fold.
  await page.addStyleTag({
    content: ".reveal{opacity:1 !important;transform:none !important;}",
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(here, `${job.name}.png`), fullPage: true });
  console.log(`  ✓ ${job.name}.png`);
  await ctx.close();
}
await browser.close();
console.log("DONE");
