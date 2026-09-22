"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { IconBrandGoogle } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/mock-api/hooks";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          prompt: (momentListener?: (notification: unknown) => void) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

interface GoogleSignInProps {
  callbackUrl?: string;
  className?: string;
}

export function GoogleSignInButton({ callbackUrl = "/", className }: GoogleSignInProps) {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = React.useState(false);

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const handleCredentialResponse = React.useCallback(
    async (response: { credential?: string; name?: string }) => {
      if (!response.credential) return;

      setLoading(true);
      try {
        const res = await fetch("/api/auth/social/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            credential: response.credential,
            name: response.name,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Google sign-in failed");
        }

        await queryClient.invalidateQueries({ queryKey: qk.user });
        toast({ title: "Signed in with Google" });
        router.push(callbackUrl);
      } catch (err: unknown) {
        toast({
          tone: "error",
          title: "Google sign-in failed",
          description: err instanceof Error ? err.message : "An error occurred",
        });
      } finally {
        setLoading(false);
      }
    },
    [callbackUrl, queryClient, router, toast],
  );

  // Initialize Google One Tap if client ID is configured
  React.useEffect(() => {
    if (!googleClientId) return;

    // Load Google Identity Services script
    const existingScript = document.getElementById("google-gsi-client");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "google-gsi-client";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        if (window.google?.accounts?.id) {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
          });
          window.google.accounts.id.prompt();
        }
      };
      document.body.appendChild(script);
    } else if (window.google?.accounts?.id) {
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      window.google.accounts.id.prompt();
    }
  }, [googleClientId, handleCredentialResponse]);

  const handleGoogleClick = () => {
    if (googleClientId && window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
      return;
    }

    // In development or when client ID is not yet set in environment:
    // Prompt for Google account email to simulate verified Google One Tap
    const email = prompt("Enter your Google Account email to sign in:", "user@gmail.com");
    if (!email || !email.trim()) return;

    // Generate a dev Google JWT payload
    const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = btoa(
      JSON.stringify({
        iss: "https://accounts.google.com",
        email: email.trim().toLowerCase(),
        email_verified: true,
        name: email.split("@")[0],
        sub: "google_dev_" + Date.now(),
      }),
    );
    const mockGoogleIdToken = `${header}.${payload}.mock_sig`;

    handleCredentialResponse({
      credential: mockGoogleIdToken,
      name: email.split("@")[0],
    });
  };

  return (
    <Button
      variant="secondary"
      loading={loading}
      onClick={handleGoogleClick}
      className={className}
    >
      <IconBrandGoogle className="size-4 text-[#4285F4]" />
      Continue with Google
    </Button>
  );
}
