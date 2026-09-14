import type { Metadata } from "next";
import { cache } from "react";
import { channels } from "@/lib/mock-api/data/channels";
import { looksLikeRealId } from "@/lib/mock-api";
import { getChannelById } from "@/lib/server/catalogue";
import { absoluteUrl } from "@/lib/utils";
import { ChannelClient } from "./channel-client";

export function generateStaticParams() {
  return channels.map((c) => ({ id: c.id }));
}

interface ChannelMeta {
  name: string;
  tagline: string | null;
  about: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
}

// Shared by generateMetadata and the page body — see the identical pattern (and the
// reasoning for the real/mock split) in ../../video/[id]/page.tsx.
const resolveChannelMeta = cache(async (id: string): Promise<ChannelMeta | null> => {
  if (looksLikeRealId(id)) {
    const channel = await getChannelById(id);
    if (!channel) return null;
    return {
      name: channel.name,
      tagline: channel.tagline,
      about: channel.about,
      avatarUrl: channel.avatarUrl,
      bannerUrl: channel.bannerUrl,
    };
  }
  const mock = channels.find((c) => c.id === id || c.handle === id);
  if (!mock) return null;
  return {
    name: mock.name,
    tagline: mock.tagline,
    about: mock.about,
    avatarUrl: mock.avatarUrl ?? null,
    bannerUrl: mock.bannerUrl ?? null,
  };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const channel = await resolveChannelMeta(id);
  if (!channel) return { title: "Channel not found" };

  const description = channel.tagline || channel.about?.slice(0, 160) || undefined;
  const image = channel.bannerUrl ?? channel.avatarUrl ?? undefined;

  return {
    title: channel.name,
    description,
    openGraph: {
      title: channel.name,
      description,
      type: "profile",
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: channel.name,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const channel = await resolveChannelMeta(id);

  const jsonLd = channel
    ? {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: channel.name,
        description: channel.tagline || channel.about || undefined,
        logo: absoluteUrl(channel.avatarUrl),
        image: absoluteUrl(channel.bannerUrl),
      }
    : null;

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          // Structured data for search engines — see FR-6.1.7 in the SRS.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
      <ChannelClient />
    </>
  );
}
