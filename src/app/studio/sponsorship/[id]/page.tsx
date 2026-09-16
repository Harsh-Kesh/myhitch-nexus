"use client";

import { IconArrowLeft, IconExternalLink, IconMail } from "@tabler/icons-react";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { SponsorshipListingStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { looksLikeRealId } from "@/lib/mock-api";
import {
  useChannelVideos,
  useCurrentUser,
  useSponsorshipInquiries,
  useSponsorshipListing,
  useSubmitSponsorshipListing,
  useUpdateSponsorshipListing,
  useWithdrawSponsorshipListing,
} from "@/lib/mock-api/hooks";
import { SPONSORSHIP_REWARD_LABELS, SPONSORSHIP_REWARD_TYPES, type SponsorshipRewardType } from "@/lib/mock-api/types";
import { relativeTime } from "@/lib/utils";

const EDITABLE_STATUSES = new Set(["draft", "changes_requested"]);

export default function SponsorshipListingEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const { toast } = useToast();

  const { data: user } = useCurrentUser();
  const { data: listing, isLoading } = useSponsorshipListing(id);
  const { data: videos = [] } = useChannelVideos(user?.channelId ?? "", true);
  const { data: inquiries = [] } = useSponsorshipInquiries(id);
  const updateListing = useUpdateSponsorshipListing(id);
  const submitListing = useSubmitSponsorshipListing(id);
  const withdrawListing = useWithdrawSponsorshipListing(id);

  const [projectName, setProjectName] = React.useState("");
  const [videoId, setVideoId] = React.useState("");
  const [pitchHtml, setPitchHtml] = React.useState("");
  const [rewardTypes, setRewardTypes] = React.useState<SponsorshipRewardType[]>([]);

  React.useEffect(() => {
    if (!listing) return;
    setProjectName(listing.projectName);
    setVideoId(listing.videoId ?? "");
    setPitchHtml(listing.pitchHtml);
    setRewardTypes(listing.rewardTypes);
  }, [listing]);

  const eligibleVideos = videos.filter((video) => looksLikeRealId(video.id));

  if (isLoading) return null;
  if (!listing) {
    return (
      <PageBody>
        <p className="text-sm text-fg-muted">Listing not found.</p>
      </PageBody>
    );
  }

  const editable = EDITABLE_STATUSES.has(listing.status);

  const toggleReward = (reward: SponsorshipRewardType) => {
    setRewardTypes((current) =>
      current.includes(reward) ? current.filter((item) => item !== reward) : [...current, reward],
    );
  };

  const save = async () => {
    try {
      await updateListing.mutateAsync({
        projectName,
        videoId: videoId || null,
        pitchHtml,
        rewardTypes,
      });
      toast({ title: "Draft saved" });
    } catch (error) {
      toast({
        title: "Couldn't save",
        description: error instanceof Error ? error.message : undefined,
        tone: "error",
      });
    }
  };

  const submit = async () => {
    try {
      await save();
      await submitListing.mutateAsync();
      toast({ title: "Sent for editorial review" });
    } catch (error) {
      toast({
        title: "Couldn't submit",
        description: error instanceof Error ? error.message : undefined,
        tone: "error",
      });
    }
  };

  const withdraw = async () => {
    try {
      await withdrawListing.mutateAsync();
      toast({ title: "Listing withdrawn" });
      router.push("/studio/sponsorship");
    } catch (error) {
      toast({
        title: "Couldn't withdraw",
        description: error instanceof Error ? error.message : undefined,
        tone: "error",
      });
    }
  };

  return (
    <>
      <PageHeader
        title={listing.projectName || "Untitled listing"}
        description="Exchange Hub sponsorship listing"
        actions={
          <div className="flex items-center gap-2">
            <SponsorshipListingStatusBadge status={listing.status} />
            <Button variant="secondary" size="sm" href="/studio/sponsorship">
              <IconArrowLeft />
              Back
            </Button>
          </div>
        }
      />

      <PageBody className="space-y-5">
        {listing.status === "changes_requested" && listing.reviewerNotes ? (
          <Card className="border-warning/30 bg-warning/5">
            <CardBody>
              <p className="text-sm font-medium text-fg">Editorial notes</p>
              <p className="mt-1 text-sm text-fg-muted">{listing.reviewerNotes}</p>
            </CardBody>
          </Card>
        ) : null}
        {listing.status === "rejected" && listing.reviewerNotes ? (
          <Card className="border-danger/30 bg-danger/5">
            <CardBody>
              <p className="text-sm font-medium text-fg">Not published</p>
              <p className="mt-1 text-sm text-fg-muted">{listing.reviewerNotes}</p>
            </CardBody>
          </Card>
        ) : null}
        {listing.status === "published" ? (
          <Card className="border-live/30 bg-live/5">
            <CardBody className="flex items-center justify-between gap-3">
              <p className="text-sm text-fg">Live in the Exchange Hub.</p>
              <Button variant="secondary" size="sm" href={`/exchange/${listing.slug}`}>
                <IconExternalLink />
                View published page
              </Button>
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title="Pitch"
            description={
              editable
                ? "The full case for sponsorship — what the project is, why it matters, and what a sponsor's support makes possible."
                : "This listing is no longer editable in its current status."
            }
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Project name" htmlFor="ed-name" required>
                <Input
                  id="ed-name"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  disabled={!editable}
                />
              </Field>
              {eligibleVideos.length > 0 ? (
                <Field label="Trailer (one of your uploads)" htmlFor="ed-video">
                  <Select
                    id="ed-video"
                    value={videoId}
                    onChange={(event) => setVideoId(event.target.value)}
                    disabled={!editable}
                  >
                    <option value="">Don&rsquo;t link an upload</option>
                    {eligibleVideos.map((video) => (
                      <option key={video.id} value={video.id}>
                        {video.title}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>
            <Field label="Pitch">
              <RichTextEditor value={pitchHtml} onChange={setPitchHtml} editable={editable} />
            </Field>
            <Field
              label="What a sponsor gets"
              hint="A fixed, non-financial list — Exchange Hub never offers a share of profits or revenue."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {SPONSORSHIP_REWARD_TYPES.map((reward) => (
                  <Checkbox
                    key={reward}
                    label={SPONSORSHIP_REWARD_LABELS[reward]}
                    checked={rewardTypes.includes(reward)}
                    disabled={!editable}
                    onChange={() => toggleReward(reward)}
                  />
                ))}
              </div>
            </Field>

            {editable ? (
              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <Button variant="ghost" loading={withdrawListing.isPending} onClick={withdraw}>
                  Discard
                </Button>
                <Button variant="secondary" loading={updateListing.isPending} onClick={save}>
                  Save draft
                </Button>
                <Button variant="primary" loading={submitListing.isPending} onClick={submit}>
                  Submit for review
                </Button>
              </div>
            ) : null}
          </CardBody>
        </Card>

        {listing.status === "published" || listing.status === "closed" ? (
          <Card>
            <CardHeader
              title="Inquiries"
              description="Sponsors who've expressed interest through this listing."
            />
            <CardBody className="space-y-3">
              {inquiries.length === 0 ? (
                <p className="text-sm text-fg-muted">No inquiries yet.</p>
              ) : (
                inquiries.map((inquiry) => (
                  <div key={inquiry.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-fg">
                        <IconMail className="size-4 text-fg-muted" />
                        {inquiry.sponsorName}
                      </p>
                      <span className="text-2xs text-fg-subtle">{relativeTime(inquiry.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-xs text-fg-muted">{inquiry.sponsorEmail}</p>
                    <p className="mt-2 text-sm text-fg">{inquiry.message}</p>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        ) : null}
      </PageBody>
    </>
  );
}
