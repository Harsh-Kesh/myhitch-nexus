"use client";

import { BrowseView } from "@/components/discovery/browse-view";

export default function MusicPage() {
  return (
    <BrowseView
      title="Music & audio"
      description="Tracks, EPs, albums and live performances from independent and signed artists. Free with ads, or included with a Nexus plan."
      lockedContentTypes={["music"]}
      layout="poster"
    />
  );
}
