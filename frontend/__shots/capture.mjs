import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(join(here, "tokens.json"), "utf8"));
const BASE = "http://localhost:3000";

const jobs = [
  { name: "admin", url: "/admin", token: tokens.admin, ready: "text=Monthly Recurring Revenue" },
  { name: "dashboard", url: "/dashboard", token: tokens.owner, ready: "text=Revenue velocity" },
];

const browser = await chromium.launch();
for (const job of jobs) {
  for (const theme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
    await ctx.addCookies([
      { name: "vendopos_session", value: job.token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
    ]);
    await ctx.addInitScript((t) => {
      try { window.localStorage.setItem("vendopos_theme", t); } catch {}
    }, theme);
    const page = await ctx.newPage();
    await page.goto(BASE + job.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    try {
      await page.waitForSelector(job.ready, { timeout: 20000 });
    } catch {
      console.log(`  ! ${job.name}/${theme}: ready selector timed out, capturing anyway`);
    }
    await page.waitForTimeout(1800); // let data, bars and theme transition settle
    const file = join(here, `${job.name}-${theme}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`  ✓ ${job.name}-${theme}.png`);
    await ctx.close();
  }
}
await browser.close();
console.log("DONE");
