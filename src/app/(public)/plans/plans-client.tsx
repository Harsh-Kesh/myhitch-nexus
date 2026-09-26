"use client";

import {
  IconBriefcase,
  IconBuilding,
  IconCheck,
  IconDeviceTv,
  IconUsers,
  IconVideo,
} from "@tabler/icons-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ConfirmModal, Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import {
  useCurrentUser,
  useStartSubscription,
  useSubscriptions,
  useUpdateUser,
} from "@/lib/mock-api/hooks";

type PlanId = "premium" | "family" | "business";
type Interval = "month" | "year";

interface PlanDef {
  id: string;
  icon: React.ReactNode;
  name: string;
  tagline: string;
  price: { month: number } | { month: number; year: number } | "free" | "custom";
  priceNote?: string;
  benefits: string[];
  cta: string;
  tone: "neutral" | "accent" | "purple" | "green" | "orange" | "dark";
}

const PLANS: PlanDef[] = [
  {
    id: "free",
    icon: <IconVideo />,
    name: "Nexus Free",
    tagline: "Start Exploring",
    price: "free",
    benefits: [
      "Watch videos & short clips",
      "Listen to music & audio",
      "Follow creators & channels",
      "Like, comment & share",
      "Create playlists & watchlists",
      "Selected live streams",
      "Content with ads",
      "Basic search & recommendations",
    ],
    cta: "Get Started",
    tone: "neutral",
  },
  {
    id: "premium",
    icon: <IconDeviceTv />,
    name: "Nexus Premium",
    tagline: "More Content. No Limits.",
    price: { month: 999, year: 9900 },
    priceNote: "save 17% yearly",
    benefits: [
      "Ad-free MYHitch content",
      "All videos, music & live streams",
      "Background play (audio)",
      "Premium content bundles",
      "Downloads (where available)",
      "Enhanced video quality",
      "Early access to new features",
      "Priority support",
    ],
    cta: "Start Premium",
    tone: "accent",
  },
  {
    id: "family",
    icon: <IconUsers />,
    name: "Nexus Family",
    tagline: "Entertainment for Everyone",
    price: { month: 1499 },
    priceNote: "up to 5 profiles",
    benefits: [
      "All Premium benefits",
      "Up to 5 family profiles",
      "Parental controls",
      "Profile-based recommendations",
      "Safe viewing settings",
      "Family watchlists",
      "Ad-free MYHitch content",
      "Priority support",
    ],
    cta: "Start Family",
    tone: "purple",
  },
  {
    id: "creator",
    icon: <IconVideo />,
    name: "Nexus Creator",
    tagline: "Create. Share. Earn.",
    price: "free",
    priceNote: "to start",
    benefits: [
      "Creator channel & portfolio",
      "Upload videos, audio & live",
      "Analytics & audience insights",
      "Monetisation eligibility",
      "Fan subscriptions & tips",
      "Content management tools",
      "Collaboration opportunities",
      "Access to Nexus creator community",
    ],
    cta: "Start Creating",
    tone: "green",
  },
  {
    id: "business",
    icon: <IconBriefcase />,
    name: "Nexus Business",
    tagline: "Promote. Engage. Grow.",
    price: { month: 2900, year: 29000 },
    priceNote: "save 17% yearly",
    benefits: [
      "Verified business channel",
      "Commercial video campaigns",
      "Product & service links",
      "Campaign analytics",
      "Lead generation tools",
      "Employee access (up to 5)",
      "Integration with MYHitch platforms",
      "Priority business support",
    ],
    cta: "Grow Your Business",
    tone: "orange",
  },
  {
    id: "enterprise",
    icon: <IconBuilding />,
    name: "Nexus Enterprise",
    tagline: "Custom Solutions",
    price: "custom",
    priceNote: "for organisations, government & large businesses",
    benefits: [
      "All Business features",
      "Secure media workspace",
      "Large file transfer & storage",
      "Client review & approval workflow",
      "Version control & audit trail",
      "Multi-user & team permissions",
      "API access & system integration",
      "Dedicated account manager",
      "Custom contracts & support",
    ],
    cta: "Contact Sales",
    tone: "dark",
  },
];

const TONE_CLASSES: Record<PlanDef["tone"], string> = {
  neutral: "border-border",
  accent: "border-accent ring-1 ring-accent/30",
  purple: "border-[#8b5cf6]",
  green: "border-success",
  orange: "border-warning",
  dark: "border-fg/30",
};

function formatAud(minor: number): string {
  return `$${(minor / 100).toFixed(minor % 100 === 0 ? 0 : 2)}`;
}

