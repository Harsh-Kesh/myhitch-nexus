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
import { queryOne } from "@/lib/server/db";
import { getOrgEnterpriseStatus, hasActiveEnterpriseSubscription, resolveOrgIdForAccount, NoOrganizationError } from "@/lib/server/enterprise";
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
  // enforces that. Nexus Enterprise's price is custom, negotiated per organization, but
  // once a price is set it's the exact same real mechanism: a real Stripe subscription
  // has to be active for real access, never a stored admin flag alone (that flag —
  // organizations.enterprise_status — is only the pre-payment workflow state: pending
  // admin review, awaiting the customer's payment, or rejected).
  const isEnterprise = account.roles.includes("producer");
  if (isEnterprise) {
    const hasEnterprisePlan = await hasActiveEnterpriseSubscription(account.id);
    if (!hasEnterprisePlan) {
      let orgId: string;
      try {
        orgId = await resolveOrgIdForAccount(account.id);
      } catch (err) {
        if (err instanceof NoOrganizationError) {
          return <EnterprisePendingGate status="pending" priceMinor={null} billingInterval={null} />;
        }
        throw err;
      }
      const status = await getOrgEnterpriseStatus(orgId);
      if (status === "awaiting_payment") {
        const org = await queryOne<{ enterprise_price_minor: number | null; enterprise_billing_interval: "month" | "year" | null }>(
          `select enterprise_price_minor, enterprise_billing_interval from organizations where id = $1`,
          [orgId],
        );
        return (
          <EnterprisePendingGate
            status="awaiting_payment"
            priceMinor={org?.enterprise_price_minor ?? null}
            billingInterval={org?.enterprise_billing_interval ?? null}
          />
        );
      }
      return (
        <EnterprisePendingGate
          status={status === "rejected" ? "rejected" : "pending"}
          priceMinor={null}
          billingInterval={null}
        />
      );
    }
  } else {
    const hasBusinessPlan = await checkRealPlanActive(account.id, "business");
    if (!hasBusinessPlan) {
      return <BusinessUpgradeGate />;
    }
  }
  return <BusinessShell>{children}</BusinessShell>;
}
