"use client";

import { CustomerDisplay } from "../../components/pos/CustomerDisplay";

/**
 * The second screen of the till — a clean, customer-facing mirror of the active
 * order. Opened from the cashier pad ("Customer display"); it carries no
 * administrative controls and syncs purely over the terminal's local
 * BroadcastChannel, so it works without any extra server calls.
 */
export default function CustomerDisplayPage() {
  return <CustomerDisplay />;
}
