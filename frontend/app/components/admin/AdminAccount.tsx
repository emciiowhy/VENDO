"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { FallbackImg } from "../FallbackImg";
import { resolveAssetUrl } from "@/lib/images";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwordPolicy";
import {
  getPasswordStatus,
  getProfile,
  removeAvatar,
  saveProfile,
  setPassword,
  uploadAvatar,
  type AdminProfile,
} from "@/lib/adminAccount";

/**
 * The Super Admin's own account hub. The operator sits above every store and so
 * never had a Settings surface of their own — this is it: edit identity (photo,
 * name, phone) and rotate the sign-in password. Two focused cards; the email is
 * the immutable sign-in key, shown but not editable. Reuses the same back-office
 * card idiom as the merchant Account hub for consistency.
 */

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; profile: AdminProfile };

export function AdminAccount() {
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getProfile();
      if (!alive) return;
      if (res.ok) setLoad({ status: "ready", profile: res.profile });
      else setLoad({ status: "error", message: res.error ?? "Could not load your profile." });
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (load.status === "loading") {
    return (
      <div className="max-w-[640px] space-y-6">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl2 bg-surface hairline shadow-card p-6">
            <div className="h-24 rounded-[10px] bg-paper hairline animate-pulse" />
          </div>
        ))}
      </div>
    );
  }
  if (load.status === "error") {
    return (
      <p className="max-w-[640px] rounded-xl2 bg-surface hairline shadow-card px-6 py-12 text-center text-note font-semibold text-rose-600">
        {load.message}
      </p>
    );
  }

  return (
    <div className="max-w-[640px] space-y-6">
      <ProfileCard
        profile={load.profile}
        onChange={(p) => setLoad({ status: "ready", profile: p })}
      />
      <SecurityCard />
    </div>
  );
}

/* ------------------------------ profile card ------------------------------ */

function ProfileCard({
  profile,
  onChange,
}: {
  profile: AdminProfile;
  onChange: (p: AdminProfile) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = name.trim() !== profile.name || (phone.trim() || null) !== (profile.phone ?? null);
  const initials = profile.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  function flash(msg: string) {
    setNote(msg);
    window.setTimeout(() => setNote(null), 3000);
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setBusy(true);
    const res = await uploadAvatar(file);
    setBusy(false);
    if (res.ok) {
      onChange({ ...profile, avatarUrl: res.avatarUrl });
      flash("Photo updated.");
    } else {
      setError(res.error ?? "Could not upload your photo.");
    }
  }

  async function onRemoveAvatar() {
    setError(null);
    setBusy(true);
    const res = await removeAvatar();
    setBusy(false);
    if (res.ok) {
      onChange({ ...profile, avatarUrl: null });
      flash("Photo removed.");
    } else {
      setError(res.error ?? "Could not remove your photo.");
    }
  }

  async function onSave() {
    setError(null);
    setBusy(true);
    const res = await saveProfile({ name: name.trim(), phone: phone.trim() || undefined });
    setBusy(false);
    if (res.ok) {
      onChange(res.profile);
      flash("Profile saved.");
    } else {
      setError(res.error ?? "Could not save your profile.");
    }
  }

  return (
    <section className="rounded-xl2 bg-surface hairline shadow-card p-6">
      <CardTitle icon="gear" title="Profile" sub="Your identity across the platform console" />

      {/* Avatar */}
      <div className="mt-5 flex items-center gap-4">
        <FallbackImg
          src={resolveAssetUrl(profile.avatarUrl)}
          alt={profile.name}
          className="w-16 h-16 rounded-full object-cover hairline"
          fallback={
            <span className="w-16 h-16 rounded-full bg-ink text-paper grid place-items-center font-extrabold text-[18px] tracking-tight">
              {initials || "A"}
            </span>
          }
        />
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 rounded-[10px] hairline bg-surface px-3.5 py-2 text-note font-semibold cursor-pointer hover:border-brand-200 hover:text-brand-600 transition duration-150">
            <Icon name="upload" className="w-4 h-4" />
            Change
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onPickAvatar}
              className="hidden"
              disabled={busy}
            />
          </label>
          {profile.avatarUrl && (
            <button
              type="button"
              onClick={() => void onRemoveAvatar()}
              disabled={busy}
              className="rounded-[10px] px-3 py-2 text-note font-semibold text-ink-soft hover:text-rose-600 transition duration-150 disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-4 text-note font-semibold text-rose-600 bg-rose-50 rounded-[10px] px-3.5 py-2.5">
          {error}
        </p>
      )}

      <div className="mt-5 space-y-4">
        <FormRow label="Full name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field-input w-full rounded-[10px] px-3.5 py-2.5 text-note font-semibold"
          />
        </FormRow>
        <FormRow label="Email" hint="Your sign-in key — can't be changed here">
          <input
            value={profile.email}
            readOnly
            className="field-input w-full rounded-[10px] px-3.5 py-2.5 text-note text-ink-soft cursor-not-allowed"
          />
        </FormRow>
        <FormRow label="Phone">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Optional"
            className="field-input w-full rounded-[10px] px-3.5 py-2.5 text-note"
          />
        </FormRow>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={busy || !dirty || !name.trim()}
          className="rounded-[10px] bg-brand-500 hover:bg-brand-600 px-5 py-2.5 font-semibold text-[14px] text-white shadow-btn tracking-tight transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
        {note && (
          <span className="inline-flex items-center gap-1.5 text-note font-semibold text-accent-600">
            <Icon name="check" className="w-4 h-4" strokeWidth={2.4} />
            {note}
          </span>
        )}
      </div>
    </section>
  );
}

