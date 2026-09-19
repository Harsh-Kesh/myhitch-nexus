"use client";

import * as React from "react";
import { BrowseView } from "@/components/discovery/browse-view";

// Reads window.location.search directly instead of next/navigation's
// useSearchParams() deliberately — see docs/DEVELOPMENT-PLAN.md's video-page-hang
// writeup for why: useSearchParams() is a "dynamic API" requiring a Suspense boundary,
// and any such boundary under (public) is subject to a real Next.js bug where its
// first resolution on a page is scheduled via requestAnimationFrame, which browsers
// never fire for a hidden/backgrounded tab — a real visitor opening this in a
// background tab could get stuck on the fallback forever. BrowseView already re-syncs
// its own query state whenever `initialQuery` changes, so updating this after mount
// (rather than having it from the first render) works correctly.
export default function SearchPage() {
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    setQuery(new URLSearchParams(window.location.search).get("q") ?? "");
  }, []);

  return (
    <BrowseView
      title={query ? `Results for “${query}”` : "Search"}
      description="Search across titles, synopses, creators, businesses, cast and credits. Narrow with the filters on the left."
      initialQuery={query}
      showQueryField
    />
  );
}
