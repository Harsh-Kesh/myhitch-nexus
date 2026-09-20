"use client";

import {
  IconChartBar,
  IconDots,
  IconEdit,
  IconEye,
  IconTrash,
  IconUpload,
  IconVideoOff,
} from "@tabler/icons-react";
import Link from "next/link";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState, TableSkeleton } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import {
  useChannelVideos,
  useCurrentUser,
  useUpdateVideoStatus,
} from "@/lib/mock-api/hooks";
import type { ContentStatus, Video } from "@/lib/mock-api/types";
import {
  compactNumber,
  formatDate,
  formatDuration,
  formatPercent,
} from "@/lib/utils";

export default function StudioContentPage() {
  const { data: user } = useCurrentUser();
  const channelId = user?.channelId ?? "ch_mara";
  const { data: videos = [], isLoading } = useChannelVideos(channelId, true);
  const updateStatus = useUpdateVideoStatus();
  const { toast } = useToast();

  const [tab, setTab] = React.useState<"all" | ContentStatus>("all");
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = React.useState<ContentStatus>("published");

  const counts = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const video of videos) map[video.status] = (map[video.status] ?? 0) + 1;
    return map;
  }, [videos]);

  const filtered = videos.filter((video) => {
    if (tab !== "all" && video.status !== tab) return false;
    if (query && !video.title.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

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
          <span className="min-w-0">
            <Link
              href={`/video/${row.id}`}
              className="block truncate font-medium text-fg transition-colors hover:text-accent"
            >
              {row.title}
            </Link>
            <span className="mt-0.5 block truncate text-2xs text-fg-subtle">
              {row.synopsis}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => row.status,
      cell: (row) => (
        <div>
          <StatusBadge status={row.status} size="sm" />
          {row.scheduledFor ? (
            <p className="mt-1 text-2xs text-fg-subtle nx-tnum">
              {formatDate(row.scheduledFor)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "access",
      header: "Access",
      secondary: true,
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.pricing.accessModels.slice(0, 2).map((model) => (
            <Badge key={model} tone="outline" size="sm">
              {model.replace("-", " ")}
            </Badge>
          ))}
          {row.pricing.sponsored ? (
            <Badge tone="warning" size="sm">
              sponsored
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "published",
      header: "Date",
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
      key: "comments",
      header: "Comments",
      align: "right",
      secondary: true,
      sortValue: (row) => row.commentCount,
      cell: (row) => <span className="nx-tnum">{compactNumber(row.commentCount)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <Menu
          align="end"
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.title}`}>
              <IconDots />
            </Button>
          }
        >
          <MenuItem href={`/video/${row.id}`} icon={<IconEye />}>
            View on Nexus
          </MenuItem>
          <MenuItem href="/studio/analytics" icon={<IconChartBar />}>
            Analytics
          </MenuItem>
          <MenuItem
            icon={<IconEdit />}
            onClick={() =>
              toast({
                title: "Editing isn't available yet",
                description: "Metadata can only be set at upload time for now — re-upload to change it.",
                tone: "info",
              })
            }
          >
            Edit details
          </MenuItem>
          <MenuSeparator />
          <MenuLabel>Change status</MenuLabel>
          {(["draft", "private", "unlisted", "published", "archived"] as ContentStatus[])
            .filter((status) => status !== row.status)
            .map((status) => (
              <MenuItem
                key={status}
                onClick={() => {
                  updateStatus.mutate({ videoId: row.id, status });
                  toast({ title: `Moved to ${status}` });
                }}
              >
                {status}
              </MenuItem>
            ))}
          <MenuSeparator />
          <MenuItem
            danger
            icon={<IconTrash />}
            onClick={() =>
              toast({
                title: "Delete requires confirmation",
                description: "Mock action — nothing is removed.",
                tone: "warning",
              })
            }
          >
            Delete
          </MenuItem>
        </Menu>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Content"
        description="Every video on your channel and the state it is in."
        actions={
          <Button variant="primary" href="/studio/upload">
            <IconUpload />
            Upload
          </Button>
        }
      />

      <PageBody className="space-y-4">
        <Tabs
          value={tab}
          onChange={(value) => setTab(value as typeof tab)}
          items={[
            { value: "all", label: "All", count: videos.length },
            { value: "published", label: "Published", count: counts.published ?? 0 },
            { value: "pending", label: "Pending review", count: counts.pending ?? 0 },
            { value: "draft", label: "Drafts", count: counts.draft ?? 0 },
            { value: "scheduled", label: "Scheduled", count: counts.scheduled ?? 0 },
            { value: "restricted", label: "Restricted", count: counts.restricted ?? 0 },
            { value: "archived", label: "Archived", count: counts.archived ?? 0 },
          ]}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your content"
            className="max-w-xs"
            sizeVariant="sm"
          />
          {selected.length > 0 ? (
            <div className="ml-auto flex flex-wrap items-center gap-2 rounded border border-border bg-surface-2 px-2.5 py-1.5">
              <span className="text-xs text-fg-muted nx-tnum">
                {selected.length} selected
              </span>
              <Select
                value={bulkStatus}
                onChange={(event) => setBulkStatus(event.target.value as ContentStatus)}
                sizeVariant="sm"
                className="w-36"
                aria-label="Bulk status"
              >
                {["published", "private", "unlisted", "draft", "archived"].map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  selected.forEach((videoId) =>
                    updateStatus.mutate({ videoId, status: bulkStatus }),
                  );
                  toast({
                    title: `${selected.length} videos moved to ${bulkStatus}`,
                  });
                  setSelected([]);
                }}
              >
                Apply
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                Clear
              </Button>
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<IconVideoOff />}
            title={query ? "No matches" : "Nothing here yet"}
            description={
              query
                ? "No videos match that search in this tab."
                : "Upload your first video to get started. Drafts stay private until you publish."
            }
            action={
              query
                ? { label: "Clear search", onClick: () => setQuery("") }
                : { label: "Upload a video", href: "/studio/upload" }
            }
          />
        ) : (
          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(row) => row.id}
            selectable
            selected={selected}
            onSelectedChange={setSelected}
            pageSize={12}
            caption="Channel content"
          />
        )}
      </PageBody>
    </>
  );
}
