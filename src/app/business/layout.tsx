// Server Component — enforces SEC-1 before anything under /business renders or ships
// to the browser (see requireRole()'s header comment for why this replaced the
// client-only AuthGuard, which only ever checked "is anyone logged in", never which
// roles). Business Studio and Advertising share one workspace, so either role admits —
// matching the registration wizard, where both land on /business/channel.
import { requireRole } from "@/lib/server/rbac";
import { BusinessShell } from "./business-shell";

export default async function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["business", "advertiser"]);
  return <BusinessShell>{children}</BusinessShell>;
}
