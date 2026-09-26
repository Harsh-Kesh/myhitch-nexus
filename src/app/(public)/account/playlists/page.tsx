"use client";

import { IconLock, IconPlaylist, IconPlus, IconTrash, IconUser, IconWorld } from "@tabler/icons-react";
import Link from "next/link";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState, RailSkeleton } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  useCreateMyPlaylist,
  useCurrentUser,
  useDeletePlaylist,
  useMyPlaylists,
} from "@/lib/mock-api/hooks";
import { formatDate } from "@/lib/utils";

const VISIBILITY_META = {
  public: { label: "Public", icon: <IconWorld className="size-3" /> },
  unlisted: { label: "Unlisted", icon: <IconWorld className="size-3" /> },
  private: { label: "Private", icon: <IconLock className="size-3" /> },
};

export default function PlaylistsPage() {
  const { data: user } = useCurrentUser();
  const { data: playlists = [], isLoading } = useMyPlaylists();
  const createPlaylist = useCreateMyPlaylist();
  const deletePlaylist = useDeletePlaylist();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  // Scope only matters once there's more than one real household profile to keep a
  // playlist private from — with zero or one profile, "just for me" and "everyone on
  // this account" mean the exact same thing, so the toggle would just be confusing.
  const [scope, setScope] = React.useState<"account" | "profile">("account");
  const canScopeToProfile = (user?.profiles.length ?? 0) > 1;
  const activeProfileName = user?.profiles.find((p) => p.id === user.activeProfileId)?.name;
  const profileNameById = new Map((user?.profiles ?? []).map((p) => [p.id, p.name]));

  const handleCreate = async () => {
    if (!title.trim()) return;
    try {
      await createPlaylist.mutateAsync({ title: title.trim(), scope: canScopeToProfile ? scope : "account" });
      setTitle("");
      setScope("account");
      setCreateOpen(false);
      toast({ title: "Playlist created" });
    } catch (err) {
      toast({
        tone: "error",
        title: "Couldn't create playlist",
        description: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    deletePlaylist.mutate(id, {
      onError: (err) =>
        toast({
          tone: "error",
          title: "Couldn't delete playlist",
          description: err instanceof Error ? err.message : "Something went wrong.",
        }),
    });
  };

  if (isLoading) return <RailSkeleton count={4} />;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-fg-muted nx-tnum">
          {playlists.length} {playlists.length === 1 ? "playlist" : "playlists"}
        </p>
        <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
          <IconPlus />
          New playlist
        </Button>
      </div>

      {playlists.length === 0 ? (
        <EmptyState
          icon={<IconPlaylist />}
          title="No playlists yet"
          description="Group videos into your own playlists — start one from here, or from the Save to playlist button on any video."
          action={{ label: "Create a playlist", onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {playlists.map((playlist) => {
            const meta = VISIBILITY_META[playlist.visibility];
            return (
              <Card key={playlist.id} className="group relative">
                <Link href={`/account/playlists/${playlist.id}/`}>
                  <CardBody>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="min-w-0 truncate font-medium text-fg">{playlist.title}</h3>
                      <div className="flex shrink-0 gap-1">
                        {playlist.profileId ? (
                          <Badge tone="outline" size="sm" className="gap-1">
                            <IconUser className="size-3" />
                            {profileNameById.get(playlist.profileId) ?? "Profile"}
                          </Badge>
                        ) : null}
                        <Badge tone="outline" size="sm" className="gap-1">
                          {meta.icon}
                          {meta.label}
                        </Badge>
                      </div>
                    </div>
                    {playlist.description ? (
                      <p className="mt-1 nx-clamp-2 text-xs text-fg-muted">{playlist.description}</p>
                    ) : null}
                    <p className="mt-3 text-xs text-fg-subtle nx-tnum">
                      {playlist.videoCount} {playlist.videoCount === 1 ? "video" : "videos"} · Updated{" "}
                      {formatDate(playlist.updatedAt)}
                    </p>
                  </CardBody>
                </Link>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${playlist.title}`}
                  className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => handleDelete(playlist.id, playlist.title)}
                >
                  <IconTrash className="size-4 text-danger" />
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New playlist" size="sm">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Playlist name"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
        />
        {canScopeToProfile ? (
          <div className="mt-4 space-y-1.5">
            <p className="text-xs font-medium text-fg-muted">Visible to</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setScope("account")}
                className={`flex-1 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  scope === "account" ? "border-accent bg-accent/10 text-fg" : "border-border text-fg-muted"
                }`}
              >
                <span className="block font-medium">Everyone</span>
                <span className="block text-xs text-fg-subtle">All profiles on this account</span>
              </button>
              <button
                type="button"
                onClick={() => setScope("profile")}
                className={`flex-1 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  scope === "profile" ? "border-accent bg-accent/10 text-fg" : "border-border text-fg-muted"
                }`}
              >
                <span className="block font-medium">Just me</span>
                <span className="block text-xs text-fg-subtle">
                  {activeProfileName ? `Only ${activeProfileName}` : "Only this profile"}
                </span>
              </button>
            </div>
          </div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={createPlaylist.isPending} disabled={!title.trim()} onClick={handleCreate}>
            Create
          </Button>
        </div>
      </Modal>
    </div>
  );
}
