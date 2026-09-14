import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE_URL } from "@/lib/utils";
import { Providers } from "./providers";

// Font stacks live in tokens.css and resolve locally — see the typography note
// there for why this build deliberately avoids next/font/google.

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "MYHitch Nexus",
    template: "%s · MYHitch Nexus",
  },
  description:
    "One platform for commercial video, films, education, live streams, corporate media, documentaries, news and creator content — with publishing, discovery, monetisation and commerce built in.",
  openGraph: {
    siteName: "MYHitch Nexus",
    type: "website",
    images: [{ url: "/images/brand/logo.png" }],
  },
  twitter: {
    card: "summary_large_image",
  },
};

export const viewport: Viewport = {
  themeColor: "#F8F9FB",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem('nexus-theme-v2');
                if (t === 'dark') {
                  document.documentElement.dataset.theme = 'dark';
                } else {
                  document.documentElement.dataset.theme = 'light';
                }
              } catch (e) {
                document.documentElement.dataset.theme = 'light';
              }
            `,
          }}
        />
      </head>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-accent-fg"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
