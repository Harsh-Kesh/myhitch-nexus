"use client";

import { IconPlaylist, IconPlus, IconStack2 } from "@tabler/icons-react";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { Poster } from "@/components/video/poster";
import { looksLikeRealId } from "@/lib/mock-api";
import { videoById } from "@/lib/mock-api/data/videos";
import {
  useChannelVideos,
  useCreatePlaylist,
  useCreateSeries,
  useCurrentUser,
  usePlaylists,
  useSeries,
  useSeriesDetail,
  useUpdatePlaylist,
} from "@/lib/mock-api/hooks";
import type { Playlist } from "@/lib/mock-api/types";
import { formatDate, formatDuration } from "@/lib/utils";

/** Real series' episodes live on `videos.series_id` directly (with their own
 * season/episode numbers), not a mock-style `seasons[].episodeIds` array — this renders
 * that flat, real list, fetched only when its card is actually a real series. */
function RealSeriesEpisodes({ seriesId }: { seriesId: string }) {
  const { data } = useSeriesDetail(seriesId);
  const episodes = data?.episodes ?? [];
  if (episodes.length === 0) {
    return <p className="text-sm text-fg-subtle">No published episodes yet.</p>;
  }
  return (
    <ol className="divide-y divide-border rounded-lg border border-border">
      {episodes.map((episode) => (
        <li key={episode.id} className="flex items-center gap-3 px-3 py-2.5">
          <span className="w-14 shrink-0 text-center text-xs text-fg-subtle nx-tnum">
            {episode.seasonNumber ? `S${episode.seasonNumber}` : ""}
            {episode.episodeNumber ? `E${episode.episodeNumber}` : ""}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-fg">{episode.title}</span>
        </li>
      ))}
    </ol>
  );
}

