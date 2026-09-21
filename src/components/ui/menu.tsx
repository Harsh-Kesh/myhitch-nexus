"use client";

import Link from "next/link";
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface MenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  align?: "start" | "end";
  side?: "top" | "bottom";
  className?: string;
  panelClassName?: string;
  label?: string;
}

interface MenuPosition {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

/**
 * Lightweight popover menu. Closes on outside click, Escape, item activation
 * or scroll. Intentionally not a full roving-focus menubar — the app only
 * needs single-level menus.
 */
export function Menu({
  trigger,
  children,
  align = "end",
  side = "bottom",
  className,
  panelClassName,
  label,
}: MenuProps) {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<MenuPosition | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  // The panel portals to document.body and is positioned in fixed/viewport
  // coordinates from the trigger's own box (containerRef wraps only the trigger,
  // with no padding, so its rect matches the trigger's) — rendering it as a normal
  // child here, absolutely positioned, meant it got silently clipped by any
  // ancestor with overflow:hidden/auto, which is exactly what every DataTable
  // wrapper sets for its own horizontal scrolling. A per-row "Actions" menu inside
  // a table opened but was invisible (or only partly visible, "in the table")
  // until scrolled to the one spot where the clipped viewport happened to include
  // it. Found live 2026-09-21.
  React.useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gap = 8; // mt-2/mb-2's 0.5rem, matched here since spacing is now inline style too
    setPosition(
      side === "bottom"
        ? {
            top: rect.bottom + gap,
            ...(align === "end" ? { right: window.innerWidth - rect.right } : { left: rect.left }),
          }
        : {
            bottom: window.innerHeight - rect.top + gap,
            ...(align === "end" ? { right: window.innerWidth - rect.right } : { left: rect.left }),
          },
    );
  }, [open, side, align]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    // Closes rather than re-tracking position on scroll/resize — simpler than
    // live-repositioning, and correct here since nothing this menu is attached to
    // needs to stay open while its own scroll container moves.
    const onViewportChange = () => setOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [open]);

  const close = React.useCallback(() => setOpen(false), []);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* aria-haspopup/aria-expanded belong on the actual interactive trigger
          element (always a real <button> or button-like component at every call
          site), not this wrapper — a plain <div> has no implicit role, so those
          attributes were invalid there (found by the real axe-core scan in
          e2e/accessibility.spec.ts), and a div is never keyboard-operable anyway. */}
      {React.isValidElement(trigger)
        ? React.cloneElement(trigger as React.ReactElement<Record<string, unknown>>, {
            onClick: () => setOpen((current) => !current),
            "aria-haspopup": "menu",
            "aria-expanded": open,
            // Only override the trigger's own aria-label when Menu was given one —
            // several call sites (e.g. a per-row "Actions" button) rely entirely on
            // the trigger's own aria-label, and cloneElement would otherwise
            // overwrite it with `undefined`, silently deleting its accessible name.
            ...(label ? { "aria-label": label } : {}),
          })
        : trigger}
      {open && position
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              onClick={(event) => {
                // Any activation inside closes the menu unless it opts out.
                const target = event.target as HTMLElement;
                if (!target.closest("[data-menu-keep-open]")) close();
              }}
              style={position}
              className={cn(
                "fixed z-40 min-w-52 rounded-lg border border-border bg-surface-2 p-1 shadow-lg",
                side === "bottom" ? "animate-slide-down" : "animate-slide-up",
                panelClassName,
              )}
            >
              {typeof children === "function" ? children(close) : children}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function MenuItem({
  children,
  href,
  onClick,
  icon,
  danger,
  active,
  disabled,
  trailing,
  className,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const classes = cn(
    "flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm transition-colors [&_svg]:size-4",
    danger ? "text-danger hover:bg-danger/10" : "text-fg-muted hover:bg-surface-3 hover:text-fg",
    active && "bg-surface-3 text-fg",
    disabled && "pointer-events-none opacity-45",
    className,
  );

  const content = (
    <>
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing ? <span className="shrink-0 text-fg-subtle">{trailing}</span> : null}
    </>
  );

  if (href) {
    return (
      <Link role="menuitem" href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button role="menuitem" type="button" onClick={onClick} className={classes}>
      {content}
    </button>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-fg-subtle">
      {children}
    </p>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-border" />;
}