/* ----------------------------- security card ------------------------------ */

function SecurityCard() {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getPasswordStatus();
      if (alive && res.ok) setHasPassword(res.hasPassword);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function onSave() {
    setError(null);
    setFieldErr({});
    setBusy(true);
    const res = await setPassword({
      currentPassword: hasPassword ? current : undefined,
      newPassword: next,
    });
    setBusy(false);
    if (res.ok) {
      setCurrent("");
      setNext("");
      setHasPassword(true);
      setNote("Password updated.");
      window.setTimeout(() => setNote(null), 3000);
    } else if (res.errors) {
      setFieldErr(res.errors);
    } else {
      setError(res.error ?? "Could not update your password.");
    }
  }

  return (
    <section className="rounded-xl2 bg-surface hairline shadow-card p-6">
      <CardTitle
        icon="lock"
        title="Security"
        sub={
          hasPassword === false
            ? "Set a password to sign in without Google"
            : "Change your sign-in password"
        }
      />

      {error && (
        <p className="mt-4 text-note font-semibold text-rose-600 bg-rose-50 rounded-[10px] px-3.5 py-2.5">
          {error}
        </p>
      )}

      <div className="mt-5 space-y-4">
        {hasPassword && (
          <FormRow label="Current password" error={fieldErr.currentPassword}>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              className="field-input w-full rounded-[10px] px-3.5 py-2.5 text-note"
            />
          </FormRow>
        )}
        <FormRow
          label="New password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
          error={fieldErr.newPassword}
        >
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            className="field-input w-full rounded-[10px] px-3.5 py-2.5 text-note"
          />
        </FormRow>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={busy || next.length === 0 || (hasPassword === true && current.length === 0)}
          className="rounded-[10px] bg-brand-500 hover:bg-brand-600 px-5 py-2.5 font-semibold text-[14px] text-white shadow-btn tracking-tight transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Saving…" : hasPassword ? "Change password" : "Set password"}
        </button>
        {note && (
          <span className="inline-flex items-center gap-1.5 text-note font-semibold text-accent-600">
            <Icon name="check" className="w-4 h-4" strokeWidth={2.4} />
            {note}
          </span>
        )}
      </div>
    </section>
  );
}

/* --------------------------------- bits ----------------------------------- */

function CardTitle({ icon, title, sub }: { icon: Parameters<typeof Icon>[0]["name"]; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid place-items-center w-10 h-10 rounded-[12px] bg-brand-50 text-brand-600 shrink-0">
        <Icon name={icon} className="w-5 h-5" strokeWidth={1.6} />
      </span>
      <div>
        <h2 className="font-extrabold tracking-tight leading-none">{title}</h2>
        <p className="mt-1 text-fine text-ink-soft">{sub}</p>
      </div>
    </div>
  );
}

function FormRow({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-cap font-bold tracking-wide text-ink-faint uppercase">{label}</span>
        {hint && !error && <span className="text-cap text-ink-faint">{hint}</span>}
      </div>
      {children}
      {error && <p className="mt-1 text-fine font-semibold text-rose-600">{error}</p>}
    </label>
  );
}
