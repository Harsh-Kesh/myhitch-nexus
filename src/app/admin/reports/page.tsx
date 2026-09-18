"use client";

import {
  IconAlertTriangle,
  IconGavel,
  IconMessagePlus,
  IconScale,
  IconShieldLock,
  IconWallet,
} from "@tabler/icons-react";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { useAddCaseNote, useCases } from "@/lib/mock-api/hooks";
import type { AdminCase } from "@/lib/mock-api/types";
import { cn, formatDate, formatDateTime, relativeTime } from "@/lib/utils";

interface RealCopyrightCase {
  id: string;
  reference: string;
  videoId: string;
  videoTitle: string;
  channelId: string;
  channelName: string;
  status: "open" | "counter-notice-received" | "escalated" | "upheld" | "rejected" | "restored";
  claimantName: string;
  claimantEmail: string;
  claimantOrganization: string | null;
  workDescription: string;
  infringementDescription: string;
  counterNoticeStatement: string | null;
  counterNoticeSubmittedAt: string | null;
  restorationEligibleAt: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  createdAt: string;
}

const COPYRIGHT_STATUS_TONE: Record<RealCopyrightCase["status"], "danger" | "warning" | "info" | "published"> = {
  open: "danger",
  "counter-notice-received": "warning",
  escalated: "warning",
  upheld: "danger",
  rejected: "published",
  restored: "published",
};

const DECIDABLE_STATUSES: RealCopyrightCase["status"][] = ["open", "counter-notice-received", "escalated"];

/** Real copyright cases — no mock counterpart to preserve a signature for, same
 * "new real-only feature, raw useQuery" pattern as studio/revenue's usePayoutStatus().
 * legal/safety/payment stay mock below: no real backing exists for those domains, same
 * "nothing downstream reads it yet" reasoning as the six still-mock platform config
 * tables. */
function useRealCopyrightCases() {
  return useQuery({
    queryKey: ["admin-copyright-cases"],
    queryFn: async (): Promise<RealCopyrightCase[]> => {
      const res = await fetch("/api/admin/copyright-cases/");
      if (!res.ok) throw new Error("Failed to load copyright cases.");
      const data = (await res.json()) as { items: RealCopyrightCase[] };
      return data.items;
    },
  });
}

