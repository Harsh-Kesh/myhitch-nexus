"use client";

import { IconUpload, IconVideoOff } from "@tabler/icons-react";
import Link from "next/link";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState, TableSkeleton } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  useCategories,
  useChannel,
  useChannelVideos,
  useCreateStudioUpload,
  useOwnedChannelId,
  usePublishDraft,
} from "@/lib/mock-api/hooks";
import type { Video } from "@/lib/mock-api/types";
import { compactNumber, formatDate, formatDuration, formatPercent } from "@/lib/utils";

export default function BusinessVideosPage() {
  const { channelId: ownedChannelId } = useOwnedChannelId();
  const channelId = ownedChannelId ?? "";
  // includeUnpublished:true now hits a real, membership-gated endpoint for a real
  // channel (see src/app/api/channels/[id]/videos/route.ts).
  const { data: videos = [], isLoading } = useChannelVideos(channelId, true);
  const [query, setQuery] = React.useState("");
  const [uploadOpen, setUploadOpen] = React.useState(false);

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
          <Button variant="primary" onClick={() => setUploadOpen(true)}>
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
            action={{ label: "Upload a video", onClick: () => setUploadOpen(true) }}
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

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} channelId={channelId} />
    </>
  );
}

/** Native, minimal upload for Business/Enterprise — no redirect into Creator's
 * /studio/upload wizard. Reuses the same real signed-upload-then-publish path that
 * wizard uses (createStudioUpload -> PUT -> publishDraft), just without its 6-step
 * metadata collection: everything not asked here (description, tags, language, etc.)
 * takes a plain default matching what a business upload actually needs. */
function UploadModal({
  open,
  onClose,
  channelId,
}: {
  open: boolean;
  onClose: () => void;
  channelId: string;
}) {
  const { toast } = useToast();
  const { data: channel } = useChannel(channelId);
  const { data: categories = [] } = useCategories();
  const createUpload = useCreateStudioUpload();
  const publishDraft = usePublishDraft();

  const commercialCategories = categories.filter((c) => c.contentType === "commercial");

  const [title, setTitle] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [categoryId, setCategoryId] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);

  const effectiveCategoryId = categoryId || commercialCategories[0]?.id || "";
  const canSubmit = title.trim().length >= 3 && file && effectiveCategoryId && confirmed;

  const reset = () => {
    setTitle("");
    setFile(null);
    setCategoryId("");
    setConfirmed(false);
  };

  const submit = async () => {
    if (!file || !canSubmit) return;
    setUploading(true);
    try {
      const { path, signedUrl } = await createUpload.mutateAsync({
        channelId,
        fileName: file.name,
        fileSizeBytes: file.size,
        kind: "video",
      });
      const putRes = await fetch(signedUrl, { method: "PUT", body: file });
      if (!putRes.ok) throw new Error("The file upload failed partway through — try again.");

      await publishDraft.mutateAsync({
        uploadSessionId: path,
        kind: "video",
        title: title.trim(),
        description: "",
        contentType: "commercial",
        categoryIds: [effectiveCategoryId],
        tags: [],
        participants: [],
        productionCompany: "",
        releaseDate: "",
        language: "English",
        country: "AU",
        thumbnailId: null,
        customThumbnailName: null,
        customThumbnailUrl: null,
        subtitles: [],
        autoTranscribe: false,
        audioDescription: false,
        rights: {
          declaredOwner: channel?.name ?? "",
          ownershipConfirmed: confirmed,
          licenceStart: new Date().toISOString().slice(0, 10),
          licenceEnd: null,
          permittedCountries: [],
          blockedCountries: [],
          ageRating: "U",
          contentLabels: [],
        },
        pricing: { accessModels: ["free"] },
        status: "published",
        scheduledFor: null,
        playlistIds: [],
        seriesId: null,
        seasonNumber: null,
        episodeNumber: null,
      });

      toast({ title: "Video published" });
      reset();
      onClose();
    } catch (err) {
      toast({
        title: "Couldn't upload video",
        description: err instanceof Error ? err.message : "Something went wrong — try again.",
        tone: "error",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!uploading) onClose();
      }}
      title="Upload video"
      description="Publishes straight to your business channel."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!canSubmit} loading={uploading}>
            {uploading ? "Uploading…" : "Publish"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title" htmlFor="biz-up-title" required>
          <Input id="biz-up-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Video file" htmlFor="biz-up-file" required>
          <input
            id="biz-up-file"
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-fg-muted file:mr-3 file:rounded file:border file:border-border file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm"
          />
        </Field>
        <Field label="Category" htmlFor="biz-up-category" required>
          <Select
            id="biz-up-category"
            value={effectiveCategoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {commercialCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Checkbox
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          label="I confirm I own the rights to this content"
        />
      </div>
    </Modal>
  );
}
