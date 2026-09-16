"use client";

import { IconNews, IconPlus } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { MagazineStatusBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { looksLikeRealId } from "@/lib/mock-api";
import {
  useChannelVideos,
  useCreateMagazineArticle,
  useCurrentUser,
  useMyMagazineArticles,
} from "@/lib/mock-api/hooks";
import { relativeTime } from "@/lib/utils";

export default function StudioMagazinePage() {
  const { data: user } = useCurrentUser();
  const channelId = user?.channelId ?? "";

  const { data: articles = [], isLoading } = useMyMagazineArticles();
  const { data: videos = [] } = useChannelVideos(channelId, true);
  const createArticle = useCreateMagazineArticle();
  const { toast } = useToast();
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [aboutTitle, setAboutTitle] = React.useState("");
  const [videoId, setVideoId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [dek, setDek] = React.useState("");

  // A real video to link is a bonus, not a requirement — real video publishing is still
  // mock (docs/DEVELOPMENT-PLAN.md), so most real accounts have nothing eligible here
  // yet. The film is always named via aboutTitle regardless of whether one can be linked.
  const eligibleVideos = videos.filter((video) => looksLikeRealId(video.id));

  const startNew = async () => {
    try {
      const article = await createArticle.mutateAsync({
        aboutTitle: aboutTitle.trim(),
        videoId: videoId || undefined,
        title: title.trim(),
        dek: dek.trim() || undefined,
      });
      setOpen(false);
      setAboutTitle("");
      setVideoId("");
      setTitle("");
      setDek("");
      router.push(`/studio/magazine/${article.id}`);
    } catch (error) {
      toast({
        title: "Couldn't start the analysis",
        description: error instanceof Error ? error.message : undefined,
        tone: "error",
      });
    }
  };

  return (
    <>
      <PageHeader
        title="Magazine"
        description="Write a full analysis of your film or project, with a trailer alongside it if you have one — published to the MYHitch magazine after editorial review."
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <IconPlus />
            New analysis
          </Button>
        }
      />

      <PageBody className="space-y-4">
        {isLoading ? null : articles.length === 0 ? (
          <EmptyState
            icon={<IconNews />}
            title="No analyses yet"
            description="Pick one of your own uploads and write about it — the story behind it, what you were going for, why it deserves a sponsor's attention."
            action={{ label: "Start writing", onClick: () => setOpen(true) }}
          />
        ) : (
          <div className="space-y-3">
            {articles.map((article) => (
              <Card key={article.id}>
                <CardBody className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{article.title}</p>
                    <p className="mt-0.5 truncate text-xs text-fg-muted">
                      About <span className="text-fg">{article.aboutTitle}</span> · updated{" "}
                      {relativeTime(article.updatedAt)}
                    </p>
                    {article.status === "changes_requested" && article.reviewerNotes ? (
                      <p className="mt-1.5 rounded bg-warning/10 px-2 py-1 text-xs text-warning">
                        Editor&rsquo;s note: {article.reviewerNotes}
                      </p>
                    ) : null}
                    {article.status === "rejected" && article.reviewerNotes ? (
                      <p className="mt-1.5 rounded bg-danger/10 px-2 py-1 text-xs text-danger">
                        {article.reviewerNotes}
                      </p>
                    ) : null}
                  </div>
                  <MagazineStatusBadge status={article.status} />
                  <Button variant="secondary" size="sm" href={`/studio/magazine/${article.id}`}>
                    {article.status === "draft" || article.status === "changes_requested" ? "Continue writing" : "View"}
                  </Button>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </PageBody>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New analysis"
        description="Every analysis is written as the filmmaker's own perspective — it's labelled that way when published, not presented as independent criticism."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={createArticle.isPending}
              disabled={!aboutTitle.trim() || title.trim().length < 3}
              onClick={startNew}
            >
              Start writing
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name of the film or project" htmlFor="mag-about" required>
            <Input
              id="mag-about"
              value={aboutTitle}
              onChange={(event) => setAboutTitle(event.target.value)}
              placeholder="The Saltmarsh"
            />
          </Field>
          {eligibleVideos.length > 0 ? (
            <Field
              label="Link one of your uploads (optional)"
              htmlFor="mag-video"
              hint="Readers can jump straight from the article to the film."
            >
              <Select id="mag-video" value={videoId} onChange={(event) => setVideoId(event.target.value)}>
                <option value="">Don&rsquo;t link an upload</option>
                {eligibleVideos.map((video) => (
                  <option key={video.id} value={video.id}>
                    {video.title}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Title" htmlFor="mag-title" required>
            <Input
              id="mag-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Why we shot the ending three times"
            />
          </Field>
          <Field label="Short summary" htmlFor="mag-dek" hint="Shown in the magazine index, under the title.">
            <Textarea
              id="mag-dek"
              value={dek}
              onChange={(event) => setDek(event.target.value)}
              rows={2}
              maxLength={300}
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
