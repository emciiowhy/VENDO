"use client";

import { useEffect, useState } from "react";
import { useToast } from "../Toast";
import { ImagePicker } from "../inventory/ImagePicker";
import { CardSkeleton, PrimaryButton, SectionCard, TextField } from "./ui";
import {
  getProfile,
  removeAvatar,
  saveProfile,
  uploadAvatar,
  type OwnerProfile,
} from "@/lib/account";

/**
 * Personal profile for the signed-in owner/manager — display name, contact
 * phone and a photo. Email is the Google identity key, so it's shown read-only.
 * The avatar uploads immediately; name + phone save on submit.
 */
export function ProfileCard() {
  const { push } = useToast();
  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getProfile();
      if (!alive) return;
      if (res.ok) {
        setProfile(res.profile);
        setName(res.profile.name ?? "");
        setPhone(res.profile.phone ?? "");
      } else setLoadError(res.error ?? "Could not load your profile.");
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loadError) {
    return (
      <SectionCard icon="users" title="Your profile">
        <p className="text-[13.5px] font-semibold text-rose-600">{loadError}</p>
      </SectionCard>
    );
  }
  if (!profile) return <CardSkeleton />;

  async function onPickAvatar(file: File) {
    setPendingAvatar(file);
    const res = await uploadAvatar(file);
    setPendingAvatar(null);
    if (res.ok) {
      setProfile((prev) => (prev ? { ...prev, avatarUrl: res.avatarUrl } : prev));
      push({ variant: "success", title: "Photo updated" });
    } else {
      push({ variant: "danger", title: "Upload failed", message: res.error });
    }
  }

  async function onRemoveAvatar() {
    const res = await removeAvatar();
    if (res.ok) {
      setProfile((prev) => (prev ? { ...prev, avatarUrl: null } : prev));
      push({ variant: "success", title: "Photo removed" });
    } else {
      push({ variant: "danger", title: "Could not remove photo", message: res.error });
    }
  }

  async function submit() {
    setBusy(true);
    const res = await saveProfile({ name: name.trim(), phone });
    setBusy(false);
    if (res.ok) {
      setProfile(res.profile);
      push({ variant: "success", title: "Profile saved" });
    } else {
      push({ variant: "danger", title: "Couldn’t save", message: res.error });
    }
  }

  return (
    <SectionCard
      icon="users"
      title="Your profile"
      description="How you appear across the workspace."
    >
      <div className="space-y-5">
        <ImagePicker
          name={name || profile!.name}
          existingUrl={profile!.avatarUrl}
          file={pendingAvatar}
          onPick={onPickAvatar}
          onRemove={onRemoveAvatar}
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <TextField label="Display name" value={name} onChange={setName} placeholder="Juan dela Cruz" />
          <TextField label="Phone" value={phone} onChange={setPhone} placeholder="+63 917 000 0000" />
        </div>
        <TextField
          label="Email"
          value={profile.email}
          onChange={() => {}}
          disabled
          hint="Your email is linked to Google sign-in and can't be changed here."
        />
        <div className="flex justify-end">
          <PrimaryButton busy={busy} onClick={submit}>
            Save profile
          </PrimaryButton>
        </div>
      </div>
    </SectionCard>
  );
}
