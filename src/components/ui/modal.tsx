"use client";

import { IconX } from "@tabler/icons-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Set on destructive confirmations so the header reads as a warning. */
  tone?: "default" | "danger";
}

const SIZES = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  tone = "default",
}: ModalProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  // onClose is almost always an inline arrow function at the call site (every modal in
  // this app does this, not just this one), so it gets a new identity on every render of
  // whatever owns `open`'s state — typing into a field inside the modal is exactly such a
  // render. A ref sidesteps that without asking every caller to memoize onClose: the
  // keydown handler always reads the latest one, but doesn't need to be in a dependency
  // array to do it. Found 2026-09-20 via a real, reported bug: typing in a modal field
  // re-ran this effect on every keystroke, re-arming the focus-first-field timeout below
  // and yanking focus back to the first input mid-word.
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key !== "Tab") return;
      // Trap focus: a modal that leaks focus to the page behind it is a
      // keyboard dead end.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>(
          'input, textarea, select, button:not([data-close])',
        )
        ?.focus();
    }, 40);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
    // Deliberately NOT depending on onClose — see onCloseRef above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-6">
      <div
        className="fixed inset-0 bg-overlay/80 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={cn(
          "relative z-10 w-full rounded-t-lg border border-border bg-surface shadow-lg animate-slide-up sm:rounded-lg",
          SIZES[size],
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              {title ? (
                <h2
                  id={titleId}
                  className={cn(
                    "font-display text-base font-semibold",
                    tone === "danger" ? "text-danger" : "text-fg",
                  )}
                >
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p className="mt-1 text-sm leading-relaxed text-fg-muted">
                  {description}
                </p>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Close"
              data-close
            >
              <IconX />
            </Button>
          </div>
        )}
        {children ? (
          <div className="nx-scrollbar max-h-[min(70vh,44rem)] overflow-y-auto px-5 py-4">
            {children}
          </div>
        ) : null}
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------- Confirm dialog ------------------------------ */

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "danger",
  loading,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  tone?: "default" | "danger";
  loading?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      tone={tone}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
