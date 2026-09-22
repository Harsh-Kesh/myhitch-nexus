"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  IconArrowLeft,
  IconBrandApple,
  IconMail,
  IconShieldLock,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { NexusMark } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, PasswordInput } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { useLogin } from "@/lib/mock-api/hooks";

import { GoogleSignInButton } from "@/components/auth/google-sign-in";

const schema = z.object({
  email: z.string().min(1, "Enter your email address").email("That does not look like an email address"),
  password: z.string().min(8, "Passwords are at least 8 characters"),
  remember: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const login = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "mara@marasolace.example", password: "prototype", remember: true },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      const user = await login.mutateAsync({
        email: values.email,
        password: values.password,
        remember: values.remember,
      });
      toast({ title: "Signed in" });
      router.push(user.mustChangePassword ? "/auth/set-password" : "/");
    } catch (err) {
      toast({
        title: "Couldn't sign you in",
        description: err instanceof Error ? err.message : "Something went wrong.",
        tone: "error",
      });
    }
  };

  return (
    <div>
      <div className="mb-6">
        <Link href="/" className="inline-block" aria-label="MYHitch Nexus Home">
          <NexusMark className="h-10 w-auto" />
        </Link>
      </div>

      <Link
        href="/"
        className="group mb-5 inline-flex items-center gap-2 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <IconArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
        <span>Back to Home</span>
      </Link>

      <h1 className="font-display text-2xl font-semibold text-fg">Sign in</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        New here?{" "}
        <Link href="/auth/register" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <GoogleSignInButton />
        <Button
          variant="secondary"
          onClick={() =>
            toast({ title: "Sign in with Apple requires Apple Developer Program ($99/yr)", tone: "info" })
          }
        >
          <IconBrandApple />
          Continue with Apple
        </Button>
      </div>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-2xs uppercase tracking-wide text-fg-subtle">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Email address" htmlFor="email" error={errors.email?.message} required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            leading={<IconMail />}
            invalid={Boolean(errors.email)}
            {...register("email")}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          error={errors.password?.message}
          required
          aside={
            <Link href="#" className="text-accent hover:underline">
              Forgot password?
            </Link>
          }
        >
          <PasswordInput
            id="password"
            autoComplete="current-password"
            leading={<IconShieldLock />}
            invalid={Boolean(errors.password)}
            {...register("password")}
          />
        </Field>

        <Checkbox label="Keep me signed in on this device" {...register("remember")} />

        <Button type="submit" variant="primary" block loading={login.isPending}>
          Sign in
        </Button>
      </form>


    </div>
  );
}
