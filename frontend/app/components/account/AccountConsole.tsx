"use client";

import { useState } from "react";
import { Icon, type IconName } from "../Icon";
import { useDashUser } from "../dash/DashShell";
import { SecurityCard } from "../dash/SecurityCard";
import { StoreProfileCard } from "./StoreProfileCard";
import { AppearanceCard } from "./AppearanceCard";
import { ReceiptSettingsCard } from "./ReceiptSettingsCard";
import { ProfileCard } from "./ProfileCard";
import { PreferencesCard } from "./PreferencesCard";
import { SessionsCard } from "./SessionsCard";
import { LoginActivityCard } from "./LoginActivityCard";
import { DataExportCard } from "./DataExportCard";
import { DangerZoneCard } from "./DangerZoneCard";

/**
 * The owner Account hub. A single page split into themed sections behind a tab
 * bar: who you are (Profile), your store's identity (Store, Receipt), how you
 * sign in and which devices are active (Security), workspace preferences, and
 * your data (export + deactivate). The danger zone is owner-only.
 */
type TabKey = "profile" | "store" | "appearance" | "receipt" | "security" | "preferences" | "data";

const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: "profile", label: "Profile", icon: "users" },
  { key: "store", label: "Store", icon: "store" },
  { key: "appearance", label: "Appearance", icon: "layers" },
  { key: "receipt", label: "Receipt", icon: "receipt" },
  { key: "security", label: "Security", icon: "lock" },
  { key: "preferences", label: "Preferences", icon: "gear" },
  { key: "data", label: "Data", icon: "database" },
];

export function AccountConsole() {
  const user = useDashUser();
  const isOwner = user.role === "MERCHANT_OWNER";
  const [tab, setTab] = useState<TabKey>("profile");

  return (
    <div className="max-w-[860px]">
      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto rounded-[12px] hairline bg-surface p-1 mb-6">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={
                "flex items-center gap-2 px-4 py-2 rounded-[9px] text-[13.5px] font-semibold whitespace-nowrap transition duration-150 " +
                (active ? "bg-brand-50 text-brand-700" : "text-ink-soft hover:text-ink hover:bg-paper")
              }
            >
              <Icon name={t.icon} className="w-[16px] h-[16px]" strokeWidth={active ? 1.9 : 1.6} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Sections */}
      {tab === "profile" && <ProfileCard />}
      {tab === "store" && <StoreProfileCard />}
      {tab === "appearance" && <AppearanceCard />}
      {tab === "receipt" && <ReceiptSettingsCard />}
      {tab === "security" && (
        <div className="space-y-5">
          <SecurityCard />
          <SessionsCard />
          <LoginActivityCard />
        </div>
      )}
      {tab === "preferences" && <PreferencesCard />}
      {tab === "data" && (
        <div className="space-y-5">
          <DataExportCard />
          {isOwner && <DangerZoneCard />}
        </div>
      )}
    </div>
  );
}
