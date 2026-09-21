"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: React.ReactNode;
  count?: number;
  icon?: React.ReactNode;
}

/** Controlled tab bar for in-page switching. */
export function Tabs({
  items,
  value,
  onChange,
  className,
  variant = "underline",
}: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  variant?: "underline" | "pill";
}) {
  return (
    <div
      role="tablist"
      className={cn(
        // nx-rail (built for horizontally-scrolling media rails) hides its own
        // scrollbar — fine for a row of video cards, but a tab bar that silently
        // scrolls off-screen with no visible scrollbar means a tab can exist and
        // just never be seen, with no indication there's more to the right. Wrapping
        // instead means every tab is always visible, at the cost of two lines on a
        // narrow viewport instead of one — a trade worth making for a nav element.
        "flex flex-wrap items-center gap-1",
        variant === "underline" && "border-b border-border",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "relative inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium transition-colors [&_svg]:size-4",
              variant === "underline"
                ? cn(
                    "px-3 pb-2.5 pt-2",
                    active
                      ? "text-fg after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent"
                      : "text-fg-muted hover:text-fg",
                  )
                : cn(
                    "h-8 rounded-full px-3.5",
                    active
                      ? "bg-accent text-accent-fg"
                      : "bg-surface-2 text-fg-muted hover:bg-surface-3 hover:text-fg",
                  ),
            )}
          >
            {item.icon}
            {item.label}
            {item.count != null ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-2xs nx-tnum",
                  active && variant === "pill"
                    ? "bg-accent-fg/15 text-accent-fg"
                    : "bg-surface-3 text-fg-subtle",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Route-driven variant used for the studio/admin/account section navs. */
export function NavTabs({
  items,
  className,
}: {
  items: Array<{ href: string; label: React.ReactNode; icon?: React.ReactNode; count?: number }>;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    // Same reasoning as Tabs above — wraps instead of silently scrolling off-screen
    // with a hidden scrollbar, which is exactly how a real nav tab (e.g. account
    // Copyright, 6th of 8) could exist and just never be visible.
    <div className={cn("flex flex-wrap items-center gap-1 border-b border-border", className)}>
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/" && pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex items-center gap-2 whitespace-nowrap px-3 pb-2.5 pt-2 text-sm font-medium transition-colors [&_svg]:size-4",
              active
                ? "text-fg after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent"
                : "text-fg-muted hover:text-fg",
            )}
          >
            {item.icon}
            {item.label}
            {item.count != null && item.count > 0 ? (
              <span className="rounded-full bg-accent px-1.5 text-2xs font-semibold text-accent-fg nx-tnum">
                {item.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
