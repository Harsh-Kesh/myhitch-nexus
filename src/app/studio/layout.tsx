// Server Component — enforces SEC-1 before anything under /studio renders or ships to
// the browser (see requireRole()'s header comment for why this replaced the client-only
// AuthGuard, which only ever checked "is anyone logged in", never which roles).
import { requireRole } from "@/lib/server/rbac";
import { StudioShell } from "./studio-shell";

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("creator");
  return <StudioShell>{children}</StudioShell>;
}
