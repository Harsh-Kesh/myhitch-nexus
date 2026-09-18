// Server-only. The one shared Stripe client, split out from commerce.ts so
// subscriptions.ts can depend on it without commerce.ts and subscriptions.ts importing
// each other (commerce.ts needs subscriptions.ts's checkRealPremium() for the "is this
// subscription-gated video covered by Premium" fallback; subscriptions.ts needs this).
import "server-only";
import Stripe from "stripe";

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Stripe is not configured (missing STRIPE_SECRET_KEY).");
    this.name = "StripeNotConfiguredError";
  }
}

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeNotConfiguredError();
  stripeClient = new Stripe(key);
  return stripeClient;
}