function useDecideCopyrightCase() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseId, decision, reason }: { caseId: string; decision: string; reason: string }) => {
      const res = await fetch(`/api/admin/copyright-cases/${caseId}/action/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not decide the case.");
      }
      return res.json() as Promise<{ strikeIssued: boolean; accountSuspended: boolean }>;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin-copyright-cases"] }),
  });
}

const DOMAIN_META: Record<
  AdminCase["domain"],
  { label: string; icon: React.ReactNode; tone: "danger" | "warning" | "info" | "accent" }
> = {
  legal: { label: "Legal", icon: <IconScale />, tone: "info" },
  safety: { label: "Trust & safety", icon: <IconShieldLock />, tone: "danger" },
  payment: { label: "Payment", icon: <IconWallet />, tone: "warning" },
  copyright: { label: "Copyright", icon: <IconGavel />, tone: "accent" },
};

const STATUS_TONE = {
  open: "pending",
  investigating: "info",
  escalated: "warning",
  resolved: "published",
} as const;

export default function AdminCasesPage() {
  // legal/safety/payment domains only — copyright is real now, shown in its own section
  // below rather than force-fit into this mock timeline's shape.
  const { data: allCases = [] } = useCases();
  const cases = allCases.filter((item) => item.domain !== "copyright");
  const addNote = useAddCaseNote();
  const { toast } = useToast();

  const { data: copyrightCases = [] } = useRealCopyrightCases();
  const decideCopyright = useDecideCopyrightCase();
  const [decidingCase, setDecidingCase] = React.useState<RealCopyrightCase | null>(null);
  const [decision, setDecision] = React.useState<"reject-claim" | "uphold" | "escalate" | "restore">("reject-claim");
  const [decisionReason, setDecisionReason] = React.useState("");

  const [tab, setTab] = React.useState("open");
  const [noteFor, setNoteFor] = React.useState<AdminCase | null>(null);
  const [noteBody, setNoteBody] = React.useState("");
  const [noteKind, setNoteKind] = React.useState<"note" | "escalation" | "resolution">(
    "note",
  );

  const open = cases.filter((item) => item.status !== "resolved");
  const resolved = cases.filter((item) => item.status === "resolved");
  const shown = tab === "open" ? open : tab === "resolved" ? resolved : cases;

  const urgent = cases.filter(
    (item) => item.priority === "urgent" && item.status !== "resolved",
  );
  const copyrightOpen = copyrightCases.filter((item) => DECIDABLE_STATUSES.includes(item.status));

  return (
    <>
      <PageHeader
        title="Case management"
        description="Legal, safety, payment and copyright matters that need a documented decision trail."
      />

      <PageBody className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Open cases" value={String(open.length + copyrightOpen.length)} icon={<IconGavel />} />
          <Stat
            label="Urgent"
            value={String(urgent.length)}
            icon={<IconAlertTriangle />}
            invertDelta
          />
          <Stat
            label="Escalated"
            value={String(
              cases.filter((c) => c.status === "escalated").length +
                copyrightCases.filter((c) => c.status === "escalated").length,
            )}
          />
          <Stat label="Resolved" value={String(resolved.length)} />
        </div>

        {copyrightCases.length > 0 ? (
          <div className="space-y-3">
            <h2 className="font-display text-base font-semibold text-fg">Copyright claims</h2>
            {copyrightCases.map((item) => (
              <Card key={item.id}>
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      <code className="font-mono text-xs text-accent">{item.reference}</code>
                      {item.videoTitle}
                      <Badge tone={COPYRIGHT_STATUS_TONE[item.status]} size="sm">
                        {item.status.replace(/-/g, " ")}
                      </Badge>
                    </span>
                  }
                  description={`${item.channelName} · claim from ${item.claimantName}${item.claimantOrganization ? ` (${item.claimantOrganization})` : ""} · filed ${formatDate(item.createdAt, "long")}`}
                />
                <CardBody className="space-y-3">
                  <p className="text-sm text-fg-muted">{item.infringementDescription}</p>
                  {item.counterNoticeStatement ? (
                    <div className="rounded border border-border bg-surface-2 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                        Counter-notice
                      </p>
                      <p className="mt-1 text-sm text-fg-muted">{item.counterNoticeStatement}</p>
                      {item.restorationEligibleAt ? (
                        <p className="mt-1 text-xs text-fg-subtle">
                          Restoration-eligible from {formatDate(item.restorationEligibleAt, "long")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {item.decisionReason ? (
                    <p className="text-xs text-fg-subtle">Decision: {item.decisionReason}</p>
                  ) : null}
                  {DECIDABLE_STATUSES.includes(item.status) ? (
                    <div className="flex justify-end border-t border-border pt-3">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setDecidingCase(item);
                          setDecision("reject-claim");
                          setDecisionReason("");
                        }}
                      >
                        <IconGavel />
                        Decide
                      </Button>
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            ))}
          </div>
        ) : null}

        <h2 className="font-display text-base font-semibold text-fg">Legal, safety & payment cases</h2>
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "open", label: "Open", count: open.length },
            { value: "resolved", label: "Resolved", count: resolved.length },
            { value: "all", label: "All", count: cases.length },
          ]}
        />

        {shown.length === 0 ? (
          <EmptyState
            icon={<IconGavel />}
            title="No cases"
            description="Escalations from the review queue and finance appear here."
          />
        ) : (
          <div className="space-y-4">
            {shown.map((item) => {
              const meta = DOMAIN_META[item.domain];
              return (
                <Card key={item.id}>
                  <CardHeader
                    title={
                      <span className="flex flex-wrap items-center gap-2">
                        <code className="font-mono text-xs text-accent">
                          {item.reference}
                        </code>
                        {item.subject}
                      </span>
                    }
                    description={
                      <>
                        {item.owner} · opened {relativeTime(item.openedAt)} · related{" "}
                        <span className="font-mono">{item.relatedId}</span>
                      </>
                    }
                    action={
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={meta.tone} size="sm">
                          {meta.icon}
                          {meta.label}
                        </Badge>
                        <Badge tone={STATUS_TONE[item.status]} size="sm">
                          {item.status}
                        </Badge>
                        <Badge
                          tone={
                            item.priority === "urgent"
                              ? "danger"
                              : item.priority === "high"
                                ? "warning"
                                : "neutral"
                          }
                          size="sm"
                        >
                          {item.priority}
                        </Badge>
                      </div>
                    }
                  />
                  <CardBody className="space-y-4">
                    <ol className="space-y-0">
                      {item.notes.map((note, index) => (
                        <li key={note.id} className="relative flex gap-3 pb-4 last:pb-0">
                          {index < item.notes.length - 1 ? (
                            <span
                              aria-hidden
                              className="absolute left-[15px] top-9 h-[calc(100%-2rem)] w-px bg-border"
                            />
                          ) : null}
                          <Avatar name={note.author} size="sm" className="relative z-10" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-fg">
                                {note.author}
                              </span>
                              <Badge
                                tone={
                                  note.kind === "escalation"
                                    ? "warning"
                                    : note.kind === "resolution"
                                      ? "published"
                                      : "outline"
                                }
                                size="sm"
                              >
                                {note.kind}
                              </Badge>
                              <span
                                className="text-2xs text-fg-subtle nx-tnum"
                                title={formatDateTime(note.createdAt)}
                              >
                                {relativeTime(note.createdAt)}
                              </span>
                            </div>
                            <p className="mt-1 text-sm leading-relaxed text-fg-muted">
                              {note.body}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>

                    {item.status !== "resolved" ? (
                      <div className="border-t border-border pt-4">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setNoteFor(item);
                            setNoteBody("");
                            setNoteKind("note");
                          }}
                        >
                          <IconMessagePlus />
                          Add note or escalate
                        </Button>
                      </div>
                    ) : null}
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </PageBody>

      <Modal
        open={Boolean(noteFor)}
        onClose={() => setNoteFor(null)}
        title={`Add to ${noteFor?.reference ?? "case"}`}
        description={noteFor?.subject}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNoteFor(null)}>
              Cancel
            </Button>
            <Button
              variant={noteKind === "escalation" ? "danger" : "primary"}
              disabled={noteBody.trim().length < 8}
              loading={addNote.isPending}
              onClick={async () => {
                if (!noteFor) return;
                await addNote.mutateAsync({
                  caseId: noteFor.id,
                  body: noteBody.trim(),
                  kind: noteKind,
                });
                toast({
                  title:
                    noteKind === "escalation"
                      ? "Case escalated"
                      : noteKind === "resolution"
                        ? "Case resolved"
                        : "Note added",
                  description: "Recorded in the audit log.",
                  tone: noteKind === "escalation" ? "warning" : "success",
                });
                setNoteFor(null);
              }}
            >
              {noteKind === "escalation"
                ? "Escalate"
                : noteKind === "resolution"
                  ? "Resolve case"
                  : "Add note"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Entry type" htmlFor="note-kind">
            <Select
              id="note-kind"
              value={noteKind}
              onChange={(event) =>
                setNoteKind(event.target.value as typeof noteKind)
              }
            >
              <option value="note">Note — record progress</option>
              <option value="escalation">Escalation — raise to a senior owner</option>
              <option value="resolution">Resolution — close the case</option>
            </Select>
          </Field>

          <Field
            label="Details"
            htmlFor="note-body"
            required
            hint="Written to the case timeline and the platform audit log."
          >
            <Textarea
              id="note-body"
              value={noteBody}
              onChange={(event) => setNoteBody(event.target.value)}
              rows={4}
              placeholder={
                noteKind === "escalation"
                  ? "Escalating to external counsel for a fair-dealing opinion."
                  : noteKind === "resolution"
                    ? "Claimant withdrew the claim. Content restored."
                    : "Counter-notice received from the publisher."
              }
            />
          </Field>

          {noteKind === "resolution" ? (
            <p
              className={cn(
                "flex items-start gap-2 rounded border p-3 text-xs leading-relaxed",
                "border-success/30 bg-success/10 text-fg-muted",
              )}
            >
              <IconGavel className="mt-0.5 size-4 shrink-0 text-success" />
              Resolving closes the case. It stays readable in the archive and the
              audit log entry is permanent.
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(decidingCase)}
        onClose={() => setDecidingCase(null)}
        title={`Decide ${decidingCase?.reference ?? "case"}`}
        description={decidingCase?.videoTitle}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDecidingCase(null)}>
              Cancel
            </Button>
            <Button
              variant={decision === "uphold" ? "danger" : "primary"}
              disabled={!decisionReason.trim()}
              loading={decideCopyright.isPending}
              onClick={async () => {
                if (!decidingCase) return;
                try {
                  const result = await decideCopyright.mutateAsync({
                    caseId: decidingCase.id,
                    decision,
                    reason: decisionReason.trim(),
                  });
                  toast({
                    title:
                      decision === "uphold"
                        ? result.accountSuspended
                          ? "Claim upheld — account suspended (strike threshold reached)"
                          : "Claim upheld — a strike was issued"
                        : decision === "reject-claim"
                          ? "Claim rejected — video restored"
                          : decision === "restore"
                            ? "Video restored"
                            : "Case escalated for legal review",
                    tone: decision === "uphold" ? "warning" : "success",
                  });
                  setDecidingCase(null);
                } catch (err) {
                  toast({
                    title: "Couldn't decide the case",
                    description: err instanceof Error ? err.message : undefined,
                    tone: "error",
                  });
                }
              }}
            >
              Confirm decision
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Decision" htmlFor="copyright-decision">
            <Select
              id="copyright-decision"
              value={decision}
              onChange={(event) => setDecision(event.target.value as typeof decision)}
            >
              <option value="reject-claim">Reject claim — restore the video, no strike</option>
              <option value="uphold">Uphold claim — keep restricted, issue a strike</option>
              <option value="escalate">Escalate — hold for legal review</option>
              <option value="restore">Restore — counter-notice window passed uncontested</option>
            </Select>
          </Field>
          <Field label="Reason" htmlFor="copyright-reason" required hint="Written to the audit log.">
            <Textarea
              id="copyright-reason"
              rows={4}
              value={decisionReason}
              onChange={(event) => setDecisionReason(event.target.value)}
              placeholder="The claimed footage is a licensed stock clip; ownership confirmed via the declared rights holder."
            />
          </Field>
          {decision === "uphold" ? (
            <p className="flex items-start gap-2 rounded border border-danger/30 bg-danger/10 p-3 text-xs leading-relaxed text-fg-muted">
              <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
              Issues a real strike against the channel owner. Three strikes suspends the account.
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
