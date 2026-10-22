import { describe, it, expect } from "vitest";
import { MAX_PAGE_SIZE, parsePaging } from "./paging.js";

const FRONTEND = "../../../frontend/lib";
type PagerModule = {
  pageCount: (total: number, size: number) => number;
  clampPage: (page: number, total: number, size: number) => number;
  pageRange: (page: number, total: number, size: number) => { from: number; to: number };
  pageSlice: <T>(items: T[], page: number, size: number) => T[];
  pageWindow: (current: number, count: number) => (number | "…")[];
};
const loadPager = async () => (await import(/* @vite-ignore */ `${FRONTEND}/pagination.ts`)) as PagerModule;

describe("parsePaging (server)", () => {
  it("defaults to page 1 of 25", () => {
    expect(parsePaging({})).toEqual({ page: 1, pageSize: 25, offset: 0 });
  });

  it("reads page and size into an offset", () => {
    expect(parsePaging({ page: "3", pageSize: "50" })).toEqual({ page: 3, pageSize: 50, offset: 100 });
  });

  it("caps the page size so a client can't pull the whole table", () => {
    expect(parsePaging({ pageSize: "100000" }).pageSize).toBe(MAX_PAGE_SIZE);
  });

  it("ignores anything that isn't a positive whole number (nothing unsafe reaches SQL)", () => {
    for (const bad of ["0", "-1", "2.5", "1; DROP TABLE sales", "abc", ""]) {
      expect(parsePaging({ page: bad, pageSize: bad })).toEqual({ page: 1, pageSize: 25, offset: 0 });
    }
  });
});

describe("pagination maths (frontend lib/pagination.ts)", () => {
  it("counts pages, never fewer than 1", async () => {
    const { pageCount } = await loadPager();
    expect([pageCount(0, 25), pageCount(25, 25), pageCount(26, 25), pageCount(140, 25)]).toEqual([1, 1, 2, 6]);
  });

  it("clamps a page into range and reports the rows shown", async () => {
    const { clampPage, pageRange } = await loadPager();
    expect(clampPage(99, 140, 25)).toBe(6);
    expect(clampPage(0, 140, 25)).toBe(1);
    expect(pageRange(2, 140, 25)).toEqual({ from: 26, to: 50 });
    expect(pageRange(6, 140, 25)).toEqual({ from: 126, to: 140 });
    expect(pageRange(1, 0, 25)).toEqual({ from: 0, to: 0 });
  });

  it("slices one page of an in-memory list", async () => {
    const { pageSlice } = await loadPager();
    const items = Array.from({ length: 30 }, (_, i) => i + 1);
    expect(pageSlice(items, 2, 25)).toEqual([26, 27, 28, 29, 30]);
  });

  it("shows first, last, the current page and neighbours, with gaps", async () => {
    const { pageWindow } = await loadPager();
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(2, 20)).toEqual([1, 2, 3, 4, 5, "…", 20]);
    expect(pageWindow(10, 20)).toEqual([1, "…", 9, 10, 11, "…", 20]);
    expect(pageWindow(19, 20)).toEqual([1, "…", 16, 17, 18, 19, 20]);
  });
});
