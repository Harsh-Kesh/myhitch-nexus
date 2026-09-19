import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

// Deliberately a second, near-identical copy of (public)/layout.tsx rather than
// nesting video/[id] under (public) itself — see video/[id]/page.tsx's comment for why
// this route needs to be outside the reach of (public)/loading.tsx's implicit Suspense
// boundary. Keep this in sync with (public)/layout.tsx if the shared chrome changes.
export default function PublicVideoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
