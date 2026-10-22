import { describe, it, expect } from "vitest";
import { computeVatBreakdown, priceCart, type CartDiscount, type VatClass } from "./pos/pos.schema.js";
import { FEATURE_MIN_TIER } from "./lib/tiers.js";

/**
 * Frontend ↔ backend parity.
 *
 * The register previews VAT and gates features client-side, and the server
 * re-derives both authoritatively. When the two drift the cashier sees one VAT
 * figure and the receipt another (the "VAT-exempt item shows 12% VAT" bug).
 * These tests load the frontend modules directly and hold them to the server.
 *
 * They're imported at runtime (not statically) because the backend's tsconfig
 * rootDir is `src`; vitest resolves the .ts sources either way.
 */
const FRONTEND = "../../frontend/lib";

type PreviewLine = { vatClass: VatClass; lineCents: number };
type PosModule = { previewVatCents: (lines: PreviewLine[], discountCents?: number) => number };

async function loadPos(): Promise<PosModule> {
  return (await import(/* @vite-ignore */ `${FRONTEND}/pos.ts`)) as PosModule;
}

function serverVat(lines: PreviewLine[], discountCents = 0): number {
  return computeVatBreakdown(
    lines.map((l) => ({ vatClass: l.vatClass, grossCents: l.lineCents })),
    discountCents,
  ).vatCents;
}

// Small deterministic PRNG so a failure is reproducible from its seed.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("register VAT preview mirrors the server's computeVatBreakdown", () => {
  it("shows no VAT for a VAT-exempt item (the reported ₱5,000 phone bug)", async () => {
    const { previewVatCents } = await loadPos();
    const lines: PreviewLine[] = [{ vatClass: "EXEMPT", lineCents: 500000 }];
    expect(previewVatCents(lines)).toBe(0);
    expect(serverVat(lines)).toBe(0);
  });

  it("shows no VAT for a zero-rated item", async () => {
    const { previewVatCents } = await loadPos();
    expect(previewVatCents([{ vatClass: "ZERO_RATED", lineCents: 500000 }])).toBe(0);
  });

  it("extracts 12/112 from a VATable item", async () => {
    const { previewVatCents } = await loadPos();
    // ₱5,000 × 12/112 = ₱535.71
    expect(previewVatCents([{ vatClass: "VATABLE", lineCents: 500000 }])).toBe(53571);
  });

  it("only taxes the VATable share of a mixed cart with a discount", async () => {
    const { previewVatCents } = await loadPos();
    const lines: PreviewLine[] = [
      { vatClass: "VATABLE", lineCents: 26500 },
      { vatClass: "EXEMPT", lineCents: 10000 },
    ];
    expect(previewVatCents(lines, 3650)).toBe(serverVat(lines, 3650));
    expect(previewVatCents(lines, 3650)).toBeLessThan(Math.round((26500 * 12) / 112));
  });

  it("agrees with the server on 2,000 random carts and discounts", async () => {
    const { previewVatCents } = await loadPos();
    const rand = mulberry32(20261017);
    const classes: VatClass[] = ["VATABLE", "EXEMPT", "ZERO_RATED"];
    for (let i = 0; i < 2000; i++) {
      const lines: PreviewLine[] = Array.from({ length: 1 + Math.floor(rand() * 6) }, () => ({
        vatClass: classes[Math.floor(rand() * classes.length)],
        lineCents: 1 + Math.floor(rand() * 1_000_000),
      }));
      const gross = lines.reduce((s, l) => s + l.lineCents, 0);
      // Include no discount, partial discounts, and over-discounts (clamped).
      const discount = i % 4 === 0 ? 0 : Math.floor(rand() * gross * 1.2);
      expect(previewVatCents(lines, discount), `case ${i}`).toBe(serverVat(lines, discount));
    }
  });
});

describe("register cart preview mirrors the server's priceCart", () => {
  type CartLine = PreviewLine & { scPwdEligible: boolean };
  type PreviewCart = (input: {
    lines: CartLine[];
    discount: CartDiscount | null;
    requestedPoints: number;
    pointsBalance: number;
    pointValueCents: number;
    vatRegistered?: boolean;
  }) => { netCents: number; discountCents: number; vatCents: number; pointsRedeemed: number; eligibleLineCount: number };
  const loadPreview = async () =>
    ((await import(/* @vite-ignore */ `${FRONTEND}/pos.ts`)) as { previewCart: PreviewCart }).previewCart;

  it("agrees with the server on 3,000 random carts, discounts and redemptions", async () => {
    const previewCart = await loadPreview();
    const rand = mulberry32(20261018);
    const classes: VatClass[] = ["VATABLE", "EXEMPT", "ZERO_RATED"];
    const discounts: (CartDiscount | null)[] = [
      null,
      { kind: "senior" },
      { kind: "pwd" },
      { kind: "member", pct: 5 },
      { kind: "member", pct: 37 },
      { kind: "promo", name: "Payday", promoKind: "percent", value: 15 },
      { kind: "promo", name: "₱50 off", promoKind: "fixed", value: 5_000 },
    ];
    for (let i = 0; i < 3000; i++) {
      const lines: CartLine[] = Array.from({ length: 1 + Math.floor(rand() * 6) }, () => ({
        vatClass: classes[Math.floor(rand() * classes.length)],
        lineCents: 1 + Math.floor(rand() * 500_000),
        scPwdEligible: rand() > 0.3,
      }));
      const discount = discounts[i % discounts.length];
      const points = {
        requestedPoints: i % 3 === 0 ? 0 : Math.floor(rand() * 20_000),
        pointsBalance: Math.floor(rand() * 20_000),
        pointValueCents: 1 + Math.floor(rand() * 300),
        // Every 4th cart prices as a NON-VAT store.
        vatRegistered: i % 4 !== 3,
      };
      const client = previewCart({ lines, discount, ...points });
      const server = priceCart({
        lines: lines.map((l) => ({ vatClass: l.vatClass, grossCents: l.lineCents, scPwdEligible: l.scPwdEligible })),
        discount,
        ...points,
      });
      const pick = (r: typeof client) => ({
        netCents: r.netCents,
        discountCents: r.discountCents,
        vatCents: r.vatCents,
        pointsRedeemed: r.pointsRedeemed,
        eligibleLineCount: r.eligibleLineCount,
      });
      expect(pick(client), `case ${i}`).toEqual(pick(server));
    }
  });
});

describe("feature gating matrix is identical on both sides", () => {
  it("frontend FEATURE_MIN_TIER matches the backend's", async () => {
    const fe = (await import(/* @vite-ignore */ `${FRONTEND}/tiers.ts`)) as {
      FEATURE_MIN_TIER: Record<string, string>;
    };
    expect(fe.FEATURE_MIN_TIER).toEqual(FEATURE_MIN_TIER);
  });
});
