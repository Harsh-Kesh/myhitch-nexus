"use client";

import { IconBuilding, IconClockHour4, IconCreditCard, IconX } from "@tabler/icons-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";

/** Shown instead of Business Studio for a real Enterprise ("producer"-role) account
 * whose organization isn't on a real, paid Enterprise subscription yet — Nexus
 * Enterprise has no self-serve checkout at a fixed price, so registering creates a real
 * account and a real sales lead (sales_inquiries, auto-filed at registration — see
 * auth/register/route.ts), a super-admin sets a real negotiated price once a deal
 * closes (see admin/enterprise/page.tsx), and only then does this screen let the
 * customer actually pay for it — real access is gated on that real subscription, not on
 * anything an admin merely declares. */
export function EnterprisePendingGate({
  status,
  priceMinor,
  billingInterval,
}: {
  status: "pending" | "awaiting_payment" | "rejected";
  priceMinor: number | null;
  billingInterval: "month" | "year" | null;
}) {
  const { toast } = useToast();
  const [startingCheckout, setStartingCheckout] = React.useState(false);

  const startCheckout = async () => {
    setStartingCheckout(true);
    try {
      const res = await fetch("/api/subscriptions/enterprise-checkout/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnPath: "/business/channel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't start checkout.");
      window.location.href = data.url;
    } catch (err) {
      toast({
        title: "Couldn't start checkout",
        description: err instanceof Error ? err.message : "Something went wrong — try again.",
        tone: "error",
      });
      setStartingCheckout(false);
    }
  };

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

  if (status === "awaiting_payment" && priceMinor && billingInterval) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-6">
        <div className="max-w-md text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent/15 text-accent">
            <IconCreditCard className="size-6" />
          </span>
          <h1 className="mt-4 font-display text-xl font-semibold text-fg">
            Your Enterprise plan is ready
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            Our sales team has confirmed your plan at{" "}
            <strong className="text-fg">
              {formatCurrency(priceMinor, "AUD")} / {billingInterval === "year" ? "year" : "month"}
            </strong>
            . Complete payment to unlock Business Studio and the Enterprise Hub.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="primary" loading={startingCheckout} onClick={startCheckout}>
              Subscribe with Stripe
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
          already reached our sales team; once your plan is confirmed, you&rsquo;ll be able
          to complete payment here, and this workspace unlocks automatically right after.
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
