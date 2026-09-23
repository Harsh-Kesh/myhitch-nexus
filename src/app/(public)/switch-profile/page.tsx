"use client";

import {
  IconCheck,
  IconCrown,
  IconLock,
  IconPencil,
  IconPlus,
  IconShieldLock,
  IconTrash,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { AuthGuard } from "@/components/layout/auth-guard";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Switch } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { looksLikeRealId } from "@/lib/mock-api";
import {
  qk,
  useCurrentUser,
  useSubscriptions,
  useSwitchProfile,
  useUpdateUser,
} from "@/lib/mock-api/hooks";
import type { AgeRating, ViewerProfile } from "@/lib/mock-api/types";
import { cn } from "@/lib/utils";

const PROFILE_GRADIENTS: Array<[string, string]> = [
  ["#5B8DEF", "#243F80"],
  ["#38A8E0", "#175E85"],
  ["#34C77B", "#12694A"],
  ["#9B7BF0", "#5B3BB0"],
  ["#EC6AA8", "#9D2C6B"],
  ["#E5A83B", "#96661A"],
];

export default function SwitchProfilePage() {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: subscriptions = [] } = useSubscriptions();
  const queryClient = useQueryClient();
  const switchProfile = useSwitchProfile();
  const updateUser = useUpdateUser();
  const { toast } = useToast();

  const [isManaging, setIsManaging] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [editProfile, setEditProfile] = React.useState<ViewerProfile | null>(null);

  // Add profile form state
  const [newName, setNewName] = React.useState("");
  const [newIsKids, setNewIsKids] = React.useState(false);
  const [newGradientIdx, setNewGradientIdx] = React.useState(0);
  const [newPin, setNewPin] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // Edit profile form state
  const [editName, setEditName] = React.useState("");
  const [editIsKids, setEditIsKids] = React.useState(false);
  const [editPin, setEditPin] = React.useState("");
  const [editGradientIdx, setEditGradientIdx] = React.useState(0);

  // PIN challenge modal
  const [pinChallengeProfile, setPinChallengeProfile] = React.useState<ViewerProfile | null>(null);
  const [enteredPin, setEnteredPin] = React.useState("");
  const [pinError, setPinError] = React.useState("");

  if (!user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-fg-muted">Sign in to view and switch household profiles.</p>
          <Button variant="primary" href="/auth/login">
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  const isRealAccount = looksLikeRealId(user.id);
  const profiles = user.profiles || [];
  const hasFamilyPlan = subscriptions.some(
    (s) => s.status === "active" && (s.id.includes("family") || s.name.toLowerCase().includes("family")),
  );
  const canAddMore = profiles.length < 5;

  const handleAddProfileClick = () => {
    if (!hasFamilyPlan && profiles.length >= 1) {
      setUpgradeOpen(true);
      return;
    }
    setAddOpen(true);
    setNewName("");
    setNewIsKids(false);
    setNewPin("");
    setNewGradientIdx(profiles.length % PROFILE_GRADIENTS.length);
  };

  const handleSelectProfile = (profile: ViewerProfile) => {
    if (isManaging) {
      // In manage mode, clicking opens edit modal
      setEditProfile(profile);
      setEditName(profile.name);
      setEditIsKids(Boolean(profile.isKids || profile.kind === "child"));
      setEditPin(profile.pinCode || "");
      const gIdx = PROFILE_GRADIENTS.findIndex(
        (g) => g[0] === profile.avatarGradient?.[0],
      );
      setEditGradientIdx(gIdx >= 0 ? gIdx : 0);
      return;
    }

    // If profile has a PIN lock and isn't already active, prompt for PIN
    if (profile.pinCode && profile.id !== user.activeProfileId) {
      setPinChallengeProfile(profile);
      setEnteredPin("");
      setPinError("");
      return;
    }

    activateProfile(profile);
  };

  const activateProfile = async (profile: ViewerProfile) => {
    try {
      await switchProfile.mutateAsync(profile.id);
      toast({
        title: `Now watching as ${profile.name}`,
        description: profile.isKids || profile.kind === "child" ? "Kids mode active (PG / U content only)." : undefined,
      });
      router.push("/");
    } catch {
      toast({
        title: "Could not switch profile",
        tone: "error",
      });
    }
  };

  const handleVerifyPin = () => {
    if (!pinChallengeProfile) return;
    if (enteredPin === pinChallengeProfile.pinCode) {
      const p = pinChallengeProfile;
      setPinChallengeProfile(null);
      activateProfile(p);
    } else {
      setPinError("Incorrect PIN. Please try again.");
    }
  };

  const handleAddProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      toast({ title: "Profile name is required", tone: "warning" });
      return;
    }

    setSubmitting(true);
    const gradient = PROFILE_GRADIENTS[newGradientIdx] ?? PROFILE_GRADIENTS[0];

    if (isRealAccount) {
      try {
        const res = await fetch("/api/account/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            isKids: newIsKids,
            maturityRating: newIsKids ? "PG" : "18+",
            pinCode: newPin ? newPin.trim() : undefined,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create profile");
        }

        const created = (await res.json()) as { id: string };
        await queryClient.invalidateQueries({ queryKey: qk.user });
        toast({ title: "Profile created", description: `Added ${name} to your household.` });
        setAddOpen(false);
        setNewName("");
        setNewPin("");
        setNewIsKids(false);
        // Automatically switch to the newly created profile
        if (created.id) {
          await switchProfile.mutateAsync(created.id);
          router.push("/");
        }
      } catch (err) {
        toast({
          title: "Could not create profile",
          description: err instanceof Error ? err.message : "Something went wrong",
          tone: "error",
        });
      } finally {
        setSubmitting(false);
      }
    } else {
      const newProf: ViewerProfile = {
        id: `prof_${Date.now()}`,
        name,
        kind: newIsKids ? "child" : "adult",
        avatarGradient: gradient,
        maxAgeRating: newIsKids ? "PG" : "18",
        language: user.language || "English",
        pinCode: newPin ? newPin.trim() : null,
        isKids: newIsKids,
      };

      try {
        await updateUser.mutateAsync({ profiles: [...profiles, newProf] });
        await switchProfile.mutateAsync(newProf.id);
        toast({ title: "Profile created", description: `Added ${name} to your household.` });
        setAddOpen(false);
        setNewName("");
        setNewPin("");
        setNewIsKids(false);
        router.push("/");
      } catch {
        toast({ title: "Failed to create profile", tone: "error" });
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProfile) return;
    const name = editName.trim();
    if (!name) {
      toast({ title: "Profile name is required", tone: "warning" });
      return;
    }

    setSubmitting(true);
    const gradient = PROFILE_GRADIENTS[editGradientIdx] ?? PROFILE_GRADIENTS[0];

    if (isRealAccount) {
      try {
        const res = await fetch(`/api/account/profiles/${editProfile.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            isKids: editIsKids,
            maturityRating: editIsKids ? "PG" : "18+",
            pinCode: editPin ? editPin.trim() : null,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to update profile");
        }

        await queryClient.invalidateQueries({ queryKey: qk.user });
        toast({ title: "Profile updated" });
        setEditProfile(null);
      } catch (err) {
        toast({
          title: "Could not update profile",
          description: err instanceof Error ? err.message : "Something went wrong",
          tone: "error",
        });
      } finally {
        setSubmitting(false);
      }
    } else {
      const updated = profiles.map((p) => {
        if (p.id !== editProfile.id) return p;
        return {
          ...p,
          name,
          kind: editIsKids ? ("child" as const) : ("adult" as const),
          avatarGradient: gradient,
          maxAgeRating: (editIsKids ? "PG" : "18") as AgeRating,
          pinCode: editPin ? editPin.trim() : null,
          isKids: editIsKids,
        };
      });

      try {
        await updateUser.mutateAsync({ profiles: updated });
        toast({ title: "Profile updated" });
        setEditProfile(null);
      } catch {
        toast({ title: "Failed to update profile", tone: "error" });
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleDeleteProfile = async (profileId: string, name: string) => {
    if (!confirm(`Delete profile "${name}"? Viewing history and saved titles will be removed.`)) {
      return;
    }

    if (isRealAccount) {
      try {
        const res = await fetch(`/api/account/profiles/${profileId}`, { method: "DELETE" });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to delete profile");
        }
        await queryClient.invalidateQueries({ queryKey: qk.user });
        toast({ title: "Profile deleted" });
        setEditProfile(null);
      } catch (err) {
        toast({
          title: "Could not delete profile",
          description: err instanceof Error ? err.message : "Something went wrong",
          tone: "error",
        });
      }
    } else {
      const remaining = profiles.filter((p) => p.id !== profileId);
      await updateUser.mutateAsync({ profiles: remaining });
      toast({ title: "Profile deleted" });
      setEditProfile(null);
    }
  };

  return (
    <AuthGuard>
      <div className="flex min-h-[calc(100vh-theme(spacing.header)-theme(spacing.24))] flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-4xl text-center space-y-8 animate-in fade-in-50 duration-200">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-fg sm:text-4xl md:text-5xl">
              {isManaging ? "Manage Profiles" : "Who&apos;s watching?"}
            </h1>
            <p className="mt-2 text-sm text-fg-muted sm:text-base">
              {isManaging
                ? "Select a profile to edit its name, kids settings, or PIN."
                : "Choose a profile for personalized recommendations, watchlists, and history."}
            </p>
          </div>

          {/* Profiles Grid */}
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8 pt-4">
            {profiles.map((profile) => {
              const active = profile.id === user.activeProfileId;
              const isKids = Boolean(profile.isKids || profile.kind === "child");

              return (
                <div
                  key={profile.id}
                  className="group relative flex flex-col items-center"
                >
                  <button
                    type="button"
                    onClick={() => handleSelectProfile(profile)}
                    className={cn(
                      "group/btn relative flex size-28 sm:size-32 md:size-36 flex-col items-center justify-center rounded-2xl p-1 transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      active && !isManaging && "ring-2 ring-accent ring-offset-4 ring-offset-bg",
                      "hover:scale-105 active:scale-95",
                    )}
                  >
                    <Avatar
                      name={profile.name}
                      gradient={profile.avatarGradient}
                      src={profile.avatarUrl}
                      size="xl"
                      className="size-full rounded-2xl shadow-lg ring-1 ring-white/10 transition-shadow group-hover/btn:shadow-accent/25"
                    />

                    {/* Manage mode overlay with pencil */}
                    {isManaging && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 backdrop-blur-xs transition-colors group-hover/btn:bg-black/40">
                        <div className="flex size-10 items-center justify-center rounded-full bg-white/20 text-white shadow-md">
                          <IconPencil className="size-5" />
                        </div>
                      </div>
                    )}

                    {/* Badges on Avatar */}
                    <div className="pointer-events-none absolute -top-1.5 -right-1.5 flex items-center gap-1">
                      {profile.pinCode && (
                        <span
                          title="PIN Protected"
                          className="flex size-6 items-center justify-center rounded-full bg-surface-3 text-fg border border-border shadow-sm"
                        >
                          <IconLock className="size-3" />
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Profile Name & Badges */}
                  <div className="mt-3 flex flex-col items-center gap-1 text-center">
                    <span className="max-w-[130px] truncate text-sm sm:text-base font-medium text-fg group-hover:text-accent transition-colors">
                      {profile.name}
                    </span>
                    <div className="flex items-center gap-1">
                      {isKids ? (
                        <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-3xs font-bold uppercase tracking-wider text-accent border border-accent/30">
                          Kids
                        </span>
                      ) : null}
                      {active && !isManaging ? (
                        <span className="inline-flex items-center gap-0.5 text-2xs text-accent font-medium">
                          <IconCheck className="size-3" />
                          Current
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Add Profile Tile */}
            {canAddMore && (
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={handleAddProfileClick}
                  className="group/add flex size-28 sm:size-32 md:size-36 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-surface-2/40 text-fg-subtle transition-all duration-200 hover:border-accent hover:bg-surface-2 hover:text-fg hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {!hasFamilyPlan && profiles.length >= 1 ? (
                    <IconCrown className="size-8 sm:size-10 stroke-[1.5] text-accent group-hover/add:scale-110 transition-transform" />
                  ) : (
                    <IconPlus className="size-8 sm:size-10 stroke-[1.5]" />
                  )}
                </button>
                <div className="mt-3 flex flex-col items-center gap-1 text-center">
                  <span className="text-sm sm:text-base font-medium text-fg-muted">
                    Add Profile
                  </span>
                  {!hasFamilyPlan && profiles.length >= 1 ? (
                    <Badge tone="pending" size="sm">
                      Family Plan Required
                    </Badge>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Action Controls */}
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              variant={isManaging ? "primary" : "secondary"}
              size="lg"
              onClick={() => setIsManaging(!isManaging)}
              className="px-6 font-semibold"
            >
              {isManaging ? "Done" : "Manage Profiles"}
            </Button>

            {!isManaging && (
              <Button
                variant="ghost"
                size="lg"
                href="/"
                className="text-fg-muted hover:text-fg"
              >
                Skip to Home
              </Button>
            )}
          </div>

          <p className="text-xs text-fg-subtle">
            Family Plan allows up to 5 individual viewer profiles with independent ratings, history, and watchlists.
          </p>
        </div>

        {/* PIN Challenge Modal */}
        <Modal
          open={Boolean(pinChallengeProfile)}
          onClose={() => setPinChallengeProfile(null)}
          title={`Enter PIN for ${pinChallengeProfile?.name ?? "Profile"}`}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-3">
              <Avatar
                name={pinChallengeProfile?.name ?? ""}
                gradient={pinChallengeProfile?.avatarGradient}
                size="md"
              />
              <div>
                <p className="font-semibold text-fg">{pinChallengeProfile?.name}</p>
                <p className="text-xs text-fg-muted">This profile is protected with a 4-digit PIN.</p>
              </div>
            </div>

            <Field label="4-Digit PIN" htmlFor="pin-input" error={pinError}>
              <Input
                id="pin-input"
                type="password"
                maxLength={4}
                autoFocus
                placeholder="••••"
                value={enteredPin}
                onChange={(e) => {
                  setEnteredPin(e.target.value.replace(/\D/g, ""));
                  setPinError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleVerifyPin();
                }}
              />
            </Field>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setPinChallengeProfile(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleVerifyPin}>
                Unlock Profile
              </Button>
            </div>
          </div>
        </Modal>

        {/* Add Profile Modal */}
        <Modal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          title="Add Profile"
        >
          <form onSubmit={handleAddProfile} className="space-y-5">
            <p className="text-sm text-fg-muted">
              Add a profile for another family member to personalize what they watch.
            </p>

            {/* Avatar Color Picker */}
            <div>
              <label className="text-sm font-medium text-fg block mb-2">Choose Avatar Color</label>
              <div className="flex items-center gap-2.5">
                {PROFILE_GRADIENTS.map((g, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setNewGradientIdx(idx)}
                    style={{ background: `linear-gradient(135deg, ${g[0]}, ${g[1]})` }}
                    className={cn(
                      "size-10 rounded-full transition-transform",
                      newGradientIdx === idx ? "ring-2 ring-accent ring-offset-2 ring-offset-surface-1 scale-110" : "hover:scale-105 opacity-80 hover:opacity-100",
                    )}
                  />
                ))}
              </div>
            </div>

            <Field label="Profile Name" htmlFor="new-name" required>
              <Input
                id="new-name"
                placeholder="e.g. Maya, Grandma, Movie Night"
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={30}
              />
            </Field>

            {/* Kids Toggle */}
            <div className="rounded-lg border border-border bg-surface-2 p-3.5 space-y-1">
              <Switch
                checked={newIsKids}
                onCheckedChange={setNewIsKids}
                label="Kid's Profile?"
              />
              <p className="text-xs text-fg-muted pl-8">
                Limits content to age ratings U and PG (ages 12 and under). Mature titles and adult commerce are hidden.
              </p>
            </div>

            {/* Optional PIN */}
            <Field label="Parental PIN (Optional)" htmlFor="new-pin" hint="4 digits. Locks profile switching.">
              <Input
                id="new-pin"
                type="password"
                maxLength={4}
                placeholder="Leave blank for no PIN"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
              />
            </Field>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button variant="ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={submitting}>
                Save Profile
              </Button>
            </div>
          </form>
        </Modal>

        {/* Edit Profile Modal */}
        <Modal
          open={Boolean(editProfile)}
          onClose={() => setEditProfile(null)}
          title={`Edit ${editProfile?.name ?? "Profile"}`}
        >
          <form onSubmit={handleSaveEdit} className="space-y-5">
            {/* Avatar Color Picker */}
            <div>
              <label className="text-sm font-medium text-fg block mb-2">Avatar Color</label>
              <div className="flex items-center gap-2.5">
                {PROFILE_GRADIENTS.map((g, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setEditGradientIdx(idx)}
                    style={{ background: `linear-gradient(135deg, ${g[0]}, ${g[1]})` }}
                    className={cn(
                      "size-10 rounded-full transition-transform",
                      editGradientIdx === idx ? "ring-2 ring-accent ring-offset-2 ring-offset-surface-1 scale-110" : "hover:scale-105 opacity-80 hover:opacity-100",
                    )}
                  />
                ))}
              </div>
            </div>

            <Field label="Profile Name" htmlFor="edit-name" required>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={30}
              />
            </Field>

            {/* Kids Toggle */}
            <div className="rounded-lg border border-border bg-surface-2 p-3.5 space-y-1">
              <Switch
                checked={editIsKids}
                onCheckedChange={setEditIsKids}
                label="Kid's Profile?"
              />
              <p className="text-xs text-fg-muted pl-8">
                Limits content to age ratings U and PG (ages 12 and under).
              </p>
            </div>

            {/* Optional PIN */}
            <Field label="Parental PIN" htmlFor="edit-pin" hint="4 digits. Clear to remove PIN lock.">
              <Input
                id="edit-pin"
                type="password"
                maxLength={4}
                placeholder="No PIN set"
                value={editPin}
                onChange={(e) => setEditPin(e.target.value.replace(/\D/g, ""))}
              />
            </Field>

            <div className="flex items-center justify-between pt-3 border-t border-border">
              {profiles.length > 1 && editProfile?.id !== user.activeProfileId ? (
                <Button
                  variant="ghost"
                  type="button"
                  className="text-danger hover:bg-danger/10"
                  onClick={() => editProfile && handleDeleteProfile(editProfile.id, editProfile.name)}
                >
                  <IconTrash className="size-4" />
                  Delete
                </Button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <Button variant="ghost" type="button" onClick={() => setEditProfile(null)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" loading={submitting}>
                  Save Changes
                </Button>
              </div>
            </div>
          </form>
        </Modal>

        {/* Upgrade to Family Plan Modal */}
        <Modal
          open={upgradeOpen}
          onClose={() => setUpgradeOpen(false)}
          title="Nexus Family Plan Required"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-accent/30 bg-accent/10 p-4">
              <IconCrown className="mt-0.5 size-6 shrink-0 text-accent" />
              <div>
                <p className="font-semibold text-fg">Multi-Profile Household Switching</p>
                <p className="mt-1 text-sm text-fg-muted leading-relaxed">
                  Adding additional household profiles (up to 5 individual viewer profiles with independent age ratings, Kids Mode, and PIN controls) is exclusive to the <strong>Nexus Family Plan (£14.99/mo)</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setUpgradeOpen(false)}>
                Maybe Later
              </Button>
              <Button variant="primary" href="/plans">
                Upgrade to Family Plan — £14.99/mo
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AuthGuard>
  );
}
