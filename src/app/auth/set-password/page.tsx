"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { IconShieldLock } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { NexusMark } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Field, PasswordInput } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useCurrentUser, useSetPassword } from "@/lib/mock-api/hooks";

const schema = z
  .object({
    newPassword: z.string().min(8, "Passwords are at least 8 characters"),
    confirmPassword: z.string().min(8, "Passwords are at least 8 characters"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

export default function SetPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: currentUser, isLoading } = useCurrentUser();
  const setPassword = useSetPassword();

  React.useEffect(() => {
    if (!isLoading && currentUser === null) {
      router.replace("/auth/login");
    }
  }, [isLoading, currentUser, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await setPassword.mutateAsync(values.newPassword);
      toast({ title: "Password set" });
      const isAdminTier = currentUser?.roles.some((role) =>
        ["moderator", "finance-admin", "super-admin"].includes(role),
      );
      router.push(isAdminTier ? "/admin" : "/");
    } catch (err) {
      toast({
        title: "Couldn't set your password",
        description: err instanceof Error ? err.message : "Something went wrong.",
        tone: "error",
      });
    }
  };

  return (
    <div>
      <div className="mb-6">
        <NexusMark className="h-10 w-auto" />
      </div>

      <h1 className="font-display text-2xl font-semibold text-fg">Set a new password</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        {currentUser?.mustChangePassword
          ? "You're signing in with a temporary password an admin gave you — set your own before continuing."
          : "Choose a new password for your account."}
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <Field label="New password" htmlFor="newPassword" error={errors.newPassword?.message} required>
          <PasswordInput
            id="newPassword"
            autoComplete="new-password"
            leading={<IconShieldLock />}
            invalid={Boolean(errors.newPassword)}
            {...register("newPassword")}
          />
        </Field>

        <Field
          label="Confirm new password"
          htmlFor="confirmPassword"
          error={errors.confirmPassword?.message}
          required
        >
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            leading={<IconShieldLock />}
            invalid={Boolean(errors.confirmPassword)}
            {...register("confirmPassword")}
          />
        </Field>

        <Button type="submit" variant="primary" block loading={setPassword.isPending}>
          Set password
        </Button>
      </form>
    </div>
  );
}
