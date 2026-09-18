"use client";

import { IconDownload, IconFileText } from "@tabler/icons-react";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Stat } from "@/components/ui/card";
import { EmptyState, TableSkeleton } from "@/components/ui/empty-state";
import { Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { looksLikeRealId } from "@/lib/mock-api";
import { useAuditLog, useCurrentUser } from "@/lib/mock-api/hooks";
import type { AuditLogEntry } from "@/lib/mock-api/types";
import { cn, formatDateTime, relativeTime } from "@/lib/utils";

const SEVERITY_TONE = {
  info: "neutral",
  notice: "info",
  warning: "warning",
  critical: "danger",
} as const;

export default function AuditLogPage() {
  const { data: user } = useCurrentUser();
  const isRealAdmin = Boolean(user?.id && looksLikeRealId(user.id));
  const [query, setQuery] = React.useState("");
  const [severity, setSeverity] = React.useState("");
  const [targetType, setTargetType] = React.useState("");
  const { toast } = useToast();

  const { data: entries = [], isLoading } = useAuditLog({
    query: query || undefined,
    severity: (severity || undefined) as AuditLogEntry["severity"] | undefined,
    targetType: targetType || undefined,
  });

  const { data: allEntries = [] } = useAuditLog();

  const targetTypes = Array.from(
    new Set(allEntries.map((entry) => entry.targetType)),
  ).sort();

  const counts = {
    critical: allEntries.filter((e) => e.severity === "critical").length,
    warning: allEntries.filter((e) => e.severity === "warning").length,
    notice: allEntries.filter((e) => e.severity === "notice").length,
  };

  return (
    <>
      <PageHeader
        title="Audit log"
        description="An immutable record of every administrative and publishing action. Filter by actor, severity or target."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              toast({
                title: "Export queued",
                description: "Mock JSONL export — nothing leaves the browser.",
                tone: "info",
              })
            }
          >
            <IconDownload />
            Export
          </Button>
        }
      />

      <PageBody className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Total entries" value={String(allEntries.length)} icon={<IconFileText />} />
          <Stat label="Critical" value={String(counts.critical)} invertDelta />
          <Stat label="Warning" value={String(counts.warning)} invertDelta />
          <Stat label="Notice" value={String(counts.notice)} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search action, actor, reason or target id"
            className="max-w-sm"
            sizeVariant="sm"
          />
          <Select
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
            sizeVariant="sm"
            className="w-40"
            aria-label="Filter by severity"
          >
            <option value="">All severities</option>
            <option value="info">Info</option>
            <option value="notice">Notice</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </Select>
          <Select
            value={targetType}
            onChange={(event) => setTargetType(event.target.value)}
            sizeVariant="sm"
            className="w-44"
            aria-label="Filter by target type"
          >
            <option value="">All target types</option>
            {targetTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
          {(query || severity || targetType) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setSeverity("");
                setTargetType("");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {isLoading ? (
          <TableSkeleton rows={10} cols={4} />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<IconFileText />}
            title="No matching entries"
            description="Try widening the filters."
          />
        ) : (
          <Card>
            <CardBody className="p-0">
              <ol className="divide-y divide-border">
                {entries.map((entry) => (
                  <li key={entry.id} className="flex gap-4 px-5 py-4">
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        entry.severity === "critical"
                          ? "bg-danger"
                          : entry.severity === "warning"
                            ? "bg-warning"
                            : entry.severity === "notice"
                              ? "bg-info"
                              : "bg-fg-subtle",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="font-mono text-xs font-medium text-accent">
                          {entry.action}
                        </code>
                        <Badge tone={SEVERITY_TONE[entry.severity]} size="sm">
                          {entry.severity}
                        </Badge>
                        <Badge tone="outline" size="sm">
                          {entry.targetType}
                        </Badge>
                      </div>

                      <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                        {entry.reason}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-fg-subtle">
                        <span>
                          <span className="text-fg-muted">{entry.actor}</span> ·{" "}
                          {entry.actorRole}
                        </span>
                        <span className="font-mono">{entry.targetId}</span>
                        <span className="font-mono">{entry.ip}</span>
                        <span className="nx-tnum" title={formatDateTime(entry.createdAt)}>
                          {relativeTime(entry.createdAt)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        )}

        <p className="text-xs leading-relaxed text-fg-subtle">
          {isRealAdmin
            ? "Recorded to a real, append-only log — nothing here is cleared on reload. A dedicated retention policy still needs defining before general availability."
            : "In production this log would be append-only and retained per the platform retention policy. Here it lives in browser memory and reseeds on reload."}
        </p>
      </PageBody>
    </>
  );
}
