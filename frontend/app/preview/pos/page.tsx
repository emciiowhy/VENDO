import type { Metadata } from "next";
import { PosTerminalMock } from "./PosTerminalMock";

/**
 * Unlinked design-audit route for the POS redesign pilot. Renders the stateless
 * PosTerminalMock so the new high-density, touch-first register can be reviewed
 * (dark mode + tenant accents) without touching the live PosTerminal. Not linked
 * from anywhere; delete this route once the look is ported and signed off.
 */
export const metadata: Metadata = {
  title: "Preview · POS mock",
  robots: { index: false, follow: false },
};

export default function PreviewPosPage() {
  return <PosTerminalMock />;
}
