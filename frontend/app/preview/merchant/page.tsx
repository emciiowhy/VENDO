import type { Metadata } from "next";
import { MerchantHomeMock } from "./MerchantHomeMock";

/**
 * Unlinked design-audit route for the dashboard redesign (Phase 2). Renders the
 * stateless MerchantHomeMock so the dense, architectural merchant dashboard can
 * be reviewed (dark mode + tenant accents) without touching the live
 * MerchantHome. Not linked anywhere; delete once the look is ported + signed off.
 */
export const metadata: Metadata = {
  title: "Preview · Merchant dashboard mock",
  robots: { index: false, follow: false },
};

export default function PreviewMerchantPage() {
  return <MerchantHomeMock />;
}
