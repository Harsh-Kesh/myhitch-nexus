"use client";

import {
  IconCheck,
  IconLock,
  IconPencil,
  IconPlus,
  IconUserPlus,
} from "@tabler/icons-react";
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
  useCurrentUser,
  useSwitchProfile,
  useUpdateUser,
} from "@/lib/mock-api/hooks";
import type { AgeRating, ViewerProfile } from "@/lib/mock-api/types";
import { cn, formatDate } from "@/lib/utils";

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
  const updateUser = useUpdateUser();
  const switchProfile = useSwitchProfile();
  const { toast } = useToast();

  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  const [addOpen, setAddOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newKind, setNewKind] = React.useState<ViewerProfile["kind"]>("adult");
  const [newRating, setNewRating] = React.useState<AgeRating>("18");
  const [newGradient, setNewGradient] = React.useState(0);

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

  const addProfile = () => {
    const profile: ViewerProfile = {
      id: `prof_${Date.now()}`,
      name: newName.trim() || "New profile",
      kind: newKind,
      avatarGradient: GRADIENTS[newGradient],
      maxAgeRating: newRating,
      language: user.language,
    };
    updateUser.mutate({ profiles: [...user.profiles, profile] });
    setAddOpen(false);
    setNewName("");
    toast({ title: "Profile added", description: `${profile.name} can now watch on this account.` });
  };

  return (
    <div className="space-y-6">
      {/* Profile switcher */}
      <Card>
        <CardHeader
          title="Viewer profiles"
          description="Up to five profiles share this account. Each keeps its own watchlist, history and recommendations."
          action={
            <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
              <IconUserPlus />
              Add profile
            </Button>
          }
        />
        <CardBody>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {user.profiles.map((profile) => {
              const active = profile.id === user.activeProfileId;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => {
                    switchProfile.mutate(profile.id);
                    toast({ title: `Now viewing as ${profile.name}` });
                  }}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors",
                    active
                      ? "border-accent bg-accent/[0.07]"
                      : "border-border bg-surface-2 hover:border-border-strong",
                  )}
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
              );
            })}

            {user.profiles.length < 5 ? (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
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

      {/* Roles */}
      <Card>
        <CardHeader
          title="Roles on this account"
          description="Roles unlock workspaces. Business, advertiser and organisation roles require verification."
        />
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {user.roles.map((role) => (
              <Badge key={role} tone="accent">
                {role}
              </Badge>
            ))}
          </div>
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
            <Button variant="primary" onClick={addProfile}>
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
    </div>
  );
}
