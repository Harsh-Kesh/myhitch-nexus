"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface",
        interactive &&
          "transition-colors hover:border-border-strong hover:bg-surface-2",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  title,
  description,
  action,
  ...props
}: Omit<React.HTMLAttributes<HTMLDivElement>, "title"> & {
  // Omit the DOM `title` attribute so this can accept a node, not just a string.
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-border px-5 py-4",
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        {title ? (
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
        ) : null}
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function CardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 border-t border-border px-5 py-3.5",
        className,
      )}
      {...props}
    />
  );
}

/* ------------------------------ Stat tile -------------------------------- */

export interface StatProps {
  label: string;
  value: React.ReactNode;
  /** undefined: no delta for this stat at all (nothing renders). null: a delta exists
   * conceptually but there's no prior-period baseline to compare against — renders
   * "New" rather than a misleading "100%"/"0%". */
  delta?: number | null;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  /** Higher-is-worse metrics (reports, refunds) invert the delta colour. */
  invertDelta?: boolean;
}

export function Stat({
  label,
  value,
  delta,
  hint,
  icon,
  className,
  invertDelta,
}: StatProps) {
  const isNew = delta === null;
  const positive = typeof delta === "number" && (invertDelta ? delta < 0 : delta > 0);
  const negative = typeof delta === "number" && (invertDelta ? delta > 0 : delta < 0);

  return (
    <div className={cn("rounded-lg border border-border bg-surface p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
          {label}
        </p>
        {icon ? <span className="text-fg-subtle [&_svg]:size-4">{icon}</span> : null}
      </div>
      <p className="mt-2 font-display text-2xl font-semibold text-fg nx-tnum">
        {value}
      </p>
      <div className="mt-1 flex items-center gap-2">
        {delta !== undefined ? (
          <span
            className={cn(
              "text-xs font-medium nx-tnum",
              positive && "text-success",
              negative && "text-danger",
              !positive && !negative && "text-fg-subtle",
            )}
          >
            {isNew
              ? "New"
              : `${delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} ${Math.abs(delta).toFixed(1)}%`}
          </span>
        ) : null}
        {hint ? <span className="text-xs text-fg-subtle">{hint}</span> : null}
      </div>
    </div>
  );
}

/* ------------------------------ Section ---------------------------------- */

export function SectionHeader({
  title,
  description,
  action,
  className,
  as: Tag = "h2",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <Tag className="font-display text-lg font-semibold text-fg sm:text-xl">
          {title}
        </Tag>
        {description ? (
          <p className="mt-1 text-sm text-fg-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
