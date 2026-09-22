import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { queryOne } from "@/lib/server/db";
import { EmbedPlayerClient } from "./embed-player-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const video = await queryOne<{ title: string }>(
    `select title from videos where id = $1`,
    [id],
  );
  return {
    title: video ? `${video.title} • MYHitch Player` : "MYHitch Video Player",
    robots: { index: false, follow: false },
  };
}

export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ theme?: string }>;
}) {
  const { id } = await params;
  const { theme } = await searchParams;

  const video = await queryOne<{
    id: string;
    title: string;
    synopsis: string | null;
    duration_seconds: number;
    thumbnail_url: string | null;
  }>(
    `select id, title, synopsis, duration_seconds, thumbnail_url from videos where id = $1`,
    [id],
  );

  if (!video) {
    notFound();
  }

  return (
    <EmbedPlayerClient
      video={{
        id: video.id,
        title: video.title,
        synopsis: video.synopsis,
        durationSeconds: video.duration_seconds,
        thumbnailUrl: video.thumbnail_url,
        sampleSrc: "/media/sample-1.mp4",
      }}
      theme={theme === "light" ? "light" : "dark"}
    />
  );
}