export function PlansClient() {
  const { data: currentUser } = useCurrentUser();
  const { data: subscriptions = [] } = useSubscriptions();
  const startSubscription = useStartSubscription();
  const updateUser = useUpdateUser();
  const { toast } = useToast();
  const [interval, setIntervalValue] = React.useState<Interval>("month");
  const [salesOpen, setSalesOpen] = React.useState(false);
  const [pendingChange, setPendingChange] = React.useState<{ plan: PlanId; interval: Interval } | null>(null);

  const isCreator = Boolean(currentUser?.roles.includes("creator") || currentUser?.activeRole === "creator");
  const isBusiness = Boolean(currentUser?.roles.includes("business") || currentUser?.activeRole === "business");
  const isEnterprise = Boolean(
    currentUser?.roles.includes("enterprise") ||
      currentUser?.roles.includes("producer") ||
      currentUser?.activeRole === "enterprise",
  );

  const hasActiveSub = (planId: string) =>
    subscriptions.some(
      (s) => s.status === "active" && (s.id.includes(planId) || s.name.toLowerCase().includes(planId)),
    );

  const hasPaidViewerSub = hasActiveSub("family") || hasActiveSub("premium");

  // The one thing that decides whether clicking a plan button is a brand-new signup
  // (redirects to Stripe Checkout, which is its own confirmation step) or a real,
  // immediate charge/credit against a subscription already running (startOrChangePlan's
  // update-in-place — see subscriptions.ts) is whether the account already has ANY
  // active paid platform plan. Prefers the real `plan` field (Subscription's own header
  // comment on why: id/name string-matching silently drifts from reality) and falls back
  // to hasActiveSub's fuzzy match only for a mock row, which never has `plan` set.
  const activePaidSub = subscriptions.find(
    (s) =>
      s.status === "active" &&
      (s.plan
        ? s.plan === "premium" || s.plan === "family" || s.plan === "business"
        : hasActiveSub("premium") || hasActiveSub("family") || hasActiveSub("business")),
  );

  const planName = (id: PlanId) => PLANS.find((p) => p.id === id)?.name ?? id;
  const planPrice = (id: PlanId, planInterval: Interval): number => {
    const def = PLANS.find((p) => p.id === id)?.price;
    if (!def || def === "free" || def === "custom") return 0;
    return "year" in def && planInterval === "year" ? def.year : def.month;
  };

  /** Real money moves the instant a plan-change API call succeeds — no Stripe Checkout
   * page in between to act as a natural confirmation step, unlike a brand-new signup.
   * Found live 2026-09-25: a real account switched plans with one click and only found
   * out afterward that it had been charged. A fresh signup (no existing paid plan, or
   * re-picking the exact same plan) still goes straight through — Stripe's own Checkout
   * page is that case's confirmation. */
  const requestSubscribe = (plan: PlanId, planInterval: Interval) => {
    if (!currentUser) {
      handleSubscribe(plan, planInterval);
      return;
    }
    const activePlanId = activePaidSub?.plan;
    const isRealChange =
      activePaidSub &&
      (activePlanId !== plan || (activePaidSub.interval === "annual" ? "year" : "month") !== planInterval);
    if (isRealChange) {
      setPendingChange({ plan, interval: planInterval });
      return;
    }
    handleSubscribe(plan, planInterval);
  };

  const handleBecomeCreator = () => {
    if (!currentUser) return;
    updateUser.mutate(
      {
        roles: Array.from(new Set([...(currentUser.roles || []), "creator"])),
        activeRole: "creator",
      },
      {
        onSuccess: () => {
          toast({
            title: "Welcome to Nexus Creator!",
            description: "You now have access to Creator Studio.",
          });
        },
        onError: (err) => {
          toast({
            title: "Couldn't update role",
            description: err instanceof Error ? err.message : undefined,
            tone: "error",
          });
        },
      },
    );
  };

  const handleSubscribe = async (plan: PlanId, planInterval: Interval) => {
    if (!currentUser) {
      toast({
        title: "Create an account first",
        description: "Register (or sign in), then come back here to subscribe.",
      });
      return;
    }
    try {
      await startSubscription.mutateAsync({ plan, interval: planInterval });
    } catch (err) {
      toast({
        title: "Couldn't start checkout",
        description: err instanceof Error ? err.message : "Something went wrong. Try again.",
        tone: "error",
      });
      return;
    }
    toast({ title: `${plan[0].toUpperCase()}${plan.slice(1)} activated` });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-3xl font-semibold text-fg sm:text-4xl">
          One Platform. Endless Possibilities.
        </h1>
        <p className="mt-2 text-fg-muted">Choose the plan that&apos;s right for you.</p>
      </div>

      <div className="mt-6 flex justify-center">
        <div className="inline-flex rounded-full border border-border bg-surface-2 p-1">
          <button
            type="button"
            onClick={() => setIntervalValue("month")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              interval === "month" ? "bg-accent text-accent-fg" : "text-fg-muted"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setIntervalValue("year")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              interval === "year" ? "bg-accent text-accent-fg" : "text-fg-muted"
            }`}
          >
            Yearly <span className="text-xs opacity-80">(save 17%)</span>
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const isPaidPlan = plan.id === "premium" || plan.id === "family" || plan.id === "business";
          const yearlyAvailable = typeof plan.price === "object" && "year" in plan.price;
          const effectiveInterval: Interval = isPaidPlan && !yearlyAvailable ? "month" : interval;
          const priceDisplay =
            plan.price === "free"
              ? "$0"
              : plan.price === "custom"
                ? "Custom"
                : effectiveInterval === "year" && "year" in plan.price
                  ? formatAud(plan.price.year)
                  : formatAud(plan.price.month);
          const priceSuffix =
            plan.price === "free" || plan.price === "custom"
              ? ""
              : effectiveInterval === "year"
                ? " / year"
                : " / month";

          let ctaContent = null;
          let activeBadge: string | null = null;

          if (plan.id === "free") {
            if (!currentUser) {
              ctaContent = (
                <Button variant="secondary" block href="/auth/register">
                  {plan.cta}
                </Button>
              );
            } else {
              const isBasePlan = !hasPaidViewerSub && !isCreator && !isBusiness && !isEnterprise;
              activeBadge = isBasePlan ? "Current Plan" : "Included";
              ctaContent = (
                <Button variant="outline" block disabled className="opacity-70">
                  {isBasePlan ? "Current Base Plan" : "Included Free"}
                </Button>
              );
            }
          } else if (plan.id === "creator") {
            if (!currentUser) {
              ctaContent = (
                <Button variant="secondary" block href="/auth/register?role=creator">
                  {plan.cta}
                </Button>
              );
            } else if (isCreator) {
              activeBadge = "Active Creator";
              ctaContent = (
                <Button variant="secondary" block href="/studio">
                  Go to Creator Studio
                </Button>
              );
            } else {
              ctaContent = (
                <Button
                  variant="primary"
                  block
                  loading={updateUser.isPending}
                  onClick={handleBecomeCreator}
                >
                  Become a Creator (Free)
                </Button>
              );
            }
          } else if (plan.id === "premium") {
            const isSubbed = hasActiveSub("premium");
            if (isSubbed) activeBadge = "Active Plan";
            ctaContent = isSubbed ? (
              <Button variant="outline" block disabled className="opacity-70">
                Current Plan
              </Button>
            ) : (
              <Button
                variant="primary"
                block
                loading={startSubscription.isPending}
                onClick={() => requestSubscribe("premium", effectiveInterval)}
              >
                {currentUser ? "Upgrade to Premium" : plan.cta}
              </Button>
            );
          } else if (plan.id === "family") {
            const isSubbed = hasActiveSub("family");
            if (isSubbed) activeBadge = "Active Plan";
            ctaContent = isSubbed ? (
              <Button variant="outline" block disabled className="opacity-70">
                Current Plan
              </Button>
            ) : (
              <Button
                variant="primary"
                block
                loading={startSubscription.isPending}
                onClick={() => requestSubscribe("family", effectiveInterval)}
              >
                {currentUser ? "Upgrade to Family" : plan.cta}
              </Button>
            );
          } else if (plan.id === "business") {
            if (isBusiness || hasActiveSub("business")) {
              activeBadge = "Active Role";
              ctaContent = (
                <Button variant="secondary" block href="/business">
                  Go to Business Portal
                </Button>
              );
            } else {
              ctaContent = (
                <Button
                  variant="primary"
                  block
                  loading={startSubscription.isPending}
                  onClick={() => requestSubscribe("business", effectiveInterval)}
                >
                  {currentUser ? "Upgrade to Business" : plan.cta}
                </Button>
              );
            }
          } else if (plan.id === "enterprise") {
            if (isEnterprise) {
              activeBadge = "Active Role";
              ctaContent = (
                <Button variant="secondary" block href="/business/enterprise">
                  Enterprise Portal
                </Button>
              );
            } else {
              ctaContent = (
                <Button variant="secondary" block onClick={() => setSalesOpen(true)}>
                  {isBusiness ? "Request Enterprise upgrade" : plan.cta}
                </Button>
              );
            }
          }

          return (
            <Card key={plan.id} className={`flex flex-col ${TONE_CLASSES[plan.tone]}`}>
              <CardBody className="flex flex-1 flex-col">
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-accent [&_svg]:size-5">
                    {plan.icon}
                  </span>
                  {activeBadge ? (
                    <Badge tone="accent" size="sm">
                      {activeBadge}
                    </Badge>
                  ) : null}
                </div>
                <h2 className="mt-3 font-display text-lg font-semibold text-fg">{plan.name}</h2>
                <p className="text-sm text-fg-muted">{plan.tagline}</p>

                <div className="mt-4">
                  <span className="font-display text-3xl font-semibold text-fg nx-tnum">{priceDisplay}</span>
                  <span className="text-sm text-fg-muted">{priceSuffix}</span>
                  {plan.priceNote ? (
                    <p className="mt-0.5 text-xs text-fg-subtle">{plan.priceNote}</p>
                  ) : null}
                </div>

                <ul className="mt-4 flex-1 space-y-2 text-sm text-fg-muted">
                  {plan.benefits.map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2">
                      <IconCheck className="mt-0.5 size-4 shrink-0 text-success" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-5">{ctaContent}</div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-fg-subtle">
        Prices shown in AUD. Payments processed securely by Stripe — MYHitch Nexus never collects or stores your
        card details. Cancel any paid plan any time from{" "}
        <Link href="/account/subscriptions" className="text-accent hover:underline">
          Account → Subscriptions
        </Link>
        .
      </p>

      <SalesInquiryModal open={salesOpen} onClose={() => setSalesOpen(false)} isUpgrade={isBusiness} />

      <ConfirmModal
        open={Boolean(pendingChange)}
        onClose={() => setPendingChange(null)}
        onConfirm={async () => {
          if (!pendingChange) return;
          await handleSubscribe(pendingChange.plan, pendingChange.interval);
          setPendingChange(null);
        }}
        title={pendingChange ? `Switch to ${planName(pendingChange.plan)}?` : ""}
        description={
          pendingChange && activePaidSub
            ? `You're on ${activePaidSub.name} (${formatAud(activePaidSub.price.amount)}/${
                activePaidSub.interval === "annual" ? "year" : "month"
              }). Switching to ${planName(pendingChange.plan)} (${formatAud(
                planPrice(pendingChange.plan, pendingChange.interval),
              )}/${pendingChange.interval}) charges or credits a prorated amount immediately, based on time left in your current billing period — it does not start a second, separate subscription.`
            : undefined
        }
        confirmLabel="Switch & confirm"
        tone="default"
        loading={startSubscription.isPending}
      />
    </div>
  );
}

function SalesInquiryModal({
  open,
  onClose,
  isUpgrade,
}: {
  open: boolean;
  onClose: () => void;
  isUpgrade: boolean;
}) {
  const { data: currentUser } = useCurrentUser();
  const { toast } = useToast();
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open && currentUser) {
      setFullName((current) => current || currentUser.name);
      setEmail((current) => current || currentUser.email);
    }
  }, [open, currentUser]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/sales-inquiries/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, company, message }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not send your enquiry.");
      }
      toast({
        title: "Thanks — our team will be in touch",
        description: isUpgrade
          ? "We've received your upgrade request. Once your plan is approved, you'll get a real checkout to complete it — no need to re-register."
          : "We've received your enquiry.",
      });
      onClose();
      setFullName("");
      setEmail("");
      setCompany("");
      setMessage("");
    } catch (err) {
      toast({
        title: "Couldn't send your enquiry",
        description: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isUpgrade ? "Request an Enterprise upgrade" : "Talk to sales"}
      description={
        isUpgrade
          ? "Tell us what you need — we'll follow up, agree a price, and send you a real checkout to complete the upgrade."
          : "Tell us about your organisation and we'll be in touch about Nexus Enterprise."
      }
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={submitting}
            disabled={!fullName.trim() || !email.trim()}
            onClick={submit}
          >
            Send enquiry
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Full name" htmlFor="sales-name" required>
          <Input id="sales-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Work email" htmlFor="sales-email" required>
          <Input id="sales-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Company / organisation" htmlFor="sales-company">
          <Input id="sales-company" value={company} onChange={(e) => setCompany(e.target.value)} />
        </Field>
        <Field label="What are you looking for?" htmlFor="sales-message">
          <Textarea id="sales-message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
