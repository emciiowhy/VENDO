import { describe, it, expect } from "vitest";
import {
  FEATURE_MIN_TIER,
  TIERS,
  asTier,
  featureAllowed,
  isTier,
  minTierForFeature,
  tierAtLeast,
  tierFromPlan,
  tierRank,
  type Feature,
} from "./tiers.js";

// Pure gating logic — the matrix the API guard and the frontend <FeatureGate>
// both project from. No database, no Express.

describe("tier ordering", () => {
  it("ranks STARTER < BUSINESS < ENTERPRISE", () => {
    expect(tierRank("STARTER")).toBeLessThan(tierRank("BUSINESS"));
    expect(tierRank("BUSINESS")).toBeLessThan(tierRank("ENTERPRISE"));
  });

  it("treats tierAtLeast as a >= threshold", () => {
    expect(tierAtLeast("ENTERPRISE", "BUSINESS")).toBe(true);
    expect(tierAtLeast("BUSINESS", "BUSINESS")).toBe(true);
    expect(tierAtLeast("STARTER", "BUSINESS")).toBe(false);
    expect(tierAtLeast("BUSINESS", "ENTERPRISE")).toBe(false);
  });
});

describe("isTier / asTier coercion", () => {
  it("recognises only the three known tiers", () => {
    expect(isTier("STARTER")).toBe(true);
    expect(isTier("ENTERPRISE")).toBe(true);
    expect(isTier("starter")).toBe(false); // case-sensitive guard
    expect(isTier("PLATINUM")).toBe(false);
    expect(isTier(undefined)).toBe(false);
  });

  it("coerces loose input to a known tier, defaulting to STARTER", () => {
    expect(asTier("BUSINESS")).toBe("BUSINESS");
    expect(asTier("business")).toBe("BUSINESS"); // normalises case
    expect(asTier("nonsense")).toBe("STARTER");
    expect(asTier(null)).toBe("STARTER");
    expect(asTier(42)).toBe("STARTER");
  });
});

describe("tierFromPlan projects the billing plan onto its gating tier", () => {
  it("uppercases the three billing plans", () => {
    expect(tierFromPlan("starter")).toBe("STARTER");
    expect(tierFromPlan("business")).toBe("BUSINESS");
    expect(tierFromPlan("enterprise")).toBe("ENTERPRISE");
  });

  it("defaults an unknown/empty plan to STARTER", () => {
    expect(tierFromPlan(null)).toBe("STARTER");
    expect(tierFromPlan("")).toBe("STARTER");
    expect(tierFromPlan("legacy")).toBe("STARTER");
  });
});

describe("feature → minimum-tier matrix (official product tiers)", () => {
  it("keeps the core retail-floor features on STARTER", () => {
    expect(minTierForFeature("pos_terminal")).toBe("STARTER");
    expect(minTierForFeature("inventory_basic")).toBe("STARTER");
    expect(minTierForFeature("bir_receipts")).toBe("STARTER");
    expect(minTierForFeature("digital_payments_qrph")).toBe("STARTER");
    expect(minTierForFeature("offline_mode")).toBe("STARTER");
  });

  it("gates the back-office ERP pillars at BUSINESS", () => {
    expect(minTierForFeature("procurement_supply_chain")).toBe("BUSINESS");
    expect(minTierForFeature("customer_relationship_crm")).toBe("BUSINESS");
    expect(minTierForFeature("finance_accounting")).toBe("BUSINESS");
    expect(minTierForFeature("multi_staff_roles")).toBe("BUSINESS");
    expect(minTierForFeature("custom_branding")).toBe("BUSINESS");
  });

  it("gates scale + automation modules at ENTERPRISE", () => {
    expect(minTierForFeature("manufacturing_bom")).toBe("ENTERPRISE");
    expect(minTierForFeature("human_resources_payroll")).toBe("ENTERPRISE");
    expect(minTierForFeature("multi_location")).toBe("ENTERPRISE");
    expect(minTierForFeature("priority_support")).toBe("ENTERPRISE");
    expect(minTierForFeature("predictive_inventory")).toBe("ENTERPRISE");
  });
});

describe("featureAllowed enforces the matrix", () => {
  it("lets STARTER use only the core retail-floor features", () => {
    expect(featureAllowed("STARTER", "digital_payments_qrph")).toBe(true);
    expect(featureAllowed("STARTER", "customer_relationship_crm")).toBe(false);
    expect(featureAllowed("STARTER", "procurement_supply_chain")).toBe(false);
    expect(featureAllowed("STARTER", "human_resources_payroll")).toBe(false);
  });

  it("lets BUSINESS use Starter + Business modules but not Enterprise", () => {
    expect(featureAllowed("BUSINESS", "bir_receipts")).toBe(true);
    expect(featureAllowed("BUSINESS", "customer_relationship_crm")).toBe(true);
    expect(featureAllowed("BUSINESS", "finance_accounting")).toBe(true);
    expect(featureAllowed("BUSINESS", "manufacturing_bom")).toBe(false);
    expect(featureAllowed("BUSINESS", "human_resources_payroll")).toBe(false);
  });

  it("lets ENTERPRISE use every feature (higher tiers inherit lower ones)", () => {
    for (const feature of Object.keys(FEATURE_MIN_TIER) as Feature[]) {
      expect(featureAllowed("ENTERPRISE", feature)).toBe(true);
    }
  });

  it("never lets a tier below a feature's minimum through, exhaustively", () => {
    for (const feature of Object.keys(FEATURE_MIN_TIER) as Feature[]) {
      const min = minTierForFeature(feature);
      for (const tier of TIERS) {
        expect(featureAllowed(tier, feature)).toBe(tierAtLeast(tier, min));
      }
    }
  });
});
