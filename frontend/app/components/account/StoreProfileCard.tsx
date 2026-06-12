"use client";

import { useEffect, useState } from "react";
import { useToast } from "../Toast";
import { ImagePicker } from "../inventory/ImagePicker";
import { CardSkeleton, PrimaryButton, SectionCard, TextArea, TextField } from "./ui";
import {
  getStore,
  removeLogo,
  saveStore,
  uploadLogo,
  type StoreProfile,
} from "@/lib/account";

/**
 * Store / business profile — the store's identity that flows onto receipts, the
 * BIR invoice header and the customer-facing display. The Store ID (slug) is the
 * login key, so it's edited deliberately with its own validation. The logo
 * uploads immediately (the rest of the form saves on submit).
 */
export function StoreProfileCard() {
  const { push } = useToast();
  const [store, setStore] = useState<StoreProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [hours, setHours] = useState("");
  const [tin, setTin] = useState("");

  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const res = await getStore();
      if (!alive) return;
      if (res.ok) hydrate(res.store);
      else setLoadError(res.error ?? "Could not load your store profile.");
    })();
    return () => {
      alive = false;
    };
  }, []);

  function hydrate(s: StoreProfile) {
    setStore(s);
    setName(s.name ?? "");
    setSlug(s.slug ?? "");
    setAddress(s.address ?? "");
    setPhone(s.phone ?? "");
    setEmail(s.email ?? "");
    setHours(s.businessHours ?? "");
    setTin(s.tin ?? "");
  }

  if (loadError) {
    return (
      <SectionCard icon="store" title="Store profile">
        <p className="text-[13.5px] font-semibold text-rose-600">{loadError}</p>
      </SectionCard>
    );
  }
  if (!store) return <CardSkeleton />;

  async function onPickLogo(file: File) {
    setPendingLogo(file);
    const res = await uploadLogo(file);
    setPendingLogo(null);
    if (res.ok) {
      setStore((prev) => (prev ? { ...prev, logoUrl: res.logoUrl } : prev));
      push({ variant: "success", title: "Logo updated" });
    } else {
      push({ variant: "danger", title: "Logo upload failed", message: res.error });
    }
  }

  async function onRemoveLogo() {
    const res = await removeLogo();
    if (res.ok) {
      setStore((prev) => (prev ? { ...prev, logoUrl: null } : prev));
      push({ variant: "success", title: "Logo removed" });
    } else {
      push({ variant: "danger", title: "Could not remove logo", message: res.error });
    }
  }

  async function submit() {
    setBusy(true);
    setSlugError(null);
    const res = await saveStore({
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
      address,
      phone,
      email,
      businessHours: hours,
      tin,
    });
    setBusy(false);
    if (res.ok) {
      hydrate(res.store);
      push({ variant: "success", title: "Store profile saved" });
      return;
    }
    if (res.errors?.slug) setSlugError(res.errors.slug);
    push({ variant: "danger", title: "Couldn’t save", message: res.error ?? res.errors?.slug });
  }

  return (
    <SectionCard
      icon="store"
      title="Store profile"
      description="Your store's identity. This appears on receipts, the BIR invoice header and the customer-facing display."
    >
      <div className="space-y-5">
        <ImagePicker
          name={name || store!.name}
          existingUrl={store!.logoUrl}
          file={pendingLogo}
          onPick={onPickLogo}
          onRemove={onRemoveLogo}
        />

        <div className="grid sm:grid-cols-2 gap-4">
          <TextField label="Store name" value={name} onChange={setName} placeholder="Kape ni Juan" />
          <TextField
            label="Store ID (used to sign in)"
            value={slug}
            onChange={setSlug}
            placeholder="kape-ni-juan"
            error={slugError}
            hint="Lowercase letters, numbers and hyphens. Changing it changes your sign-in Store ID."
          />
          <TextField label="Contact phone" value={phone} onChange={setPhone} placeholder="+63 917 000 0000" />
          <TextField label="Contact email" value={email} onChange={setEmail} placeholder="hello@store.ph" type="email" />
          <TextField label="TIN (BIR)" value={tin} onChange={setTin} placeholder="000-000-000-000" />
          <TextField label="Business hours" value={hours} onChange={setHours} placeholder="Mon–Sun · 8am–9pm" />
        </div>
        <TextArea
          label="Address"
          value={address}
          onChange={setAddress}
          placeholder="123 Rizal St, Brgy. Poblacion, Quezon City"
          rows={2}
        />

        <div className="flex justify-end">
          <PrimaryButton busy={busy} onClick={submit}>
            Save store profile
          </PrimaryButton>
        </div>
      </div>
    </SectionCard>
  );
}
