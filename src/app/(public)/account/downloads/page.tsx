"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  IconDeviceFloppy,
  IconDownload,
  IconPlayerPlay,
  IconTrash,
  IconVideo,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { formatBytes, formatDuration, formatDate } from "@/lib/utils";
import {
  clearAllDownloads,
  getDownloadedVideos,
  removeDownload,
  type DownloadedItem,
} from "@/lib/offline/downloadManager";

export default function DownloadsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [downloads, setDownloads] = React.useState<DownloadedItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const loadDownloads = React.useCallback(async () => {
    try {
      const items = await getDownloadedVideos();
      setDownloads(items);
    } catch (err: unknown) {
      const description = err instanceof Error ? err.message : "Unknown error";
      toast({
        tone: "error",
        title: "Could not load downloads",
        description,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    loadDownloads();
  }, [loadDownloads]);

  const handleDelete = async (videoId: string, title: string) => {
    setDeletingId(videoId);
    try {
      await removeDownload(videoId);
      toast({
        title: "Download removed",
        description: `"${title}" has been deleted from your device.`,
      });
      loadDownloads();
    } catch (err: unknown) {
      const description = err instanceof Error ? err.message : "Unknown error";
      toast({
        tone: "error",
        title: "Failed to remove download",
        description,
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    if (!confirm("Are you sure you want to remove all offline downloads from this device?")) {
      return;
    }
    try {
      await clearAllDownloads();
      toast({
        title: "Downloads cleared",
        description: "All offline titles have been removed from this device.",
      });
      loadDownloads();
    } catch (err: unknown) {
      const description = err instanceof Error ? err.message : "Unknown error";
      toast({
        tone: "error",
        title: "Failed to clear downloads",
        description,
      });
    }
  };

  const totalBytes = downloads.reduce((acc, item) => acc + (item.sizeBytes || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-fg">
            Offline Downloads
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            Videos saved to this device for offline playback when you&rsquo;re on the go.
          </p>
        </div>

        {downloads.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-danger hover:bg-danger/10 self-start sm:self-auto"
            onClick={handleClearAll}
          >
            <IconTrash className="size-4" />
            Clear all downloads
          </Button>
        )}
      </div>

      {/* Storage meter */}
      <Card>
        <CardBody>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent">
                <IconDeviceFloppy className="size-5" />
              </div>
              <div>
                <p className="font-semibold text-fg">
                  {formatBytes(totalBytes)} used on this device
                </p>
                <p className="text-xs text-fg-muted">
                  {downloads.length} title{downloads.length === 1 ? "" : "s"} available offline
                </p>
              </div>
            </div>

            <Badge tone="accent">
              Premium &amp; Family Feature
            </Badge>
          </div>
        </CardBody>
      </Card>

      {/* Downloads List */}
      {loading ? (
        <p className="py-8 text-center text-sm text-fg-muted">Loading downloads...</p>
      ) : downloads.length === 0 ? (
        <Card className="text-center py-12">
          <CardBody className="space-y-4">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-surface-2 text-fg-subtle">
              <IconDownload className="size-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-fg">No downloads yet</h3>
              <p className="mt-1 text-sm text-fg-muted max-w-sm mx-auto">
                Look for the download icon on any video or film page to save it for offline playback.
              </p>
            </div>
            <Button variant="primary" onClick={() => router.push("/")}>
              Explore Titles
            </Button>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {downloads.map((item) => (
            <Card key={item.videoId} className="overflow-hidden group">
              <div className="relative aspect-video w-full bg-surface-2">
                {item.posterUrl ? (
                  <img
                    src={item.posterUrl}
                    alt={item.title}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-fg-subtle">
                    <IconVideo className="size-8" />
                  </div>
                )}
                {item.duration > 0 && (
                  <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-2xs font-medium text-white">
                    {formatDuration(item.duration)}
                  </span>
                )}
              </div>

              <CardBody className="p-4 space-y-3">
                <div>
                  <h3 className="font-semibold text-fg line-clamp-1 group-hover:text-accent transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-xs text-fg-muted mt-0.5 line-clamp-1">
                    {item.channelTitle}
                  </p>
                </div>

                <div className="flex items-center justify-between text-2xs text-fg-subtle">
                  <span>{formatBytes(item.sizeBytes)}</span>
                  <span>{item.quality}</span>
                  <span>{formatDate(item.downloadedAt, "short")}</span>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-border">
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex-1"
                    onClick={() => router.push(`/video/${item.videoId}?offline=true`)}
                  >
                    <IconPlayerPlay className="size-3.5" />
                    Watch Offline
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:bg-danger/10"
                    loading={deletingId === item.videoId}
                    onClick={() => handleDelete(item.videoId, item.title)}
                  >
                    <IconTrash className="size-3.5" />
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
