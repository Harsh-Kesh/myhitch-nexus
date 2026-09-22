// Server Component — enforces SEC-1 before anything under /admin renders or ships to
// the browser (see requireRole()'s header comment for why this replaced the client-only
// AuthGuard, which only ever checked "is anyone logged in", never which roles).
import { requireRole } from "@/lib/server/rbac";
import { AdminShell } from "./admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["moderator", "finance-admin", "super-admin"]);
  return <AdminShell>{children}</AdminShell>;
}
