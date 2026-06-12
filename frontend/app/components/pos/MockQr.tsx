"use client";

import { useMemo } from "react";

/**
 * A deterministic, on-brand mock QR (presentation only — not scannable). A 21×21
 * module matrix with the three standard finder eyes and a seeded pseudo-random
 * fill, so the same order always renders the same pattern. Shared by the
 * customer display and the cashier checkout's e-wallet sheet.
 */
export function MockQr({ seed, className = "w-[208px] h-[208px] text-[#0b1220]" }: { seed: string; className?: string }) {
  const modules = useMemo(() => buildMatrix(seed), [seed]);
  const N = modules.length;
  return (
    <svg
      viewBox={`0 0 ${N} ${N}`}
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Payment QR code"
    >
      {modules.flatMap((row, r) =>
        row.map((on, c) =>
          on ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="currentColor" /> : null,
        ),
      )}
    </svg>
  );
}

function buildMatrix(seed: string): boolean[][] {
  const N = 21;
  const rng = mulberry32(hashString(seed));
  const m: boolean[][] = Array.from({ length: N }, () => Array<boolean>(N).fill(false));

  const inFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);

  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (inFinder(r, c)) continue;
      const nearFinder = (r < 8 && c < 8) || (r < 8 && c >= N - 8) || (r >= N - 8 && c < 8);
      if (nearFinder) continue;
      m[r][c] = rng() > 0.5;
    }
  }

  const drawFinder = (or: number, oc: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const ring = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        m[or + r][oc + c] = ring || core;
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, N - 7);
  drawFinder(N - 7, 0);

  return m;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
