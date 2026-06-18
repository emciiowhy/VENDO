import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Baseline + after capture for the POS register redesign.
//   • pos          — the LIVE /pos terminal (owner token; owners bypass the
//                    cashier activation gate), the "before" reference.
//   • pos-preview  — the stateless /preview/pos mock, the "after" reference.
// Run the dev server (npm run dev) and the API first, then: node __shots/pos.mjs
const here = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(join(here, "tokens.json"), "utf8"));
const BASE = "http://localhost:3000";

const jobs = [
  { name: "pos", url: "/pos", token: tokens.owner, ready: "text=Current order" },
  { name: "pos-preview", url: "/preview/pos", token: null, ready: "text=Current order" },
];

// Desktop register + an 11" tablet landscape to audit touch ergonomics.
const viewports = [
  { tag: "", width: 1440, height: 900 },
  { tag: "-tablet", width: 1194, height: 834 },
];

const browser = await chromium.launch();
for (const job of jobs) {
  for (const vp of viewports) {
    for (const theme of ["light", "dark"]) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1.5,
      });
      if (job.token) {
        await ctx.addCookies([
          { name: "vendopos_session", value: job.token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
        ]);
      }
      await ctx.addInitScript((t) => {
        try { window.localStorage.setItem("vendopos_theme", t); } catch {}
      }, theme);
      const page = await ctx.newPage();
      try {
        await page.goto(BASE + job.url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForSelector(job.ready, { timeout: 20000 });
      } catch {
        console.log(`  ! ${job.name}${vp.tag}/${theme}: not ready, capturing anyway`);
      }
      await page.waitForTimeout(1200); // let theme transition + accent settle
      const file = join(here, `${job.name}${vp.tag}-${theme}.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`  ✓ ${job.name}${vp.tag}-${theme}.png`);
      await ctx.close();
    }
  }
}
await browser.close();
console.log("DONE");