export default function StudioPlaylistsPage() {
  const { data: user } = useCurrentUser();
  const channelId = user?.channelId ?? "ch_mara";
  const isRealChannel = looksLikeRealId(channelId);

  const { data: playlists = [] } = usePlaylists(channelId);
  const { data: series = [] } = useSeries(channelId);
  const { data: videos = [] } = useChannelVideos(channelId, true);
  const createPlaylist = useCreatePlaylist(channelId);
  const updatePlaylist = useUpdatePlaylist(channelId);
  const createSeries = useCreateSeries(channelId);
  const { toast } = useToast();

  const [tab, setTab] = React.useState("playlists");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Playlist | null>(null);
  const [createSeriesOpen, setCreateSeriesOpen] = React.useState(false);
  const [seriesTitle, setSeriesTitle] = React.useState("");
  const [seriesDescription, setSeriesDescription] = React.useState("");

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [visibility, setVisibility] = React.useState<Playlist["visibility"]>("public");

  return (
    <>
      <PageHeader
        title="Playlists & series"
        description="Group content into ordered playlists, or structure it as a series with seasons and episodes."
        actions={
          tab === "series" ? (
            isRealChannel ? (
              <Button variant="primary" onClick={() => setCreateSeriesOpen(true)}>
                <IconPlus />
                New series
              </Button>
            ) : null
          ) : (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <IconPlus />
              New playlist
            </Button>
          )
        }
      />

      <PageBody className="space-y-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "playlists", label: "Playlists", count: playlists.length },
            { value: "series", label: "Series", count: series.length },
          ]}
        />

        {tab === "playlists" ? (
          playlists.length === 0 ? (
            <EmptyState
              icon={<IconPlaylist />}
              title="No playlists yet"
              description="Playlists let viewers watch a sequence in the order you intend."
              action={{ label: "Create a playlist", onClick: () => setCreateOpen(true) }}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {playlists.map((playlist) => (
                <Card key={playlist.id} className="overflow-hidden">
                  <Poster
                    src={playlist.thumbnailUrl}
                    alt={playlist.title}
                    gradient={playlist.posterGradient}
                    seed={playlist.id}
                    ratio="video"
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
                    <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-2xs text-white nx-tnum">
                      {playlist.videoIds.length} videos
                    </span>
                    <span className="absolute left-2 top-2">
                      <Badge
                        tone={
                          playlist.visibility === "public"
                            ? "published"
                            : playlist.visibility === "unlisted"
                              ? "unlisted"
                              : "private"
                        }
                        size="sm"
                      >
                        {playlist.visibility}
                      </Badge>
                    </span>
                  </Poster>
                  <CardBody className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-fg">{playlist.title}</p>
                      <p className="mt-1 nx-clamp-2 text-xs leading-relaxed text-fg-muted">
                        {playlist.description}
                      </p>
                    </div>

                    <ol className="space-y-1.5">
                      {playlist.videoIds.slice(0, 4).map((videoId, index) => {
                        const video = videoById(videoId);
                        return (
                          <li
                            key={videoId}
                            className="flex items-center gap-2 text-xs text-fg-muted"
                          >
                            <span className="w-4 shrink-0 text-center text-fg-subtle nx-tnum">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                              {video?.title ?? videoId}
                            </span>
                            <span className="shrink-0 text-fg-subtle nx-tnum">
                              {video ? formatDuration(video.durationSeconds) : "—"}
                            </span>
                          </li>
                        );
                      })}
                      {playlist.videoIds.length > 4 ? (
                        <li className="pl-6 text-2xs text-fg-subtle">
                          +{playlist.videoIds.length - 4} more
                        </li>
                      ) : null}
                    </ol>

                    <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                      <span className="text-2xs text-fg-subtle nx-tnum">
                        Updated {formatDate(playlist.updatedAt)}
                      </span>
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => setEditing(playlist)}
                      >
                        Edit
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )
        ) : null}

        {tab === "series" ? (
          series.length === 0 ? (
            <EmptyState
              icon={<IconStack2 />}
              title="No series"
              description="Series group episodes into seasons and unlock next-episode autoplay."
              action={isRealChannel ? { label: "Create a series", onClick: () => setCreateSeriesOpen(true) } : undefined}
            />
          ) : (
            <div className="space-y-4">
              {series.map((item) =>
                isRealChannel ? (
                  <Card key={item.id}>
                    <CardHeader title={item.title} description={item.description || undefined} />
                    <CardBody>
                      <RealSeriesEpisodes seriesId={item.id} />
                    </CardBody>
                  </Card>
                ) : (
                  <Card key={item.id}>
                    <CardHeader
                      title={item.title}
                      description={item.description}
                      action={
                        <Badge tone="neutral" size="sm">
                          {item.seasons.length} season
                          {item.seasons.length === 1 ? "" : "s"}
                        </Badge>
                      }
                    />
                    <CardBody className="space-y-4">
                      {item.seasons.map((season) => (
                        <div key={season.number}>
                          <p className="text-sm font-medium text-fg">
                            Season {season.number} · {season.title}
                          </p>
                          <ol className="mt-2 divide-y divide-border rounded-lg border border-border">
                            {season.episodeIds.map((episodeId, index) => {
                              const video = videoById(episodeId);
                              return (
                                <li
                                  key={episodeId}
                                  className="flex items-center gap-3 px-3 py-2.5"
                                >
                                  <span className="w-8 shrink-0 text-center text-xs text-fg-subtle nx-tnum">
                                    E{index + 1}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-sm text-fg">
                                    {video?.title ?? episodeId}
                                  </span>
                                  <span className="shrink-0 text-xs text-fg-subtle nx-tnum">
                                    {video ? formatDuration(video.durationSeconds) : "—"}
                                  </span>
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                      ))}
                    </CardBody>
                  </Card>
                ),
              )}
            </div>
          )
        ) : null}
      </PageBody>

      {/* Create */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New playlist"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={createPlaylist.isPending}
              disabled={title.trim().length < 2}
              onClick={async () => {
                await createPlaylist.mutateAsync({
                  channelId,
                  title: title.trim(),
                  description,
                  visibility,
                });
                setCreateOpen(false);
                setTitle("");
                setDescription("");
                toast({ title: "Playlist created" });
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title" htmlFor="pl-title" required>
            <Input
              id="pl-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Camera craft essentials"
            />
          </Field>
          <Field label="Description" htmlFor="pl-desc">
            <Textarea
              id="pl-desc"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
            />
          </Field>
          <Field label="Visibility" htmlFor="pl-visibility">
            <Select
              id="pl-visibility"
              value={visibility}
              onChange={(event) =>
                setVisibility(event.target.value as Playlist["visibility"])
              }
            >
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </Select>
          </Field>
        </div>
      </Modal>

      {/* Edit */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`Edit ${editing?.title ?? ""}`}
        size="lg"
        footer={
          <Button variant="primary" onClick={() => setEditing(null)}>
            Done
          </Button>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <Field label="Visibility" htmlFor="edit-visibility">
              <Select
                id="edit-visibility"
                value={editing.visibility}
                onChange={(event) => {
                  const next = event.target.value as Playlist["visibility"];
                  updatePlaylist.mutate({ id: editing.id, patch: { visibility: next } });
                  setEditing({ ...editing, visibility: next });
                }}
                className="max-w-xs"
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </Select>
            </Field>

            <div>
              <p className="mb-2 text-sm font-medium text-fg">Videos in this playlist</p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {editing.videoIds.map((videoId, index) => {
                  const video = videoById(videoId);
                  return (
                    <li key={videoId} className="flex items-center gap-3 px-3 py-2.5">
                      <span className="w-5 text-center text-xs text-fg-subtle nx-tnum">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">
                        {video?.title ?? videoId}
                      </span>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          const next = editing.videoIds.filter((id) => id !== videoId);
                          updatePlaylist.mutate({
                            id: editing.id,
                            patch: { videoIds: next },
                          });
                          setEditing({ ...editing, videoIds: next });
                        }}
                      >
                        Remove
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-fg">Add from your channel</p>
              <ul className="nx-scrollbar max-h-56 space-y-1 overflow-y-auto">
                {videos
                  .filter((video) => !editing.videoIds.includes(video.id))
                  .map((video) => (
                    <li key={video.id}>
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...editing.videoIds, video.id];
                          updatePlaylist.mutate({
                            id: editing.id,
                            patch: { videoIds: next },
                          });
                          setEditing({ ...editing, videoIds: next });
                        }}
                        className="flex w-full items-center gap-3 rounded px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
                      >
                        <IconPlus className="size-4 shrink-0 text-fg-subtle" />
                        <span className="min-w-0 flex-1 truncate text-sm text-fg">
                          {video.title}
                        </span>
                        <span className="shrink-0 text-xs text-fg-subtle nx-tnum">
                          {formatDuration(video.durationSeconds)}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Create series (real channels only) */}
      <Modal
        open={createSeriesOpen}
        onClose={() => setCreateSeriesOpen(false)}
        title="New series"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateSeriesOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={createSeries.isPending}
              disabled={seriesTitle.trim().length < 2}
              onClick={async () => {
                await createSeries.mutateAsync({ title: seriesTitle.trim(), description: seriesDescription });
                setCreateSeriesOpen(false);
                setSeriesTitle("");
                setSeriesDescription("");
                toast({ title: "Series created" });
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title" htmlFor="ser-title" required>
            <Input
              id="ser-title"
              value={seriesTitle}
              onChange={(event) => setSeriesTitle(event.target.value)}
              placeholder="Statistics for decisions"
            />
          </Field>
          <Field label="Description" htmlFor="ser-desc">
            <Textarea
              id="ser-desc"
              value={seriesDescription}
              onChange={(event) => setSeriesDescription(event.target.value)}
              rows={3}
            />
          </Field>
          <p className="text-xs text-fg-subtle">
            Assign episodes to this series — and their season/episode numbers — from the upload
            wizard&rsquo;s Metadata step.
          </p>
        </div>
      </Modal>
    </>
  );
}
