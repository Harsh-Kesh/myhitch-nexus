"use client";

import { IconAlertTriangle, IconGavel } from "@tabler/icons-react";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { EmptyState, RailSkeleton } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";

interface CopyrightCase {
  id: string;
  reference: string;
  videoId: string;
  videoTitle: string;
  channelName: string;
  status: "open" | "counter-notice-received" | "escalated" | "upheld" | "rejected" | "restored";
  claimantName: string;
  claimantOrganization: string | null;
  workDescription: string;
  infringementDescription: string;
  counterNoticeStatement: string | null;
  counterNoticeSubmittedAt: string | null;
  restorationEligibleAt: string | null;
  decisionReason: string | null;
  createdAt: string;
}

const STATUS_LABEL: Record<CopyrightCase["status"], string> = {
  open: "Awaiting your response",
  "counter-notice-received": "Counter-notice filed",
  escalated: "Escalated for legal review",
  upheld: "Claim upheld — video stays restricted",
  rejected: "Claim rejected — video restored",
  restored: "Video restored",
};

const STATUS_TONE: Record<CopyrightCase["status"], "danger" | "warning" | "published" | "archived"> = {
  open: "danger",
  "counter-notice-received": "warning",
  escalated: "warning",
  upheld: "danger",
  rejected: "published",
  restored: "published",
};

/** Real copyright cases against any of the account's channels — no mock counterpart to
 * preserve a signature for, same reasoning as studio/revenue's usePayoutStatus(). This
 * is currently the only way a creator learns a video was restricted over a copyright
 * claim, since no email/SMS provider is wired up yet (TPI-2). */
function useMyCopyrightCases() {
  return useQuery({
    queryKey: ["copyright-cases", "mine"],
    queryFn: async (): Promise<CopyrightCase[]> => {
      const res = await fetch("/api/copyright/cases/mine/");
      if (!res.ok) throw new Error("Failed to load copyright cases.");
      const data = (await res.json()) as { items: CopyrightCase[] };
      return data.items;
    },
  });
}

function useSubmitCounterNotice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, statement }: { caseId: string; statement: string }) => {
      const res = await fetch(`/api/copyright/cases/${caseId}/counter-notice/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statement }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not submit the counter-notice.");
      }
      return res.json() as Promise<CopyrightCase>;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["copyright-cases", "mine"] }),
  });
}

export default function CopyrightPage() {
  const { data: cases = [], isLoading } = useMyCopyrightCases();
  const [counterNoticing, setCounterNoticing] = React.useState<CopyrightCase | null>(null);

  if (isLoading) return <RailSkeleton count={2} />;

  return (
    <div className="space-y-4">
      {cases.length === 0 ? (
        <EmptyState
          icon={<IconGavel />}
          title="No copyright cases"
          description="Claims filed against any of your channels' videos will appear here, along with your right to file a counter-notice."
        />
      ) : (
        cases.map((item) => (
          <Card key={item.id}>
            <CardHeader
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {item.videoTitle}
                  <Badge tone={STATUS_TONE[item.status]} size="sm">
                    {STATUS_LABEL[item.status]}
                  </Badge>
                </span>
              }
              description={`${item.reference} · ${item.channelName} · filed ${formatDate(item.createdAt, "long")}`}
            />
            <CardBody className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Claim</p>
                <p className="mt-1 text-sm text-fg-muted">
                  From {item.claimantName}
                  {item.claimantOrganization ? ` (${item.claimantOrganization})` : ""}: {item.infringementDescription}
                </p>
              </div>

              {item.counterNoticeStatement ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                    Your counter-notice
                  </p>
                  <p className="mt-1 text-sm text-fg-muted">{item.counterNoticeStatement}</p>
                  {item.restorationEligibleAt ? (
                    <p className="mt-1 text-xs text-fg-subtle">
                      Eligible for restoration from {formatDate(item.restorationEligibleAt, "long")} if not
                      escalated.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {item.decisionReason ? (
                <p className="flex items-start gap-2 rounded border border-border bg-surface-2 p-3 text-xs leading-relaxed text-fg-muted">
                  <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
                  {item.decisionReason}
                </p>
              ) : null}

              {item.status === "open" ? (
                <div className="flex justify-end border-t border-border pt-3">
                  <Button variant="secondary" size="sm" onClick={() => setCounterNoticing(item)}>
                    File a counter-notice
                  </Button>
                </div>
              ) : null}
            </CardBody>
          </Card>
        ))
      )}

      <CounterNoticeModal item={counterNoticing} onClose={() => setCounterNoticing(null)} />
    </div>
  );
}

function CounterNoticeModal({ item, onClose }: { item: CopyrightCase | null; onClose: () => void }) {
  const { toast } = useToast();
  const submit = useSubmitCounterNotice();
  const [statement, setStatement] = React.useState("");

  React.useEffect(() => {
    setStatement("");
  }, [item]);

  return (
    <Modal
      open={Boolean(item)}
      onClose={onClose}
      title="File a counter-notice"
      description="Explain, in good faith, why this video doesn't infringe the claimed work. The video stays restricted until the claimant's response window closes or an admin decides."
      size="md"
    >
      <div className="space-y-4">
        <Textarea
          rows={5}
          placeholder="I have a good-faith belief this content was removed as a result of a mistake or misidentification..."
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
        />
        <Button
          className="w-full"
          disabled={!statement.trim()}
          loading={submit.isPending}
          onClick={async () => {
            if (!item) return;
            try {
              await submit.mutateAsync({ caseId: item.id, statement: statement.trim() });
              toast({ title: "Counter-notice filed", description: "The claimant now has a response window before restoration." });
              onClose();
            } catch (err) {
              toast({
                title: "Couldn't file the counter-notice",
                description: err instanceof Error ? err.message : undefined,
                tone: "error",
              });
            }
          }}
        >
          Submit counter-notice
        </Button>
      </div>
    </Modal>
  );
}
