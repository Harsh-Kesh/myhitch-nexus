"use client";

import { IconCheck, IconExternalLink, IconPencil, IconUserPlus } from "@tabler/icons-react";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { MultiSelect } from "@/components/ui/multi-select";
import { useToast } from "@/components/ui/toast";
import { Poster } from "@/components/video/poster";
import { looksLikeRealId } from "@/lib/mock-api";
import { CHANNEL_KIND_LABELS } from "@/lib/mock-api/data/channels";
import { useChannel, useCurrentUser, useUpdateChannel } from "@/lib/mock-api/hooks";
import { compactNumber, formatDate } from "@/lib/utils";

const LANGUAGES = [
  "English", "Welsh", "German", "French", "Spanish", "Portuguese", "Polish", "Urdu", "Sinhala", "Tamil",
].map((value) => ({ value, label: value }));

export default function ChannelSettingsPage() {
  const { data: user } = useCurrentUser();
  const channelId = user?.channelId ?? "ch_mara";
  const isRealChannel = looksLikeRealId(channelId);
  const { data: channel } = useChannel(channelId);
  const updateChannel = useUpdateChannel(channelId);
  const { toast } = useToast();

  const bannerInputRef = React.useRef<HTMLInputElement>(null);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  const pickImage = (
    event: React.ChangeEvent<HTMLInputElement>,
    field: "bannerUrl" | "avatarUrl",
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    updateChannel.mutate(
      { [field]: URL.createObjectURL(file) },
      {
        onSuccess: () =>
          toast({ title: field === "bannerUrl" ? "Banner updated" : "Avatar updated" }),
      },
    );
    event.target.value = "";
  };

  const [name, setName] = React.useState("");
  const [handle, setHandle] = React.useState("");
  const [tagline, setTagline] = React.useState("");
  const [about, setAbout] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  const [languages, setLanguages] = React.useState<string[]>([]);
  const [country, setCountry] = React.useState("GB");

  const [adsEnabled, setAdsEnabled] = React.useState(true);
  const [commentsEnabled, setCommentsEnabled] = React.useState(true);

  // Collaborator & Team seat management state
  const [inviteModalOpen, setInviteModalOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState("Co-Host");
  const [teamMembers, setTeamMembers] = React.useState<
    Array<{ id: string; name: string; email: string; role: string; status: string; inviteLink?: string }>
  >([
    { id: "tm_1", name: "Mara Silva", email: "mara@nexus.com", role: "Channel Manager", status: "Active" },
  ]);

  const resetFromChannel = React.useCallback(() => {
    if (!channel) return;
    setName(channel.name);
    setHandle(channel.handle);
    setTagline(channel.tagline);
    setAbout(channel.about);
    setContactEmail(channel.contactEmail);
    setLanguages(channel.languages);
    setCountry(channel.country);
  }, [channel]);

  React.useEffect(resetFromChannel, [resetFromChannel]);

  if (!channel) return null;

  const saveProfile = () => {
    updateChannel.mutate(
      { name, handle, tagline, about, contactEmail, languages, country },
      {
        onSuccess: () => toast({ title: "Channel settings saved" }),
        onError: (error) =>
          toast({
            title: "Couldn't save channel settings",
            description: error instanceof Error ? error.message : undefined,
            tone: "error",
          }),
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Channel settings"
        description="Branding, contact details and channel-level policies."
        actions={
          <Button variant="secondary" href={`/channel/${channel.id}`}>
            <IconExternalLink />
            View public page
          </Button>
        }
      />

      <PageBody className="space-y-6">
        {!isRealChannel ? (
          <Card className="border-warning/30 bg-warning/5">
            <CardBody>
              <p className="text-sm font-medium text-fg">This account has no real channel</p>
              <p className="mt-1 text-sm text-fg-muted">
                You&rsquo;re signed in to the shared demo account, which has no channel of its
                own — edits below will show a success toast but reset the next time this
                page loads, since there&rsquo;s nowhere real to save them. Register a
                creator/business account to get a real channel that saves for good.
              </p>
            </CardBody>
          </Card>
        ) : null}

        {/* Branding */}
        <Card>
          <CardHeader
            title="Branding"
            description="Update the banner and avatar shown on your public channel page."
          />
          <CardBody className="space-y-4">
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/*"
              aria-label="Upload channel banner"
              className="hidden"
              onChange={(event) => pickImage(event, "bannerUrl")}
            />
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              aria-label="Upload channel avatar"
              className="hidden"
              onChange={(event) => pickImage(event, "avatarUrl")}
            />
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="relative">
                <Poster
                  src={channel.bannerUrl}
                  alt={channel.name}
                  gradient={channel.bannerGradient}
                  seed={`${channel.id}-banner`}
                  ratio="banner"
                />
                {!isRealChannel && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute right-3 top-3"
                    loading={updateChannel.isPending}
                    onClick={() => bannerInputRef.current?.click()}
                  >
                    <IconPencil />
                    Change banner
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 bg-surface-2 p-4">
                <Avatar
                  name={channel.name}
                  gradient={channel.avatarGradient}
                  src={channel.avatarUrl}
                  size="xl"
                  square
                  verified={channel.verified}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-fg">{channel.name}</p>
                  <p className="text-xs text-fg-muted nx-tnum">
                    @{channel.handle} · {compactNumber(channel.followers)} followers
                  </p>
                  {isRealChannel ? (
                    <p className="mt-2 text-2xs text-fg-subtle">
                      Avatar and banner uploads arrive with the media pipeline — this
                      channel&rsquo;s colours are generated for now.
                    </p>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-2"
                      loading={updateChannel.isPending}
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      <IconPencil />
                      Change avatar
                    </Button>
                  )}
                </div>
                <Badge tone="accent" size="sm">
                  {CHANNEL_KIND_LABELS[channel.kind]}
                </Badge>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Channel name" htmlFor="ch-name">
                <Input
                  id="ch-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field label="Handle" htmlFor="ch-handle">
                <Input
                  id="ch-handle"
                  value={handle}
                  onChange={(event) => setHandle(event.target.value)}
                  leading={<span className="text-sm">@</span>}
                />
              </Field>
            </div>

            <Field label="Tagline" htmlFor="ch-tagline" aside={`${tagline.length}/80`}>
              <Input
                id="ch-tagline"
                value={tagline}
                maxLength={80}
                onChange={(event) => setTagline(event.target.value)}
              />
            </Field>

            <Field label="About" htmlFor="ch-about" aside={`${about.length}/1000`}>
              <Textarea
                id="ch-about"
                value={about}
                maxLength={1000}
                rows={5}
                onChange={(event) => setAbout(event.target.value)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Contact email" htmlFor="ch-email">
                <Input
                  id="ch-email"
                  type="email"
                  value={contactEmail}
                  onChange={(event) => setContactEmail(event.target.value)}
                />
              </Field>
              <Field label="Country" htmlFor="ch-country">
                <Select
                  id="ch-country"
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                >
                  {/* Matches auth/register's own COUNTRIES list — a real account can be
                      registered with any of these, so this dropdown needs to offer them
                      all too, not just the subset the mock demo channels happened to use. */}
                  {["GB", "IE", "DE", "FR", "PT", "ES", "US", "CA", "AU", "LK", "IN", "NL"].map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Languages">
              <MultiSelect
                options={LANGUAGES}
                value={languages}
                onChange={setLanguages}
                placeholder="Select languages"
              />
            </Field>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="ghost" onClick={resetFromChannel}>
                Reset
              </Button>
              <Button variant="primary" loading={updateChannel.isPending} onClick={saveProfile}>
                Save changes
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Team & Collaborators */}
        <Card>
          <CardHeader
            title="Channel Team & Collaborators"
            description="Invite co-creators, video editors, producers, and managers to collaborate on your channel."
            action={
              <Button variant="secondary" size="sm" onClick={() => setInviteModalOpen(true)}>
                <IconUserPlus className="size-4" />
                Invite collaborator
              </Button>
            }
          />
          <CardBody className="space-y-4">
            {teamMembers.length === 0 ? (
              <p className="text-xs text-fg-muted">No co-creators or team members invited yet.</p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border">
                {teamMembers.map((member) => (
                  <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={member.name} size="md" />
                      <div>
                        <p className="text-sm font-medium text-fg">{member.name}</p>
                        <p className="text-2xs text-fg-muted">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral" size="sm">{member.role}</Badge>
                      <Badge tone={member.status === "Active" ? "published" : "pending"} size="sm">{member.status}</Badge>
                      {member.inviteLink ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard?.writeText(member.inviteLink!).catch(() => {});
                            toast({ title: "Invite link copied", description: member.inviteLink });
                          }}
                        >
                          Copy Link
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setTeamMembers((prev) => prev.filter((m) => m.id !== member.id));
                          toast({ title: "Collaborator removed" });
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Verification */}
        <Card>
          <CardHeader
            title="Verification"
            description="Verified channels get a badge and access to advanced monetisation."
          />
          <CardBody>
            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-4">
              <span
                className={
                  channel.verificationStatus === "verified"
                    ? "flex size-10 items-center justify-center rounded-full bg-success/15 text-success"
                    : "flex size-10 items-center justify-center rounded-full bg-warning/15 text-warning"
                }
              >
                <IconCheck className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">
                  {channel.verificationStatus === "verified"
                    ? "This channel is verified"
                    : channel.verificationStatus === "pending"
                      ? "Verification in progress"
                      : "Not verified"}
                </p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  On Nexus since {formatDate(channel.joinedAt, "long")}
                </p>
              </div>
              <Badge
                tone={
                  channel.verificationStatus === "verified"
                    ? "published"
                    : channel.verificationStatus === "pending"
                      ? "pending"
                      : "draft"
                }
              >
                {channel.verificationStatus}
              </Badge>
            </div>
          </CardBody>
        </Card>

        {/* Policies */}
        <Card>
          <CardHeader
            title="Channel policies"
            description="Defaults applied to new uploads. Individual videos can override them."
          />
          <CardBody className="space-y-4">
            <Switch
              checked={adsEnabled}
              onCheckedChange={setAdsEnabled}
              label="Allow advertising on my content"
              description="Enables pre-roll, mid-roll and overlay placements and the associated revenue share."
            />
            <Switch
              checked={commentsEnabled}
              onCheckedChange={setCommentsEnabled}
              label="Allow comments"
              description="Turning this off hides existing comments and disables new ones."
            />
          </CardBody>
        </Card>
      </PageBody>

      {/* Invite Collaborator Modal */}
      <Modal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title="Invite Channel Collaborator"
        description="Invite any Nexus user (or non-member) as a co-creator, editor, producer, or manager."
        footer={
          <>
            <Button variant="ghost" onClick={() => setInviteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!inviteEmail.trim()}
              onClick={() => {
                const isExistingUser = inviteEmail.includes("nexus.com") || inviteEmail.startsWith("@");
                const token = `inv_collab_${Date.now()}`;
                const inviteLink = `${window.location.origin}/business/join?token=${token}&role=${encodeURIComponent(inviteRole)}&channel=${channelId}`;

                const newMember = {
                  id: `collab_${Date.now()}`,
                  name: inviteEmail.split("@")[0] || "Co-Creator",
                  email: inviteEmail.trim(),
                  role: inviteRole,
                  status: isExistingUser ? "Active" : "Invite Link Sent",
                  inviteLink,
                };
                setTeamMembers((prev) => [...prev, newMember]);
                setInviteEmail("");
                setInviteModalOpen(false);

                if (isExistingUser) {
                  toast({
                    title: "Active Account Verified & Invited",
                    description: `${newMember.name} received an in-app invitation to join as ${inviteRole}.`,
                  });
                } else {
                  navigator.clipboard?.writeText(inviteLink).catch(() => {});
                  toast({
                    title: "Registration Invite Link Copied",
                    description: `Invite link copied to clipboard! Share it with ${newMember.email} to auto-join upon sign up.`,
                  });
                }
              }}
            >
              {inviteEmail.includes("nexus.com") || inviteEmail.startsWith("@")
                ? "Invite Active Account"
                : "Generate & Send Invite Link"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Collaborator Email or Handle" htmlFor="collab-email" required hint="Any role tier (Viewer, Creator, Business) can be added.">
            <Input
              id="collab-email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="editor@nexus.com or external_creator@gmail.com"
            />
          </Field>

          {inviteEmail.trim() ? (
            <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs">
              {inviteEmail.includes("nexus.com") || inviteEmail.startsWith("@") ? (
                <div className="flex items-center gap-2 text-success font-medium">
                  <IconCheck className="size-4" />
                  Active Nexus Account Verified — Instant In-App Invite Ready
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="font-medium text-warning">Non-Member Account Detected</p>
                  <p className="text-fg-muted">
                    An automated Nexus registration invite link will be generated. Once they sign up via the link, they will auto-join as a {inviteRole}.
                  </p>
                </div>
              )}
            </div>
          ) : null}

          <Field label="Collaboration Role" htmlFor="collab-role">
            <Select
              id="collab-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
            >
              <option value="Co-Host">Co-Host (Full stream & upload access)</option>
              <option value="Video Editor">Video Editor (Upload & metadata access)</option>
              <option value="Producer">Producer (Content & scheduling access)</option>
              <option value="Channel Manager">Channel Manager (Full studio access)</option>
            </Select>
          </Field>
        </div>
      </Modal>
    </>
  );
}
