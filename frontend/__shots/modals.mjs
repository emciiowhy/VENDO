import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Captures the two modals changed in the checkout/contrast work, in light + dark:
 *   1. The /pos "Open cash drawer?" confirmation (ConfirmDialog) — proves the
 *      dark-mode title contrast fix (token-less portal text was inheriting
 *      body's light-mode ink and rendering dark-on-dark).
 *   2. The checkout overlay with cash short — shows the new rose "Short by ₱X"
 *      chip mirroring the green "Change due".
 *
 * AUTH: this script does NOT mint tokens. Drop a real session into
 * frontend/__shots/tokens.json as { "owner": "<vendopos_session cookie value>" }.
 * Get that value from a logged-in browser: DevTools → Application → Cookies →
 * http://localhost:3000 → vendopos_session. An owner/manager session loads /pos
 * without an open-shift gate. Then: `node __shots/modals.mjs` (servers must be up).
 */
const here = dirname(fileURLToPath(import.meta.url));
const TOKENS = join(here, "tokens.json");
const BASE = "http://localhost:3000";

if (!existsSync(TOKENS)) {
  console.error(`No tokens.json. Create ${TOKENS} = { "owner": "<vendopos_session value>" } first.`);
  process.exit(1);
}
const tokens = JSON.parse(readFileSync(TOKENS, "utf8"));
if (!tokens.owner) {
  console.error('tokens.json is missing an "owner" session value.');
  process.exit(1);
}

const browser = await chromium.launch();

async function posPage(theme) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
  await ctx.addCookies([
    { name: "vendopos_session", value: tokens.owner, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
  await ctx.addInitScript((t) => { try { window.localStorage.setItem("vendopos_theme", t); } catch {} }, theme);
  const page = await ctx.newPage();
  await page.goto(BASE + "/pos", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('button[title="Open cash drawer (No Sale)"]', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500); // let catalog + theme settle
  return { ctx, page };
}

for (const theme of ["dark", "light"]) {
  // 1) Open cash drawer confirmation
  {
    const { ctx, page } = await posPage(theme);
    await page.click('button[title="Open cash drawer (No Sale)"]');
    await page.waitForSelector("text=Open cash drawer?", { timeout: 5000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(here, `modal-opendrawer-${theme}.png`), fullPage: false });
    console.log(`  ✓ modal-opendrawer-${theme}.png`);
    await ctx.close();
  }

  // 2) Checkout overlay with cash short → "Short by" chip
  {
    const { ctx, page } = await posPage(theme);
    try {
      await page.locator("button.shadow-card").first().click({ timeout: 5000 }); // add first product tile
      await page.waitForTimeout(300);
      await page.locator('button:has-text("Checkout")').first().click({ timeout: 5000 });
      await page.waitForSelector("text=Total due", { timeout: 5000 });
      await page.locator('input[inputmode="decimal"]').first().fill("1"); // intentionally short
      await page.waitForSelector("text=Short by", { timeout: 4000 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: join(here, `modal-checkout-short-${theme}.png`), fullPage: false });
      console.log(`  ✓ modal-checkout-short-${theme}.png`);
    } catch (e) {
      console.log(`  ! checkout-short-${theme}: ${e.message.split("\n")[0]}`);
    }
    await ctx.close();
  }
}

await browser.close();
console.log("DONE");
