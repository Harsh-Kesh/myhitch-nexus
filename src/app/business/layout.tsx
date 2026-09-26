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
import { BusinessShell } from "./business-shell";
import { BusinessUpgradeGate } from "./business-upgrade-gate";

export default async function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const account = await requireRole(["business", "advertiser", "producer"]);

  // Nexus Business is a real, self-serve $29/mo Stripe subscription — checkRealPlanActive()
  // enforces that. Nexus Enterprise has no such self-serve product at all (PlanId only
  // ever covers premium/family/business — see subscriptions.ts): it's real, but priced
  // and contracted outside Stripe ("Contact Sales" on /plans), so there's no Stripe
  // subscription to check here. An Enterprise-role account's real gate is the role
  // itself; inventing a payment check against a product that doesn't exist would just
  // permanently lock every real Enterprise account out.
  const isEnterprise = account.roles.includes("producer");
  if (!isEnterprise) {
    const hasBusinessPlan = await checkRealPlanActive(account.id, "business");
    if (!hasBusinessPlan) {
      return <BusinessUpgradeGate />;
    }
  }
  return <BusinessShell>{children}</BusinessShell>;
}
