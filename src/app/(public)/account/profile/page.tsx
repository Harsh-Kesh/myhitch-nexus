"use client";

import {
  IconCheck,
  IconCrown,
  IconLock,
  IconPencil,
  IconPlus,
  IconTrash,
  IconUserPlus,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
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
import { cn, formatCurrency, formatDate } from "@/lib/utils";

const GRADIENTS: Array<[string, string]> = [
  ["#5B8DEF", "#243F80"],
  ["#38A8E0", "#175E85"],
  ["#34C77B", "#12694A"],
  ["#9B7BF0", "#5B3BB0"],
  ["#EC6AA8", "#9D2C6B"],
  ["#E5A83B", "#96661A"],
];

export default function ProfilePage() {
  const { data: user } = useCurrentUser();
  const { data: subscriptions = [] } = useSubscriptions();
  const queryClient = useQueryClient();
  const updateUser = useUpdateUser();
  const switchProfile = useSwitchProfile();
  const { toast } = useToast();

  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  const [addOpen, setAddOpen] = React.useState(false);
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newKind, setNewKind] = React.useState<ViewerProfile["kind"]>("adult");
  const [newRating, setNewRating] = React.useState<AgeRating>("18");
  const [newGradient, setNewGradient] = React.useState(0);
  const [newPin, setNewPin] = React.useState("");
  const [submittingProfile, setSubmittingProfile] = React.useState(false);
  const [actionProfileId, setActionProfileId] = React.useState<string | null>(null);

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [handle, setHandle] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [language, setLanguage] = React.useState("");

  React.useEffect(() => {
    if (!user) return;
    setName(user.name);
    setEmail(user.email);
    setHandle(user.handle);
    setCountry(user.country);
    setLanguage(user.language);
  }, [user]);

  if (!user) return null;

  const isRealAccount = looksLikeRealId(user.id);
  const hasFamilyPlan = subscriptions.some(
    (s) => s.status === "active" && (s.id.includes("family") || s.name.toLowerCase().includes("family")),
  );

  const activePlanInfo = React.useMemo(() => {
    const activeSub = subscriptions.find((s) => s.status === "active");
    if (activeSub) {
      return {
        name: activeSub.name,
        interval: activeSub.interval,
        amount: activeSub.price.amount,
        currency: activeSub.price.currency,
        renewsAt: activeSub.renewsAt,
        benefits: activeSub.benefits,
        isFree: false,
      };
    }

    if (user.roles.includes("creator") || user.activeRole === "creator") {
      return {
        name: "Nexus Creator Plan",
        interval: "monthly" as const,
        amount: 0,
        currency: "GBP",
        renewsAt: null,
        benefits: [
          "Creator Studio Access",
          "Video & Audio Asset Uploads",
          "MYHitch Pass PPV & Ticketed Live Streaming",
          "MYHitch Connect Brand Sponsorship Deals",
          "Fan Super Thanks Tipping & Ad Revenue Share",
        ],
        isFree: false,
      };
    }

    if (user.roles.includes("business") || user.activeRole === "business") {
      return {
        name: "Nexus Business Plan",
        interval: "monthly" as const,
        amount: 2900,
        currency: "GBP",
        renewsAt: null,
        benefits: [
          "Business Channel & Product Link Embedding",
          "Customer Lead Generation Forms",
          "Team Access & Role Management",
          "Pre-roll & Mid-roll Ad Campaign Manager",
        ],
        isFree: false,
      };
    }

    if (user.roles.includes("enterprise") || user.roles.includes("producer") || user.activeRole === "enterprise") {
      return {
        name: "Nexus Enterprise Plan",
        interval: "annual" as const,
        amount: 0,
        currency: "GBP",
        renewsAt: null,
        benefits: [
          "Bulk CSV/XML Catalog Metadata Import",
          "Client Review Links with Dynamic Watermarks",
          "High-Capacity Secure File Transfers",
          "Developer API Keys & Dedicated Support",
        ],
        isFree: false,
      };
    }

    return {
      name: "Nexus Free Tier",
      interval: null,
      amount: 0,
      currency: "GBP",
      renewsAt: null,
      benefits: [
        "Ad-Supported Catalog Access",
        "Standard Quality Playback",
        "1 Viewer Profile (Upgrade to Family for up to 5)",
      ],
      isFree: true,
    };
  }, [subscriptions, user]);

  const handleAddProfileClick = () => {
    if (!hasFamilyPlan && user.profiles.length >= 1) {
      setUpgradeOpen(true);
      return;
    }
    setAddOpen(true);
  };

  const saveProfile = () => {
    updateUser.mutate(
      { name, email, handle, country, language },
      {
        onSuccess: () => toast({ title: "Account updated" }),
        onError: (error) =>
          toast({
            title: "Couldn't update account",
            description: error instanceof Error ? error.message : undefined,
            tone: "error",
          }),
      },
    );
  };

  const addProfile = async () => {
    const profileName = newName.trim() || "New profile";
    setSubmittingProfile(true);

    if (isRealAccount) {
      try {
        const ratingMap: Record<AgeRating, "ALL" | "PG" | "TEEN" | "18+"> = {
          U: "ALL",
          PG: "PG",
          "12": "TEEN",
          "15": "TEEN",
          "18": "18+",
        };

        const res = await fetch("/api/account/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: profileName,
            isKids: newKind === "child",
            maturityRating: ratingMap[newRating] || "ALL",
            pinCode: newPin ? newPin.trim() : undefined,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create profile");
        }

        await queryClient.invalidateQueries({ queryKey: qk.user });
        toast({
          title: "Profile added",
          description: `${profileName} can now watch on this account.`,
        });
        setAddOpen(false);
        setNewName("");
        setNewPin("");
      } catch (err: unknown) {
        const description = err instanceof Error ? err.message : "Unknown error";
        toast({
          tone: "error",
          title: "Could not add profile",
          description,
        });
      } finally {
        setSubmittingProfile(false);
      }
    } else {
      const profile: ViewerProfile = {
        id: `prof_${Date.now()}`,
        name: profileName,
        kind: newKind,
        avatarGradient: GRADIENTS[newGradient],
        maxAgeRating: newRating,
        language: user.language,
      };
      updateUser.mutate({ profiles: [...user.profiles, profile] });
      setAddOpen(false);
      setNewName("");
      setNewPin("");
      setSubmittingProfile(false);
      toast({
        title: "Profile added",
        description: `${profile.name} can now watch on this account.`,
      });
    }
  };

  const deleteProfile = async (profileId: string, profileName: string) => {
    if (!confirm(`Are you sure you want to delete profile "${profileName}"?`)) return;
    setActionProfileId(profileId);

    if (isRealAccount) {
      try {
        const res = await fetch(`/api/account/profiles/${profileId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to delete profile");
        }
        await queryClient.invalidateQueries({ queryKey: qk.user });
        toast({
          title: "Profile deleted",
          description: `${profileName} has been removed.`,
        });
      } catch (err: unknown) {
        const description = err instanceof Error ? err.message : "Unknown error";
        toast({
          tone: "error",
          title: "Could not delete profile",
          description,
        });
      } finally {
        setActionProfileId(null);
      }
    } else {
      const remaining = user.profiles.filter((p) => p.id !== profileId);
      updateUser.mutate({ profiles: remaining });
      setActionProfileId(null);
      toast({
        title: "Profile deleted",
        description: `${profileName} has been removed.`,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Profile switcher — Exclusively for Family Plan subscribers */}
      {hasFamilyPlan ? (
        <Card>
          <CardHeader
            title="Viewer profiles"
            description="Up to five profiles share this account (Family Tier). Each keeps its own watchlist, history, parental ratings and recommendations."
            action={
              <div className="flex items-center gap-3">
                <Badge tone={user.profiles.length >= 5 ? "warning" : "neutral"} size="sm">
                  {user.profiles.length} of 5 Profiles Used
                </Badge>
                {user.profiles.length < 5 && (
                  <Button variant="secondary" size="sm" onClick={handleAddProfileClick}>
                    <IconUserPlus />
                    Add profile
                  </Button>
                )}
              </div>
            }
          />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {user.profiles.map((profile) => {
                const active = profile.id === user.activeProfileId;
                const canDelete = user.profiles.length > 1 && !active;
                return (
                  <div
                    key={profile.id}
                    className={cn(
                      "relative flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors",
                      active
                        ? "border-accent bg-accent/[0.07]"
                        : "border-border bg-surface-2 hover:border-border-strong",
                    )}
                  >
                    {canDelete && (
                      <button
                        type="button"
                        aria-label={`Delete ${profile.name}`}
                        disabled={actionProfileId === profile.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteProfile(profile.id, profile.name);
                        }}
                        className="absolute right-2 top-2 rounded p-1 text-fg-subtle transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <IconTrash className="size-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        switchProfile.mutate(profile.id);
                        toast({ title: `Now viewing as ${profile.name}` });
                      }}
                      className="flex flex-col items-center gap-2 w-full"
                    >
                      <Avatar
                        name={profile.name}
                        gradient={profile.avatarGradient}
                        src={profile.avatarUrl}
                        size="xl"
                      />
                      <span className="text-sm font-medium text-fg">{profile.name}</span>
                      <span className="flex items-center gap-1.5">
                        <Badge tone={profile.kind === "adult" ? "neutral" : "info"} size="sm">
                          {profile.kind}
                        </Badge>
                        <Badge tone="outline" size="sm">
                          {profile.maxAgeRating}
                        </Badge>
                      </span>
                      {active ? (
                        <Badge tone="accent" size="sm">
                          <IconCheck />
                          Active
                        </Badge>
                      ) : null}
                    </button>
                  </div>
                );
              })}

              {user.profiles.length < 5 ? (
                <button
                  type="button"
                  onClick={handleAddProfileClick}
                  className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 text-fg-subtle transition-colors hover:border-border-strong hover:text-fg"
                >
                  <span className="flex size-20 items-center justify-center rounded bg-surface-2">
                    <IconPlus className="size-6" />
                  </span>
                  <span className="text-sm font-medium">Add profile</span>
                </button>
              ) : null}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {/* Account details */}
      <Card>
        <CardHeader
          title="Account details"
          description="These apply across every profile on the account."
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              aria-label="Upload profile photo"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                updateUser.mutate(
                  { avatarUrl: URL.createObjectURL(file) },
                  { onSuccess: () => toast({ title: "Avatar updated" }) },
                );
                event.target.value = "";
              }}
            />
            <Avatar
              name={user.name}
              gradient={user.avatarGradient}
              src={user.avatarUrl}
              size="xl"
            />
            <div>
              <p className="text-sm font-medium text-fg">Account avatar</p>
              {isRealAccount ? (
                <p className="mt-0.5 text-xs text-fg-muted">
                  Avatar uploads arrive with the media pipeline — your colours are
                  generated for now.
                </p>
              ) : (
                <>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    Shown on your comments and channel.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-2"
                    loading={updateUser.isPending}
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <IconPencil />
                    Change
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="acct-name">
              <Input
                id="acct-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="Handle" htmlFor="acct-handle" hint="Shown on your comments and channel.">
              <Input
                id="acct-handle"
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                leading={<span className="text-sm">@</span>}
              />
            </Field>
            <Field
              label="Email address"
              htmlFor="acct-email"
              aside={
                user.emailVerified ? (
                  <Badge tone="published" size="sm">
                    Verified
                  </Badge>
                ) : (
                  <Badge tone="pending" size="sm">
                    Unverified
                  </Badge>
                )
              }
            >
              <Input
                id="acct-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field label="Country" htmlFor="acct-country">
              {/* Matches auth/register's own COUNTRIES list — a real account can be
                  registered with any of these. */}
              <Select
                id="acct-country"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
              >
                {["GB", "IE", "DE", "FR", "PT", "ES", "US", "CA", "AU", "LK", "IN", "NL"].map(
                  (code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ),
                )}
              </Select>
            </Field>
            <Field label="Language" htmlFor="acct-language">
              {/* Matches auth/register's own LANGUAGES list, for the same reason. */}
              <Select
                id="acct-language"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                {[
                  "English",
                  "German",
                  "French",
                  "Spanish",
                  "Portuguese",
                  "Welsh",
                  "Polish",
                  "Urdu",
                  "Sinhala",
                  "Tamil",
                  "Arabic",
                ].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" onClick={() => {
              setName(user.name);
              setEmail(user.email);
              setHandle(user.handle);
              setCountry(user.country);
              setLanguage(user.language);
            }}>
              Reset
            </Button>
            <Button variant="primary" loading={updateUser.isPending} onClick={saveProfile}>
              Save changes
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Active Subscription Plan */}
      <Card className="border-accent/30 bg-accent/5">
        <CardHeader
          title={
            <div className="flex flex-wrap items-center gap-2">
              <IconCrown className="size-5 text-accent" />
              <span>Active Subscription Plan</span>
              <Badge tone={activePlanInfo.isFree ? "outline" : "published"} size="sm">
                {activePlanInfo.name}
              </Badge>
            </div>
          }
          description={
            activePlanInfo.isFree
              ? "You are currently watching on the free ad-supported tier. Upgrade to unlock ad-free streaming, 4K HDR, and Family multi-profile switching."
              : activePlanInfo.renewsAt
                ? `Billed ${activePlanInfo.interval} at ${formatCurrency(activePlanInfo.amount, activePlanInfo.currency)} — renews ${formatDate(activePlanInfo.renewsAt, "long")}`
                : `Active plan included with your ${activePlanInfo.name} tier.`
          }
          action={
            <Button variant="primary" size="sm" href="/plans">
              {activePlanInfo.isFree ? "Upgrade Plan" : "Manage Plan"}
            </Button>
          }
        />
        <CardBody className="border-t border-border/50 pt-4">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-fg-muted">
            {activePlanInfo.benefits.map((b) => (
              <li key={b} className="flex items-center gap-1.5">
                <IconCheck className="size-3.5 text-success" />
                {b}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-fg-subtle nx-tnum">
            Member since {formatDate(user.createdAt, "long")}
          </p>
        </CardBody>
      </Card>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a viewer profile"
        description="Profiles keep watch history and recommendations separate."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={submittingProfile} onClick={addProfile}>
              Add profile
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Profile name" htmlFor="new-profile-name" required>
            <Input
              id="new-profile-name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Immy"
            />
          </Field>

          <Field label="Profile type" htmlFor="new-profile-kind">
            <Select
              id="new-profile-kind"
              value={newKind}
              onChange={(event) => {
                const kind = event.target.value as ViewerProfile["kind"];
                setNewKind(kind);
                setNewRating(kind === "child" ? "U" : kind === "teen" ? "12" : "18");
              }}
            >
              <option value="adult">Adult</option>
              <option value="teen">Teen</option>
              <option value="child">Child</option>
            </Select>
          </Field>

          <Field
            label="Maximum age rating"
            htmlFor="new-profile-rating"
            hint="Titles above this rating are hidden from this profile."
          >
            <Select
              id="new-profile-rating"
              value={newRating}
              onChange={(event) => setNewRating(event.target.value as AgeRating)}
            >
              {(["U", "PG", "12", "15", "18"] as AgeRating[]).map((rating) => (
                <option key={rating} value={rating}>
                  {rating}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Parental PIN (optional)"
            htmlFor="new-profile-pin"
            hint="Require a 4-digit PIN for parental controls."
          >
            <Input
              id="new-profile-pin"
              type="password"
              maxLength={4}
              value={newPin}
              onChange={(event) => setNewPin(event.target.value.replace(/\D/g, ""))}
              placeholder="1234"
            />
          </Field>

          <Field label="Avatar colour">
            <div className="flex flex-wrap gap-2">
              {GRADIENTS.map((gradient, index) => (
                <button
                  key={gradient[0]}
                  type="button"
                  aria-label={`Colour option ${index + 1}`}
                  onClick={() => setNewGradient(index)}
                  className={cn(
                    "size-10 rounded ring-2 transition-all",
                    newGradient === index ? "ring-accent" : "ring-transparent",
                  )}
                  style={{
                    backgroundImage: `linear-gradient(140deg, ${gradient[0]}, ${gradient[1]})`,
                  }}
                />
              ))}
            </div>
          </Field>

          {newKind !== "adult" ? (
            <p className="flex items-start gap-2 rounded border border-info/30 bg-info/10 p-3 text-xs leading-relaxed text-fg-muted">
              <IconLock className="mt-0.5 size-4 shrink-0 text-info" />
              Restricted profiles cannot change their own age limit, buy content,
              or access the Studio and Admin workspaces.
            </p>
          ) : null}
        </div>
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
  );
}
