"use client";

import { IconArrowLeft, IconPlaylist, IconTrash } from "@tabler/icons-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, RailSkeleton } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { VideoCard } from "@/components/video/video-card";
import {
  useDeletePlaylist,
  usePlaylistDetail,
  useRemoveVideoFromPlaylist,
  useUpdateMyPlaylist,
} from "@/lib/mock-api/hooks";
import type { ViewerPlaylist } from "@/lib/mock-api/types";

export default function PlaylistDetailPage() {
  const params = useParams<{ id: string }>();
  const playlistId = params?.id ?? "";
  const router = useRouter();
  const { toast } = useToast();

  const { data, isLoading } = usePlaylistDetail(playlistId);
  const updatePlaylist = useUpdateMyPlaylist(playlistId);
  const deletePlaylist = useDeletePlaylist();
  const removeVideo = useRemoveVideoFromPlaylist();

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [visibility, setVisibility] = React.useState<ViewerPlaylist["visibility"]>("private");
  const [editingDetails, setEditingDetails] = React.useState(false);

  React.useEffect(() => {
    if (data?.playlist) {
      setTitle(data.playlist.title);
      setDescription(data.playlist.description ?? "");
      setVisibility(data.playlist.visibility);
    }
  }, [data?.playlist]);

  if (isLoading) return <RailSkeleton count={6} />;

  if (!data) {
    return (
      <EmptyState
        icon={<IconPlaylist />}
        title="Playlist not found"
        description="This playlist may have been deleted, or you don't have access to it."
        action={{ label: "Back to your playlists", href: "/account/playlists" }}
      />
    );
  }

  const { playlist, videos } = data;

  const handleSaveDetails = async () => {
    try {
      await updatePlaylist.mutateAsync({ title: title.trim(), description, visibility });
      setEditingDetails(false);
      toast({ title: "Playlist updated" });
    } catch (err) {
      toast({
        tone: "error",
        title: "Couldn't save changes",
        description: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  };

  const handleDeletePlaylist = () => {
    if (!confirm(`Delete "${playlist.title}"? This can't be undone.`)) return;
    deletePlaylist.mutate(playlist.id, {
      onSuccess: () => router.push("/account/playlists"),
      onError: (err) =>
        toast({
          tone: "error",
          title: "Couldn't delete playlist",
          description: err instanceof Error ? err.message : "Something went wrong.",
        }),
    });
  };

  return (
    <div>
      <Link href="/account/playlists" className="mb-4 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <IconArrowLeft className="size-4" />
        Your playlists
      </Link>

      {editingDetails ? (
        <div className="mb-6 space-y-3 rounded-lg border border-border p-4">
          <Field label="Title" htmlFor="playlist-title">
            <Input id="playlist-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Description" htmlFor="playlist-description">
            <Textarea
              id="playlist-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </Field>
          <Field label="Visibility" htmlFor="playlist-visibility">
            <Select
              id="playlist-visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as ViewerPlaylist["visibility"])}
            >
              <option value="private">Private — only you</option>
              <option value="unlisted">Unlisted — anyone with the link</option>
              <option value="public">Public — shown on your profile</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditingDetails(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={updatePlaylist.isPending} onClick={handleSaveDetails}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold text-fg sm:text-2xl">{playlist.title}</h1>
            {playlist.description ? (
              <p className="mt-1 text-sm text-fg-muted">{playlist.description}</p>
            ) : null}
            <p className="mt-1 text-xs text-fg-subtle nx-tnum">
              {playlist.videoCount} {playlist.videoCount === 1 ? "video" : "videos"} · {playlist.visibility}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditingDetails(true)}>
              Edit
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Delete playlist" onClick={handleDeletePlaylist}>
              <IconTrash className="size-4 text-danger" />
            </Button>
          </div>
        </div>
      )}

      {videos.length === 0 ? (
        <EmptyState
          icon={<IconPlaylist />}
          title="This playlist is empty"
          description="Add videos to it from any video page's Save to playlist button."
          action={{ label: "Browse the catalogue", href: "/explore" }}
        />
      ) : (
        <div className="grid gap-x-4 gap-y-6 grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5">
          {videos.map((video) => (
            <div key={video.id} className="group relative">
              <VideoCard video={video} />
              <Button
                variant="secondary"
                size="icon-sm"
                aria-label={`Remove ${video.title} from this playlist`}
                className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() =>
                  removeVideo.mutate(
                    { playlistId: playlist.id, videoId: video.id },
                    {
                      onError: (err) =>
                        toast({
                          tone: "error",
                          title: "Couldn't remove video",
                          description: err instanceof Error ? err.message : "Something went wrong.",
                        }),
                    },
                  )
                }
              >
                <IconTrash className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
