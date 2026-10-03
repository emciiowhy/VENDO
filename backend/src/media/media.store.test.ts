import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// In-memory stand-in for the media_objects table.
const rows = new Map<string, { content_type: string; bytes: Buffer }>();
vi.mock("../db.js", () => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.startsWith("INSERT")) {
      rows.set(params[0] as string, { content_type: params[1] as string, bytes: params[2] as Buffer });
      return { rows: [] };
    }
    if (sql.startsWith("DELETE")) {
      rows.delete(params[0] as string);
      return { rows: [] };
    }
    const row = rows.get(params[0] as string);
    return { rows: row ? [row] : [] };
  }),
  pool: { query: vi.fn(), on: vi.fn() },
}));

const { putMedia, removeMedia } = await import("./media.store.js");
const { createApp } = await import("../app.js");
const app = createApp();

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const pathOf = (url: string) => url.slice(url.indexOf("/uploads/"));

describe("Durable media store", () => {
  beforeEach(() => rows.clear());

  it("stores an image and serves it back from /uploads with cross-origin headers", async () => {
    const url = await putMedia("account/avatars", PNG, "image/png");
    expect(url).toMatch(/\/uploads\/account\/avatars\/[0-9a-f-]{36}\.png$/);

    const res = await request(app).get(pathOf(url)).buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(res.headers["cache-control"]).toContain("immutable");
    expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);
  });

  it("rejects non-image content types", async () => {
    await expect(putMedia("products", PNG, "text/html")).rejects.toThrow("Unsupported");
  });

  it("removes an image so it 404s afterwards", async () => {
    const url = await putMedia("account/logos", PNG, "image/png");
    await removeMedia("account/logos", url);
    const res = await request(app).get(pathOf(url));
    expect(res.status).toBe(404);
  });

  it("ignores removal of URLs outside the given prefix", async () => {
    const url = await putMedia("account/logos", PNG, "image/png");
    await removeMedia("account/avatars", url);
    await removeMedia("account/logos", "https://cdn.example.com/x.png");
    expect(rows.size).toBe(1);
  });

  it("404s an unknown upload path", async () => {
    const res = await request(app).get("/uploads/products/does-not-exist.png");
    expect(res.status).toBe(404);
  });
});
