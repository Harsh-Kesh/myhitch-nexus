"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  IconBuildingStore,
  IconCheck,
  IconCircleX,
  IconLoader2,
  IconUsers,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { useCurrentUser } from "@/lib/mock-api/hooks";

function JoinContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const router = useRouter();
  const { data: user, isLoading: userLoading } = useCurrentUser();

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  const handleAccept = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/business/team/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to accept invitation");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/business/channel");
      }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to accept invitation");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <Card className="max-w-md text-center">
          <CardBody className="py-8">
            <IconCircleX className="mx-auto size-12 text-danger" />
            <h2 className="mt-4 text-lg font-bold text-fg">Invalid Invitation Link</h2>
            <p className="mt-2 text-sm text-fg-muted">
              This invitation link is missing a valid token. Please check the URL provided in your invitation email.
            </p>
            <Button
              variant="secondary"
              className="mt-6"
              onClick={() => router.push("/")}
            >
              Go to Homepage
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader
          title="Join Business Team"
          description="You have been invited to collaborate on a MYHitch Nexus business channel."
        />
        <CardBody className="space-y-6">
          {success ? (
            <div className="text-center py-4">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
                <IconCheck className="size-6" />
              </div>
              <h3 className="mt-3 text-lg font-semibold text-fg">Invitation Accepted!</h3>
              <p className="mt-1 text-sm text-fg-muted">
                You are now a team member. Redirecting you to Business Studio...
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4 rounded-lg border border-border bg-surface-2 p-4">
                <div className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent">
                  <IconBuildingStore className="size-5" />
                </div>
                <div>
                  <h4 className="font-medium text-fg">Business Studio Access</h4>
                  <p className="text-xs text-fg-muted">
                    Collaborate on video publishing, advertising campaigns, and customer leads.
                  </p>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
                  {error}
                </div>
              )}

              {userLoading ? (
                <div className="flex items-center justify-center py-4 text-sm text-fg-muted">
                  <IconLoader2 className="mr-2 size-4 animate-spin" />
                  Checking sign-in status...
                </div>
              ) : !user ? (
                <div className="space-y-3">
                  <p className="text-sm text-fg-muted">
                    Please sign in or create an account to accept this invitation.
                  </p>
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => router.push(`/auth/sign-in?callbackUrl=/business/join?token=${token}`)}
                  >
                    Sign In to Accept
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-sm text-fg-muted">
                    Signed in as <span className="font-medium text-fg">{user.email || user.name}</span>
                  </div>
                  <Button
                    variant="primary"
                    className="w-full"
                    loading={loading}
                    onClick={handleAccept}
                  >
                    <IconUsers className="size-4" />
                    Accept Invitation & Join Team
                  </Button>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default function BusinessJoinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <IconLoader2 className="size-8 animate-spin text-fg-subtle" />
        </div>
      }
    >
      <JoinContent />
    </Suspense>
  );
}
