import { chromium } from "playwright";

const BASE = process.argv[2] || "https://vendopos.shop";

async function probe(page) {
  const solarCount = await page.evaluate(() => document.querySelectorAll(".solar").length);
  const heroFloat = await page.evaluate(() => {
    const el = document.querySelector(".vp-hero-float");
    return el ? getComputedStyle(el).animationName : "NO .vp-hero-float";
  });
  const host = await page.evaluateHandle(() =>
    [...document.querySelectorAll("a, button, [role=button]")].find((e) => e.querySelector(".solar")) || null,
  );
  const info = await host.evaluate((el) => (el ? { tag: el.tagName, text: (el.textContent || "").trim().slice(0, 24) } : null));
  if (!info) throw new Error("No interactive element with a .solar icon");
  const before = await host.evaluate((el) => getComputedStyle(el.querySelector(".solar")).animationName);
  await host.asElement().hover();
  await page.waitForTimeout(90);
  const hover = await host.evaluate((el) => getComputedStyle(el.querySelector(".solar")).animationName);
  return { solarCount, heroFloat, info, before, hover };
}

const browser = await chromium.launch();

const p1 = await (await browser.newContext()).newPage();
await p1.goto(BASE, { waitUntil: "networkidle" });
const n = await probe(p1);
console.log("BASE:", BASE);
console.log("solar icons on page:", n.solarCount);
console.log("hero float animation:", n.heroFloat);
console.log("hover host:", JSON.stringify(n.info));
console.log("icon anim (idle):", n.before);
console.log("icon anim (hover):", n.hover);

const p2 = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
await p2.goto(BASE, { waitUntil: "networkidle" });
const r = await probe(p2);
console.log("icon anim (hover, reduced-motion):", r.hover);
console.log("hero float (reduced-motion):", r.heroFloat);

await browser.close();

const pass =
  n.solarCount > 0 &&
  n.before === "none" &&
  n.hover === "vp-icon-pop" &&
  r.hover === "none";
console.log(pass ? "RESULT: PASS" : "RESULT: FAIL");
process.exit(pass ? 0 : 1);
