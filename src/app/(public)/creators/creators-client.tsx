"use client";

import { IconSearch, IconUsersGroup } from "@tabler/icons-react";
import * as React from "react";
import { ChannelCard } from "@/components/channel/channel-card";
import { EmptyState, Skeleton } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { CHANNEL_KIND_LABELS } from "@/lib/mock-api/data/channels";
import { useChannels } from "@/lib/mock-api/hooks";
import type { ChannelKind } from "@/lib/mock-api/types";
import { cn } from "@/lib/utils";

export function CreatorsClient() {
  const { data: channels, isLoading } = useChannels();
  const [query, setQuery] = React.useState("");
  const [kind, setKind] = React.useState<ChannelKind | null>(null);

  const kindsPresent = React.useMemo(
    () => Array.from(new Set((channels ?? []).map((c) => c.kind))),
    [channels],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return (channels ?? []).filter((channel) => {
      if (kind && channel.kind !== kind) return false;
      if (!q) return true;
      return (
        channel.name.toLowerCase().includes(q) ||
        (channel.handle?.toLowerCase().includes(q) ?? false) ||
        (channel.tagline?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [channels, query, kind]);

  return (
    <div>
      <section className="border-b border-border px-4 py-7 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-xl font-semibold text-fg sm:text-2xl">
              Creators &amp; channels
            </h1>
            <p className="mt-1 max-w-xl text-xs text-fg-muted">
              Browse every publisher on Nexus — independent creators, studios, businesses,
              educators and public organisations.
            </p>
          </div>
          <span className="text-2xs font-medium text-fg-subtle">
            {isLoading ? "Loading…" : `${filtered.length} of ${channels?.length ?? 0} channels`}
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            leading={<IconSearch />}
            placeholder="Search creators, businesses, handles…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="sm:max-w-xs"
          />
          <div className="flex flex-wrap gap-1.5">
            <KindChip active={kind === null} onClick={() => setKind(null)}>
              All
            </KindChip>
            {kindsPresent.map((k) => (
              <KindChip key={k} active={kind === k} onClick={() => setKind(k)}>
                {CHANNEL_KIND_LABELS[k]}
              </KindChip>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-6 sm:px-6 lg:px-8">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="h-44 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<IconUsersGroup />}
            title="No channels match"
            description="Try a different search term or clear the filter."
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((channel) => (
              <ChannelCard key={channel.id} channel={channel} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function KindChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-accent bg-accent/10 font-medium text-accent-hover"
          : "border-border bg-surface-2 text-fg-muted hover:border-border-strong hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
