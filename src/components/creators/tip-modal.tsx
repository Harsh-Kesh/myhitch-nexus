"use client";

import * as React from "react";
import { IconHeart, IconUser } from "@tabler/icons-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, Switch } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

import { useCurrentUser } from "@/lib/mock-api/hooks";

interface TipModalProps {
  open: boolean;
  onClose: () => void;
  channelId: string;
  channelName: string;
}

const PRESET_AMOUNTS = [5, 10, 25, 50];

export function TipModal({ open, onClose, channelId, channelName }: TipModalProps) {
  const { toast } = useToast();
  const { data: user } = useCurrentUser();
  const [selectedAmount, setSelectedAmount] = React.useState<number>(10);
  const [customAmount, setCustomAmount] = React.useState<string>("");
  const [isCustom, setIsCustom] = React.useState<boolean>(false);
  const [isPatron, setIsPatron] = React.useState<boolean>(false);
  const [name, setName] = React.useState<string>("");
  const [email, setEmail] = React.useState<string>("");
  const [message, setMessage] = React.useState<string>("");
  const [loading, setLoading] = React.useState<boolean>(false);

  const finalAmount = isCustom ? parseFloat(customAmount || "0") : selectedAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (user && (user.channelId === channelId || user.id === channelId)) {
      toast({
        title: "Action not allowed",
        description: "You cannot tip or become a patron of your own channel.",
        tone: "error",
      });
      return;
    }

    if (finalAmount < 1) {
      toast({
        title: "Invalid amount",
        description: "Minimum tip amount is $1.00.",
        tone: "error",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/creators/${encodeURIComponent(channelId)}/tip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supporterName: name.trim() || "Anonymous Fan",
          supporterEmail: email.trim() || undefined,
          amountCents: Math.round(finalAmount * 100),
          currency: "aud",
          message: message.trim() || undefined,
          isPatron,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to process tip.");
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({
          title: isPatron ? "Patronage Activated!" : "Thank You For Your Tip!",
          description: `Your contribution to ${channelName} has been recorded.`,
          tone: "success",
        });
        onClose();
      }
    } catch (err) {
      toast({
        title: "Couldn't complete tip",
        description: err instanceof Error ? err.message : "An unexpected error occurred.",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isPatron ? `Become a Patron of ${channelName}` : `Support ${channelName}`}
      description={
        isPatron
          ? "Join as a monthly patron to support this creator's work and unlock exclusive patron status."
          : "Show your appreciation with a direct tip to this creator."
      }
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 p-3">
          <div>
            <p className="text-sm font-medium text-fg">Monthly Patron Support</p>
            <p className="text-xs text-fg-muted">Contribute recurring patronage every month</p>
          </div>
          <Switch checked={isPatron} onCheckedChange={setIsPatron} aria-label="Monthly patron support" />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-fg-muted mb-2">
            Select Amount (AUD)
          </label>
          <div className="grid grid-cols-4 gap-2">
            {PRESET_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => {
                  setSelectedAmount(amt);
                  setIsCustom(false);
                }}
                className={`rounded-lg border py-2.5 text-center text-sm font-semibold transition-colors ${
                  !isCustom && selectedAmount === amt
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-surface-1 text-fg hover:border-border-strong"
                }`}
              >
                ${amt}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCustom(true)}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              isCustom
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-fg-subtle hover:text-fg"
            }`}
          >
            Custom Amount
          </button>
          {isCustom && (
            <div className="flex-1">
              <Input
                type="number"
                min="1"
                step="any"
                placeholder="Enter amount"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                leading={<span className="text-sm">$</span>}
                autoFocus
              />
            </div>
          )}
        </div>

        <Field label="Your Name or Handle" htmlFor="tip-name" hint="Displayed on the creator's supporter wall">
          <Input
            id="tip-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Alex M."
            leading={<IconUser className="size-4 text-fg-muted" />}
          />
        </Field>

        <Field label="Email Address" htmlFor="tip-email" hint="For your payment receipt">
          <Input
            id="tip-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
          />
        </Field>

        <Field label="Support Message (Optional)" htmlFor="tip-message">
          <Textarea
            id="tip-message"
            rows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Say something nice or request a topic..."
          />
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={loading}>
            <IconHeart className="size-4 mr-1 text-red-400 fill-current" />
            {isPatron ? `Support $${finalAmount || 0}/mo` : `Send $${finalAmount || 0} Tip`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
