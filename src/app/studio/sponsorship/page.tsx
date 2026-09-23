"use client";

import { IconPlus, IconSpeakerphone } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, SponsorshipListingStatusBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { looksLikeRealId } from "@/lib/mock-api";
import {
  useChannelVideos,
  useCreateSponsorshipListing,
  useCurrentUser,
  useMySponsorshipListings,
} from "@/lib/mock-api/hooks";
import { ProjectPicker } from "@/components/studio/project-picker";
import { relativeTime } from "@/lib/utils";

export default function StudioSponsorshipPage() {
  const { data: user } = useCurrentUser();
  const channelId = user?.channelId ?? "";

  const { data: listings = [], isLoading } = useMySponsorshipListings();
  const { data: videos = [] } = useChannelVideos(channelId, true);
  const createListing = useCreateSponsorshipListing();
  const { toast } = useToast();
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [projectName, setProjectName] = React.useState("");
  const [videoId, setVideoId] = React.useState("");

  // Same reasoning as Studio Magazine: a real video to link is a bonus, not a
  // requirement, since real video publishing is still mock.
  const eligibleVideos = videos.filter((video) => looksLikeRealId(video.id));

  const startNew = async () => {
    try {
      const listing = await createListing.mutateAsync({
        projectName: projectName.trim(),
        videoId: videoId || undefined,
      });
      setOpen(false);
      setProjectName("");
      setVideoId("");
      router.push(`/studio/sponsorship/${listing.id}`);
    } catch (error) {
      toast({
        title: "Couldn't start the listing",
        description: error instanceof Error ? error.message : undefined,
        tone: "error",
      });
    }
  };

  return (
    <>
      <PageHeader
        title="Exchange Hub"
        description="Pitch your film or project for sponsorship — a trailer, your analysis, and what a sponsor gets in return. Submitted to MYHitch Connect once you're ready."
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <IconPlus />
            New listing
          </Button>
        }
      />

      <PageBody className="space-y-4">
        <div className="rounded-lg border border-accent/25 bg-accent/5 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge tone="accent" size="sm">MYHitch Connect</Badge>
              <p className="text-sm font-semibold text-fg">Cross-Platform Sponsorship Engine</p>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-fg-muted">
              Once approved on Exchange Hub, your project pitch is published across MYHitch Connect for direct brand deal match-making and sponsorship monetization.
            </p>
          </div>
        </div>

        {isLoading ? null : listings.length === 0 ? (
          <EmptyState
            icon={<IconSpeakerphone />}
            title="No listings yet"
            description="Pitch a project for sponsorship — what it is, why it deserves backing, and the non-financial recognition you're offering in return."
            action={{ label: "Start a listing", onClick: () => setOpen(true) }}
          />
        ) : (
          <div className="space-y-3">
            {listings.map((listing) => (
              <Card key={listing.id}>
                <CardBody className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{listing.projectName}</p>
                    <p className="mt-0.5 truncate text-xs text-fg-muted">
                      updated {relativeTime(listing.updatedAt)}
                    </p>
                    {listing.status === "changes_requested" && listing.reviewerNotes ? (
                      <p className="mt-1.5 rounded bg-warning/10 px-2 py-1 text-xs text-warning">
                        Note: {listing.reviewerNotes}
                      </p>
                    ) : null}
                    {listing.status === "rejected" && listing.reviewerNotes ? (
                      <p className="mt-1.5 rounded bg-danger/10 px-2 py-1 text-xs text-danger">
                        {listing.reviewerNotes}
                      </p>
                    ) : null}
                  </div>
                  <SponsorshipListingStatusBadge status={listing.status} />
                  <Button variant="secondary" size="sm" href={`/studio/sponsorship/${listing.id}`}>
                    {listing.status === "draft" || listing.status === "changes_requested"
                      ? "Continue editing"
                      : "View"}
                  </Button>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </PageBody>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New sponsorship listing"
        description="You'll write the full pitch and choose what a sponsor gets next — this just starts the draft."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={createListing.isPending}
              disabled={projectName.trim().length < 3}
              onClick={startNew}
            >
              Start listing
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <ProjectPicker
            label="Which project is this for?"
            hint="Sponsors can watch the trailer straight from the listing."
            videos={eligibleVideos}
            name={projectName}
            videoId={videoId}
            onChange={({ name, videoId: nextVideoId }) => {
              setProjectName(name);
              setVideoId(nextVideoId);
            }}
          />
        </div>
      </Modal>
    </>
  );
}
