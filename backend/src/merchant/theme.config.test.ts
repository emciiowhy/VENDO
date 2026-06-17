import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import {
  DEFAULT_PRESET_VIBE,
  THEME_PRESETS,
  ANNOUNCEMENT_MAX,
  normalizeHeroUrl,
  normalizeThemeConfig,
  resolveThemeConfig,
} from "./theme.config.js";

const app = createApp();

describe("Theme config endpoints require store-management auth", () => {
  it("blocks reading the theme config for the unauthenticated with 401", async () => {
    const res = await request(app).get("/api/v1/account/theme-config");
    expect(res.status).toBe(401);
  });

  it("blocks writing the theme config for the unauthenticated with 401", async () => {
    const res = await request(app).put("/api/v1/account/theme-config").send({});
    expect(res.status).toBe(401);
  });
});

describe("normalizeThemeConfig", () => {
  it("returns a complete preset for an empty object, defaulting the vibe", () => {
    const c = normalizeThemeConfig({});
    expect(c).toEqual(THEME_PRESETS[DEFAULT_PRESET_VIBE]);
  });

  it("seeds every field from the chosen vibe and keeps valid overrides", () => {
    const c = normalizeThemeConfig({
      presetVibe: "fast_track",
      primaryColor: "#ABC", // short hex → expanded + lowercased
      announcementText: "  Lunch deal  ",
    });
    expect(c.presetVibe).toBe("fast_track");
    expect(c.primaryColor).toBe("#aabbcc");
    expect(c.announcementText).toBe("Lunch deal");
    // Untouched fields fall back to the fast_track preset.
    expect(c.fontFamily).toBe(THEME_PRESETS.fast_track.fontFamily);
    expect(c.productAspectRatio).toBe(THEME_PRESETS.fast_track.productAspectRatio);
  });

  it("falls back to preset values for invalid colours/enums (never throws)", () => {
    const c = normalizeThemeConfig({
      presetVibe: "not_a_vibe",
      primaryColor: "rgb(1,2,3)",
      bgSurface: "#zzzzzz",
      fontFamily: "comic-sans",
      productAspectRatio: "16:9",
      showAnnouncementBar: "yes",
    });
    const base = THEME_PRESETS[DEFAULT_PRESET_VIBE];
    expect(c.presetVibe).toBe(DEFAULT_PRESET_VIBE);
    expect(c.primaryColor).toBe(base.primaryColor);
    expect(c.bgSurface).toBe(base.bgSurface);
    expect(c.fontFamily).toBe(base.fontFamily);
    expect(c.productAspectRatio).toBe(base.productAspectRatio);
    expect(c.showAnnouncementBar).toBe(base.showAnnouncementBar);
  });

  it("clamps the announcement text to the cap", () => {
    const c = normalizeThemeConfig({ announcementText: "x".repeat(500) });
    expect(c.announcementText.length).toBe(ANNOUNCEMENT_MAX);
  });
});

describe("normalizeHeroUrl", () => {
  it("accepts absolute http(s) URLs and server-relative paths", () => {
    expect(normalizeHeroUrl("https://cdn.example.com/hero.jpg")).toBe("https://cdn.example.com/hero.jpg");
    expect(normalizeHeroUrl("/uploads/hero/abc.png")).toBe("/uploads/hero/abc.png");
  });

  it("rejects unsafe or malformed references", () => {
    expect(normalizeHeroUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeHeroUrl("//evil.example.com/x")).toBeNull();
    expect(normalizeHeroUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(normalizeHeroUrl("   ")).toBeNull();
    expect(normalizeHeroUrl(42)).toBeNull();
  });
});

describe("resolveThemeConfig", () => {
  it("returns null for an unset (null) stored blob — stock look", () => {
    expect(resolveThemeConfig(null)).toBeNull();
    expect(resolveThemeConfig(undefined)).toBeNull();
  });

  it("re-validates a stored blob into a complete config", () => {
    const c = resolveThemeConfig({ presetVibe: "espresso_lounge", primaryColor: "#6f4e37" });
    expect(c).not.toBeNull();
    expect(c!.presetVibe).toBe("espresso_lounge");
    expect(c!.fontFamily).toBe("serif");
  });
});
