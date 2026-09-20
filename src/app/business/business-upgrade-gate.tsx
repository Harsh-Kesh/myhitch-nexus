import { IconBriefcase } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

/** Shown instead of Business Studio when a business/advertiser-role account has no
 * active Nexus Business subscription — the role itself is still free to hold (it's what
 * unlocks this workspace's *existence*), but per the pricing model, using it requires
 * the paid plan, the same way Creator Studio doesn't need a role-gate because Creator
 * itself is the free tier. */
export function BusinessUpgradeGate() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-warning/15 text-warning">
          <IconBriefcase className="size-6" />
        </span>
        <h1 className="mt-4 font-display text-xl font-semibold text-fg">
          Subscribe to Nexus Business
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          Business Studio — verified channel, commercial campaigns, product links, lead
          generation and analytics — is part of the Nexus Business plan (£29/month or
          £290/year). Subscribe to unlock it.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="primary" href="/plans">
            View Business plan
          </Button>
          <Button variant="ghost" href="/">
            Back to Nexus
          </Button>
        </div>
      </div>
    </div>
  );
}
