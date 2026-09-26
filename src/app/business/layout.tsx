// Server Component — enforces SEC-1 before anything under /business renders or ships
// to the browser (see requireRole()'s header comment for why this replaced the
// client-only AuthGuard, which only ever checked "is anyone logged in", never which
// roles). Business Studio and Advertising share one workspace, so either role admits —
// matching the registration wizard, where both land on /business/channel. Nexus
// Enterprise ("producer") shares this same workspace too — /business/enterprise is
// under this same route group — so it has to admit here as well: found live 2026-09-26,
// a real registered Enterprise account got redirected to "/" before ever reaching its
// own Enterprise Hub, because this list only ever named "business"/"advertiser".
import { requireRole } from "@/lib/server/rbac";
import { checkRealPlanActive } from "@/lib/server/subscriptions";
import { getOrgEnterpriseStatus, resolveOrgIdForAccount, NoOrganizationError } from "@/lib/server/enterprise";
import { BusinessShell } from "./business-shell";
import { BusinessUpgradeGate } from "./business-upgrade-gate";
import { EnterprisePendingGate } from "./enterprise-pending-gate";

export default async function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const account = await requireRole(["business", "advertiser", "producer"]);

  // Nexus Business is a real, self-serve $29/mo Stripe subscription — checkRealPlanActive()
  // enforces that. Nexus Enterprise has no such self-serve product at all (PlanId only
  // ever covers premium/family/business — see subscriptions.ts): it's real, but priced
  // and contracted outside Stripe ("Contact Sales" on /plans). Its real gate is
  // organizations.enterprise_status — pending until a super-admin activates it once an
  // actual deal closes (see admin/enterprise/page.tsx), never a Stripe check against a
  // product that doesn't exist.
  const isEnterprise = account.roles.includes("producer");
  if (isEnterprise) {
    let orgId: string;
    try {
      orgId = await resolveOrgIdForAccount(account.id);
    } catch (err) {
      if (err instanceof NoOrganizationError) {
        return <EnterprisePendingGate status="pending" />;
      }
      throw err;
    }
    const status = await getOrgEnterpriseStatus(orgId);
    if (status !== "active") {
      return <EnterprisePendingGate status={status === "rejected" ? "rejected" : "pending"} />;
    }
  } else {
    const hasBusinessPlan = await checkRealPlanActive(account.id, "business");
    if (!hasBusinessPlan) {
      return <BusinessUpgradeGate />;
    }
  }
  return <BusinessShell>{children}</BusinessShell>;
}
