"use client";

import { IconUpload, IconVideoOff } from "@tabler/icons-react";
import Link from "next/link";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState, TableSkeleton } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { looksLikeRealId } from "@/lib/mock-api";
import { useChannelVideos, useCurrentUser } from "@/lib/mock-api/hooks";
import type { Video } from "@/lib/mock-api/types";
import { compactNumber, formatDate, formatDuration, formatPercent } from "@/lib/utils";

// Not a plain `?? "ch_helio"` — see business-shell.tsx's header comment: the demo
// account's own channelId is never actually null by the time it reaches here.
const MOCK_BUSINESS_CHANNEL = "ch_helio";

export default function BusinessVideosPage() {
  const { data: user } = useCurrentUser();
  const channelId =
    user?.channelId && looksLikeRealId(user.channelId) ? user.channelId : MOCK_BUSINESS_CHANNEL;
  const isRealChannel = looksLikeRealId(channelId);
  // getChannelVideos(id, true) is unconditionally mock — a real channel asks for
  // published-only instead, which does hit the real API (see business/channel/page.tsx).
  const { data: videos = [], isLoading } = useChannelVideos(channelId, !isRealChannel);
  const [query, setQuery] = React.useState("");

  const filtered = videos.filter((video) =>
    video.title.toLowerCase().includes(query.toLowerCase()),
  );

  const columns: Array<Column<Video>> = [
    {
      key: "title",
      header: "Video",
      sortValue: (row) => row.title,
      cell: (row) => (
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="relative h-10 w-[4.5rem] shrink-0 rounded"
            style={{
              backgroundImage: `linear-gradient(140deg, ${row.posterGradient[0]}, ${row.posterGradient[1]})`,
            }}
          >
            <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[9px] text-white nx-tnum">
              {formatDuration(row.durationSeconds)}
            </span>
          </span>
          <Link
            href={`/video/${row.id}`}
            className="min-w-0 truncate font-medium text-fg transition-colors hover:text-accent"
          >
            {row.title}
          </Link>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => row.status,
      cell: (row) => <StatusBadge status={row.status} size="sm" />,
    },
    {
      key: "sponsored",
      header: "Disclosure",
      secondary: true,
      cell: (row) =>
        row.pricing.sponsored ? (
          <Badge tone="warning" size="sm">
            Paid promotion
          </Badge>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: "published",
      header: "Published",
      secondary: true,
      sortValue: (row) => row.publishedAt ?? "",
      cell: (row) => (
        <span className="nx-tnum">
          {row.publishedAt ? formatDate(row.publishedAt) : "—"}
        </span>
      ),
    },
    {
      key: "views",
      header: "Views",
      align: "right",
      sortValue: (row) => row.views,
      cell: (row) => <span className="nx-tnum text-fg">{compactNumber(row.views)}</span>,
    },
    {
      key: "completion",
      header: "Completion",
      align: "right",
      secondary: true,
      sortValue: (row) => row.completionRate,
      cell: (row) => (
        <span className="nx-tnum">{formatPercent(row.completionRate, 0)}</span>
      ),
    },
    {
      key: "commerce",
      header: "Commerce",
      align: "right",
      secondary: true,
      cell: (row) => (
        <span className="nx-tnum text-fg-muted">
          {row.pricing.affiliateLinks?.length ?? 0}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Videos"
        description="Everything published under the business channel, with disclosure and commerce status."
        actions={
          <Button variant="primary" href="/studio/upload">
            <IconUpload />
            Upload
          </Button>
        }
      />

      <PageBody className="space-y-4">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search videos"
          className="max-w-xs"
          sizeVariant="sm"
        />

        {isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<IconVideoOff />}
            title="No videos"
            description="Upload brand films, product content and owner guides to build your channel."
            action={{ label: "Upload a video", href: "/studio/upload" }}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(row) => row.id}
            pageSize={12}
            caption="Business channel videos"
          />
        )}
      </PageBody>
    </>
  );
}
