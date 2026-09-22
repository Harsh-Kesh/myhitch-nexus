import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getClientReviewByToken } from "@/lib/server/enterprise";
import { ReviewClient } from "./review-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await getClientReviewByToken(token);
  if (!data) return { title: "Review Link Expired • MYHitch Nexus Enterprise" };
  return {
    title: `Review: ${data.review.title} • MYHitch Nexus Enterprise`,
    description: `Private video review for ${data.review.client_name}`,
    robots: { index: false, follow: false },
  };
}

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getClientReviewByToken(token);

  if (!data) {
    notFound();
  }

  return <ReviewClient initialData={data} token={token} />;
}
