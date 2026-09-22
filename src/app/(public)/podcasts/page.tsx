"use client";

import { BrowseView } from "@/components/discovery/browse-view";

export default function PodcastsPage() {
  return (
    <BrowseView
      title="Podcasts"
      description="Interviews, true crime, comedy and conversation shows from independent creators. Free with ads, or included with a Nexus plan."
      lockedContentTypes={["podcast"]}
    />
  );
}
