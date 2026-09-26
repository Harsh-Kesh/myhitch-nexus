"use client";

import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { CommunityFeed } from "@/components/creators/community-feed";
import { useCurrentUser } from "@/lib/mock-api/hooks";

// Found live 2026-09-26: posting or moderating a community update meant leaving Studio
// and going to the channel's own public page — the only place CommunityFeed (with its
// isOwner-gated composer) was ever rendered. Same real feed and composer, just reachable
// from where a creator already manages everything else about their channel.
export default function StudioCommunityPage() {
  const { data: user } = useCurrentUser();
  const channelId = user?.channelId ?? "ch_mara";

  return (
    <>
      <PageHeader
        title="Community"
        description="Post updates, polls and behind-the-scenes notes straight to your channel's Community tab."
      />
      <PageBody className="mx-auto max-w-2xl">
        <CommunityFeed channelId={channelId} isOwner />
      </PageBody>
    </>
  );
}
