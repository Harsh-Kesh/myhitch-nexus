"use client";

import { IconCheck, IconExternalLink, IconPencil } from "@tabler/icons-react";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { MultiSelect } from "@/components/ui/multi-select";
import { useToast } from "@/components/ui/toast";
import { Poster } from "@/components/video/poster";
import { looksLikeRealId } from "@/lib/mock-api";
import { CHANNEL_KIND_LABELS } from "@/lib/mock-api/data/channels";
import { useChannel, useCurrentUser, useUpdateChannel } from "@/lib/mock-api/hooks";
import { compactNumber, formatDate } from "@/lib/utils";

interface MembershipTier {
  priceMinor: number;
  currency: string;
  isEnabled: boolean;
}

/** Real per-channel membership pricing — no mock counterpart to preserve a signature
 * for (the mock's own "Offer channel memberships" switch has always been local
 * component state that saved nowhere), so this talks to the new API directly, same as
 * studio/revenue's usePayoutStatus(). */
function useMembershipTier(channelId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["membership-tier", channelId],
    queryFn: async (): Promise<MembershipTier | null> => {
      const res = await fetch(`/api/channels/${channelId}/membership-tier/`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled,
  });
}

function useSaveMembershipTier(channelId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: MembershipTier) => {
      const res = await fetch(`/api/channels/${channelId}/membership-tier/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceMinor: input.priceMinor,
          currency: input.currency,
          isEnabled: input.isEnabled,
          benefits: ["Members-only content", "Supports this channel directly"],
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not save membership settings.");
      }
      return res.json() as Promise<MembershipTier>;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["membership-tier", channelId] }),
  });
}

function RealMembershipSettings({ channelId }: { channelId: string }) {
  const { data: tier, isLoading } = useMembershipTier(channelId, true);
  const saveTier = useSaveMembershipTier(channelId);
  const { toast } = useToast();

  const [enabled, setEnabled] = React.useState(false);
  const [price, setPrice] = React.useState("4.00");

  React.useEffect(() => {
    if (isLoading) return;
    setEnabled(tier?.isEnabled ?? false);
    setPrice(tier ? (tier.priceMinor / 100).toFixed(2) : "4.00");
  }, [tier, isLoading]);

  const dirty = tier ? enabled !== tier.isEnabled || price !== (tier.priceMinor / 100).toFixed(2) : true;

  const save = async () => {
    const priceMinor = Math.round(Number(price) * 100);
    if (!Number.isInteger(priceMinor) || priceMinor <= 0) {
      toast({ title: "Enter a price greater than £0.00", tone: "error" });
      return;
    }
    try {
      await saveTier.mutateAsync({ priceMinor, currency: tier?.currency ?? "GBP", isEnabled: enabled });
      toast({ title: "Membership settings saved" });
    } catch (err) {
      toast({
        title: "Couldn't save membership settings",
        description: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    }
  };

  return (
    <div className="space-y-3">
      <Switch
        checked={enabled}
        onCheckedChange={setEnabled}
        label="Offer channel memberships"
        description="Lets viewers subscribe monthly for members-only content, via a real Stripe checkout."
      />
      {enabled ? (
        <Field label="Monthly price (GBP)" htmlFor="membership-price">
          <Input
            id="membership-price"
            type="number"
            min="0.50"
            step="0.50"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="w-32"
          />
        </Field>
      ) : null}
      {dirty ? (
        <Button size="sm" onClick={save} loading={saveTier.isPending}>
          Save membership settings
        </Button>
      ) : null}
    </div>
  );
}

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

  const [membershipsEnabled, setMembershipsEnabled] = React.useState(true);
  const [adsEnabled, setAdsEnabled] = React.useState(true);
  const [commentsEnabled, setCommentsEnabled] = React.useState(true);
  const [autoApprove, setAutoApprove] = React.useState(false);

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
            {isRealChannel ? (
              <RealMembershipSettings channelId={channelId} />
            ) : (
              <Switch
                checked={membershipsEnabled}
                onCheckedChange={setMembershipsEnabled}
                label="Offer channel memberships"
                description="Lets viewers subscribe monthly for members-only content."
              />
            )}
            <Switch
              checked={commentsEnabled}
              onCheckedChange={setCommentsEnabled}
              label="Allow comments"
              description="Turning this off hides existing comments and disables new ones."
            />
            <Switch
              checked={autoApprove}
              onCheckedChange={setAutoApprove}
              label="Auto-approve comments from members"
              description="Skips the held queue for your paying members."
            />
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}
