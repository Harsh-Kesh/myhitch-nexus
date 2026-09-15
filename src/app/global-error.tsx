"use client";

import * as Sentry from "@sentry/nextjs";
import * as React from "react";
import "./globals.css";

/**
 * Last-resort boundary: catches failures in the root layout itself, where
 * neither the app shell nor its providers are available. It therefore renders
 * its own <html>/<body> and leans on design tokens only — no components, no
 * hooks that depend on context.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[nexus] fatal error:", error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en-GB" data-theme="dark">
      <body className="min-h-dvh antialiased">
        <div className="flex min-h-dvh items-center justify-center px-5 py-12">
          <div className="w-full max-w-md text-center">
            <span className="inline-flex size-14 items-center justify-center rounded-full bg-danger/15 text-danger">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-7"
                aria-hidden
              >
                <path d="M12 9v4M12 17h.01" />
                <path d="M10.24 3.957 1.68 18.5A2 2 0 0 0 3.4 21.5h17.2a2 2 0 0 0 1.72-3L13.76 3.957a2 2 0 0 0-3.52 0" />
              </svg>
            </span>

            <h1 className="mt-5 font-display text-2xl font-semibold text-fg">
              Nexus could not start
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed text-fg-muted">
              The application shell itself failed to load. Reloading usually
              clears it — this build keeps all of its data in the browser, so
              there is nothing to lose.
            </p>

            <div className="mt-7 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-10 items-center justify-center rounded bg-accent px-4 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
              >
                Try again
              </button>
              {/* Intentionally a hard navigation, not next/link: the root
                  layout has failed, so client-side routing cannot be trusted
                  to recover. A full document load is the reliable escape. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                className="inline-flex h-10 items-center justify-center rounded border border-border-strong px-4 text-sm font-medium text-fg transition-colors hover:bg-surface-2"
              >
                Go home
              </a>
            </div>

            {error.message ? (
              <pre className="mt-8 max-h-40 overflow-auto rounded border border-border bg-surface-2 p-3 text-left font-mono text-2xs leading-relaxed text-fg-muted">
                {error.message}
                {error.digest ? `\n\ndigest: ${error.digest}` : ""}
              </pre>
            ) : null}
          </div>
        </div>
      </body>
    </html>
  );
}
