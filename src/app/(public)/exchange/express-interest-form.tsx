"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useCreateSponsorshipInquiry, useCurrentUser } from "@/lib/mock-api/hooks";

const SPONSOR_ROLES = ["business", "advertiser"];

export function ExpressInterestForm({ listingId }: { listingId: string }) {
  const { data: user } = useCurrentUser();
  const createInquiry = useCreateSponsorshipInquiry(listingId);
  const { toast } = useToast();
  const [message, setMessage] = React.useState("");
  const [sent, setSent] = React.useState(false);

  const isSponsor = Boolean(user && user.roles.some((role) => SPONSOR_ROLES.includes(role)));

  const send = async () => {
    try {
      await createInquiry.mutateAsync(message.trim());
      setSent(true);
      toast({ title: "Interest sent" });
    } catch (error) {
      toast({
        title: "Couldn't send your inquiry",
        description: error instanceof Error ? error.message : undefined,
        tone: "error",
      });
    }
  };

  return (
    <Card>
      <CardHeader
        title="Express interest"
        description="Sent directly to the creator through MYHitch Nexus — no contact details are shared until they choose to reply."
      />
      <CardBody>
        {!user ? (
          <p className="text-sm text-fg-muted">
            <a href="/auth/login" className="text-accent underline-offset-2 hover:underline">
              Sign in
            </a>{" "}
            with a business or advertiser account to express interest in this listing.
          </p>
        ) : !isSponsor ? (
          <p className="text-sm text-fg-muted">
            A business or advertiser account is required to express interest in a sponsorship listing.
          </p>
        ) : sent ? (
          <p className="text-sm text-fg">Your message has been sent to the creator.</p>
        ) : (
          <div className="space-y-3">
            <Field label="Message" htmlFor="inquiry-message" required>
              <Textarea
                id="inquiry-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={4}
                placeholder="Tell the creator about your business and why this project interests you."
              />
            </Field>
            <div className="flex justify-end">
              <Button
                variant="primary"
                loading={createInquiry.isPending}
                disabled={message.trim().length < 10}
                onClick={send}
              >
                Send
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
