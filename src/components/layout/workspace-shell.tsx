"use client";

import { IconChevronLeft, IconLogout, IconMenu2, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useLogout } from "@/lib/mock-api/hooks";
import { cn } from "@/lib/utils";
import { NexusMark } from "./logo";

export interface WorkspaceNavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

export interface WorkspaceNavGroup {
  title?: string;
  items: WorkspaceNavItem[];
}

/**
 * Shared chrome for Creator Studio, Business Studio and Admin. A persistent
 * left rail on desktop, a slide-over on mobile, and a page header slot.
 */
export function WorkspaceShell({
  workspace,
  groups,
  children,
  accentLabel,
  channels,
  activeChannelId,
  onSelectChannel,
}: {
  workspace: { title: string; href: string; subtitle?: string };
  groups: WorkspaceNavGroup[];
  children: React.ReactNode;
  accentLabel?: string;
  channels?: Array<{ id: string; name: string; role?: string }>;
  activeChannelId?: string;
  onSelectChannel?: (channelId: string) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const logout = useLogout();

  React.useEffect(() => setOpen(false), [pathname]);

  const handleSignOut = () => {
    logout.mutate(undefined, { onSuccess: () => router.push("/") });
  };

  const rail = (
    <div className="flex h-full flex-col">
      <div className="flex h-header shrink-0 items-center gap-2 border-b border-border px-4">
        <Link href="/" className="flex items-center gap-2" aria-label="MYHitch Nexus home">
          <NexusMark className="h-10 w-auto" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={workspace.href} className="block">
            <p className="truncate font-display text-sm font-semibold text-fg">
              {workspace.title}
            </p>
          </Link>
          {channels && channels.length > 1 ? (
            <select
              aria-label="Switch channel"
              value={activeChannelId}
              onChange={(e) => onSelectChannel?.(e.target.value)}
              className="mt-0.5 w-full rounded border border-border bg-surface-2 px-1 py-0.5 text-2xs text-fg font-medium focus:outline-none"
            >
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.name} {ch.role ? `(${ch.role})` : ""}
                </option>
              ))}
            </select>
          ) : workspace.subtitle ? (
            <p className="truncate text-2xs text-fg-subtle">{workspace.subtitle}</p>
          ) : null}
        </div>
      </div>

      <nav aria-label={workspace.title} className="nx-scrollbar flex-1 overflow-y-auto p-2.5">
        {groups.map((group, index) => (
          <div key={group.title ?? index} className={cn(index > 0 && "mt-5")}>
            {group.title ? (
              <p className="px-2.5 pb-1.5 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
                {group.title}
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== workspace.href && pathname.startsWith(`${item.href}/`));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded px-2.5 py-2 text-sm transition-colors [&_svg]:size-[18px]",
                        active
                          ? "bg-accent/10 font-medium text-accent"
                          : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                      )}
                    >
                      {item.icon}
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.badge != null && item.badge > 0 ? (
                        <span className="rounded-full bg-accent px-1.5 text-2xs font-semibold text-accent-fg nx-tnum">
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-border p-3">
        <Button variant="ghost" size="sm" href="/" block className="justify-start">
          <IconChevronLeft />
          Back to Nexus
        </Button>
        <Button
          variant="ghost"
          size="sm"
          block
          className="justify-start text-fg-muted hover:text-danger"
          loading={logout.isPending}
          onClick={handleSignOut}
        >
          <IconLogout />
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-rail shrink-0 border-r border-border bg-surface lg:block">
        <div className="sticky top-0 h-dvh">{rail}</div>
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-overlay/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-72 border-r border-border bg-surface animate-slide-down">
            {rail}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex h-header items-center gap-2 border-b border-border bg-bg/85 px-3 backdrop-blur-md lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open workspace navigation"
            onClick={() => setOpen(true)}
          >
            {open ? <IconX /> : <IconMenu2 />}
          </Button>
          <span className="font-display text-sm font-semibold text-fg">
            {workspace.title}
          </span>
          {accentLabel ? (
            <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-2xs font-medium text-accent">
              {accentLabel}
            </span>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            aria-label="Sign out"
            loading={logout.isPending}
            onClick={handleSignOut}
          >
            <IconLogout />
          </Button>
        </div>
        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Page header used inside every workspace route. */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-b border-border bg-surface/40", className)}>
      <div className="px-4 py-5 sm:px-6 lg:px-8">
        {breadcrumb ? <div className="mb-2">{breadcrumb}</div> : null}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold text-fg sm:text-2xl">
              {title}
            </h1>
            {description ? (
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-fg-muted">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
        {children ? <div className="mt-4">{children}</div> : null}
      </div>
    </div>
  );
}

export function PageBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-4 py-6 sm:px-6 lg:px-8", className)}>{children}</div>
  );
}
