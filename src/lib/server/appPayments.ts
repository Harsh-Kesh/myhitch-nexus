// Server-only. Shared pieces for paying in the MYHitch mobile app with Stripe's native
// PaymentSheet (saved card / new card / Google Pay) instead of sending the user to
// Stripe's hosted Checkout page. Besides a client secret to confirm, the sheet needs the
// publishable key, the Stripe Customer id and an ephemeral key so it can list and save
// that customer's cards.
import "server-only";
import type Stripe from "stripe";
import { getStripe } from "./stripeClient";

/** The Stripe API version the app's Stripe SDK speaks — an ephemeral key must be minted
 * for the client's version, not this server's pinned one. */
export const APP_STRIPE_API_VERSION = "2024-06-20";

/** Nexus had no publishable key before the app needed one (website payments are all
 * hosted Checkout redirects). Unset means paying in the app isn't switched on: the app
 * routes answer 503 `billing_not_configured` before touching Stripe at all. */
export function getStripePublishableKey(): string | null {
  return process.env.STRIPE_PUBLISHABLE_KEY || null;
}

/** The client secret of an invoice's payment. On the API version this SDK pins
 * (2025-03-31 and later) it's `invoice.confirmation_secret` (expand
 * "latest_invoice.confirmation_secret"); older versions exposed it as
 * `invoice.payment_intent.client_secret`, which is still read if a response carries it. */
export function invoiceClientSecret(invoice: string | Stripe.Invoice | null | undefined): string | null {
  if (!invoice || typeof invoice === "string") return null;
  if (invoice.confirmation_secret?.client_secret) return invoice.confirmation_secret.client_secret;
  const legacy = (invoice as unknown as { payment_intent?: string | { client_secret?: string | null } | null })
    .payment_intent;
  if (legacy && typeof legacy !== "string" && legacy.client_secret) return legacy.client_secret;
  return null;
}

/** An ephemeral key letting the app's PaymentSheet act on `customerId`'s saved cards. */
export async function createAppEphemeralKey(customerId: string): Promise<string> {
  const key = await getStripe().ephemeralKeys.create(
    { customer: customerId },
    { apiVersion: APP_STRIPE_API_VERSION },
  );
  if (!key.secret) throw new Error("Stripe returned an ephemeral key without a secret.");
  return key.secret;
}
