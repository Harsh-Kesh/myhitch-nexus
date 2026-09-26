import { IconBuilding, IconClockHour4, IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

/** Shown instead of Business Studio for a real Enterprise ("producer"-role) account
 * whose organization hasn't been activated yet — Nexus Enterprise has no self-serve
 * checkout, so registering creates a real account and a real sales lead
 * (sales_inquiries, auto-filed at registration — see auth/register/route.ts), but full
 * access waits for a super-admin to activate it once an actual deal closes (see
 * admin/enterprise/page.tsx). */
export function EnterprisePendingGate({ status }: { status: "pending" | "rejected" }) {
  if (status === "rejected") {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-6">
        <div className="max-w-md text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-danger/15 text-danger">
            <IconX className="size-6" />
          </span>
          <h1 className="mt-4 font-display text-xl font-semibold text-fg">
            Enterprise application not approved
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            Your Nexus Enterprise application wasn&rsquo;t approved. If you think this is a
            mistake, or your organisation&rsquo;s needs have changed, get in touch and our
            sales team will follow up.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="primary" href="/plans">
              Talk to sales again
            </Button>
            <Button variant="ghost" href="/">
              Back to Nexus
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-warning/15 text-warning">
          <IconClockHour4 className="size-6" />
        </span>
        <h1 className="mt-4 font-display text-xl font-semibold text-fg">
          Your Enterprise application is under review
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-fg-muted">
          Nexus Enterprise is a custom-priced plan for organisations, government and
          large businesses — there&rsquo;s no self-serve checkout. Your registration has
          already reached our sales team; once your plan is confirmed, this workspace
          unlocks automatically, with no further action needed from you.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-fg-subtle">
          <IconBuilding className="size-4" />
          <span>We typically respond within one business day.</span>
        </div>
        <div className="mt-5 flex justify-center">
          <Button variant="ghost" href="/">
            Back to Nexus
          </Button>
        </div>
      </div>
    </div>
  );
}
