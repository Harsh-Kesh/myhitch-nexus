"use client";

import { IconArrowLeft, IconExternalLink } from "@tabler/icons-react";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { MagazineStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import {
  useMagazineArticle,
  useSubmitMagazineArticle,
  useUpdateMagazineArticle,
  useWithdrawMagazineArticle,
} from "@/lib/mock-api/hooks";

const EDITABLE_STATUSES = new Set(["draft", "changes_requested"]);

export default function MagazineArticleEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const { toast } = useToast();

  const { data: article, isLoading } = useMagazineArticle(id);
  const updateArticle = useUpdateMagazineArticle(id);
  const submitArticle = useSubmitMagazineArticle(id);
  const withdrawArticle = useWithdrawMagazineArticle(id);

  const [aboutTitle, setAboutTitle] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [dek, setDek] = React.useState("");
  const [bodyHtml, setBodyHtml] = React.useState("");

  React.useEffect(() => {
    if (!article) return;
    setAboutTitle(article.aboutTitle);
    setTitle(article.title);
    setDek(article.dek ?? "");
    setBodyHtml(article.bodyHtml);
  }, [article]);

  if (isLoading) return null;
  if (!article) {
    return (
      <PageBody>
        <p className="text-sm text-fg-muted">Article not found.</p>
      </PageBody>
    );
  }

  const editable = EDITABLE_STATUSES.has(article.status);

  const save = async () => {
    try {
      await updateArticle.mutateAsync({ aboutTitle, title, dek: dek || null, bodyHtml });
      toast({ title: "Draft saved" });
    } catch (error) {
      toast({
        title: "Couldn't save",
        description: error instanceof Error ? error.message : undefined,
        tone: "error",
      });
    }
  };

  const submit = async () => {
    try {
      await save();
      await submitArticle.mutateAsync();
      toast({ title: "Sent for editorial review" });
    } catch (error) {
      toast({
        title: "Couldn't submit",
        description: error instanceof Error ? error.message : undefined,
        tone: "error",
      });
    }
  };

  const withdraw = async () => {
    try {
      await withdrawArticle.mutateAsync();
      toast({ title: "Article withdrawn" });
      router.push("/studio/magazine");
    } catch (error) {
      toast({
        title: "Couldn't withdraw",
        description: error instanceof Error ? error.message : undefined,
        tone: "error",
      });
    }
  };

  return (
    <>
      <PageHeader
        title={article.title || "Untitled analysis"}
        description={`About ${article.aboutTitle}`}
        actions={
          <div className="flex items-center gap-2">
            <MagazineStatusBadge status={article.status} />
            <Button variant="secondary" size="sm" href="/studio/magazine">
              <IconArrowLeft />
              Back
            </Button>
          </div>
        }
      />

      <PageBody className="space-y-5">
        {article.status === "changes_requested" && article.reviewerNotes ? (
          <Card className="border-warning/30 bg-warning/5">
            <CardBody>
              <p className="text-sm font-medium text-fg">Editorial notes</p>
              <p className="mt-1 text-sm text-fg-muted">{article.reviewerNotes}</p>
            </CardBody>
          </Card>
        ) : null}
        {article.status === "rejected" && article.reviewerNotes ? (
          <Card className="border-danger/30 bg-danger/5">
            <CardBody>
              <p className="text-sm font-medium text-fg">Not published</p>
              <p className="mt-1 text-sm text-fg-muted">{article.reviewerNotes}</p>
            </CardBody>
          </Card>
        ) : null}
        {article.status === "published" ? (
          <Card className="border-live/30 bg-live/5">
            <CardBody className="flex items-center justify-between gap-3">
              <p className="text-sm text-fg">Live in the MYHitch magazine.</p>
              <Button variant="secondary" size="sm" href={`/magazine/${article.slug}`}>
                <IconExternalLink />
                View published page
              </Button>
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title="Analysis"
            description={
              editable
                ? "Written as your own perspective as the filmmaker — labelled that way when published."
                : "This piece is no longer editable in its current status."
            }
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name of the film or project" htmlFor="ed-about" required>
                <Input
                  id="ed-about"
                  value={aboutTitle}
                  onChange={(event) => setAboutTitle(event.target.value)}
                  disabled={!editable}
                />
              </Field>
              <Field label="Article title" htmlFor="ed-title" required>
                <Input
                  id="ed-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={!editable}
                />
              </Field>
            </div>
            <Field label="Short summary" htmlFor="ed-dek">
              <Textarea
                id="ed-dek"
                value={dek}
                onChange={(event) => setDek(event.target.value)}
                rows={2}
                maxLength={300}
                disabled={!editable}
              />
            </Field>
            <Field label="Body">
              <RichTextEditor value={bodyHtml} onChange={setBodyHtml} editable={editable} />
            </Field>

            {editable ? (
              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <Button variant="ghost" loading={withdrawArticle.isPending} onClick={withdraw}>
                  Discard
                </Button>
                <Button variant="secondary" loading={updateArticle.isPending} onClick={save}>
                  Save draft
                </Button>
                <Button variant="primary" loading={submitArticle.isPending} onClick={submit}>
                  Submit for review
                </Button>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}
