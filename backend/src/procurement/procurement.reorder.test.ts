import { describe, it, expect } from "vitest";
import { suggestReorderQty } from "./procurement.reorder.js";

describe("suggestReorderQty", () => {
  it("targets roughly twice the threshold from a depleted shelf", () => {
    expect(suggestReorderQty(0, 5)).toBe(10);
  });

  it("orders only the shortfall to the two-cycle buffer", () => {
    expect(suggestReorderQty(3, 5)).toBe(7); // target 10 − on-hand 3
  });

  it("never suggests less than one even when already above target", () => {
    expect(suggestReorderQty(20, 5)).toBe(1);
  });

  it("suggests at least one when no threshold is configured", () => {
    expect(suggestReorderQty(0, 0)).toBe(1);
  });
});
