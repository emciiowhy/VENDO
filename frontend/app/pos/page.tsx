"use client";

import { PosTerminal } from "../components/pos/PosTerminal";

/**
 * The shared shop-floor register. A self-contained, locked full-screen
 * terminal (no back-office sidebar) — cashiers, managers, and owners operate
 * the till here; cashiers switch profiles by PIN.
 */
export default function PosPage() {
  return <PosTerminal />;
}
