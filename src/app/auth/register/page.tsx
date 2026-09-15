"use client";

import {
  IconArrowLeft,
  IconBrandApple,
  IconBrandGoogle,
  IconBuildingBank,
  IconBuildingStore,
  IconCertificate,
  IconCheck,
  IconDeviceTv,
  IconFileUpload,
  IconMovie,
  IconSpeakerphone,
  IconUpload,
  IconUser,
  IconVideo,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { NexusMark } from "@/components/layout/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import {
  Checkbox,
  Field,
  Input,
  RadioCard,
  Select,
  Switch,
  Textarea,
} from "@/components/ui/field";
import { MultiSelect } from "@/components/ui/multi-select";
import { ProgressBar } from "@/components/ui/progress";
import { Stepper } from "@/components/ui/stepper";
import { useToast } from "@/components/ui/toast";
import { register as registerUser } from "@/lib/mock-api";
import type { UserRole } from "@/lib/mock-api/types";
import { cn, formatBytes } from "@/lib/utils";

const ROLES: Array<{
  value: UserRole;
  title: string;
  description: string;
  icon: React.ReactNode;
  /** Roles that must pass organisation verification before publishing. */
  requiresOrg?: boolean;
  requiresMfa?: boolean;
}> = [
  {
    value: "viewer",
    title: "Viewer",
    description: "Watch, rent, buy and subscribe. Set up profiles for your household.",
    icon: <IconDeviceTv />,
  },
  {
    value: "creator",
    title: "Creator",
    description: "Publish your own videos, go live, and earn from ads and memberships.",
    icon: <IconVideo />,
  },
  {
    value: "business",
    title: "Business",
    description: "Run a branded channel, attach product links and capture leads.",
    icon: <IconBuildingStore />,
    requiresOrg: true,
  },
  {
    value: "advertiser",
    title: "Advertiser",
    description: "Buy placements across the catalogue and measure campaign performance.",
    icon: <IconSpeakerphone />,
    requiresOrg: true,
    requiresMfa: true,
  },
  {
    value: "producer",
    title: "Producer / distributor",
    description: "Distribute a catalogue with rights schedules and bulk metadata import.",
    icon: <IconMovie />,
    requiresOrg: true,
    requiresMfa: true,
  },
  {
    value: "education",
    title: "Education provider",
    description: "Publish accredited courses and issue completion records.",
    icon: <IconCertificate />,
    requiresOrg: true,
  },
  {
    value: "organisation",
    title: "Government / non-profit",
    description: "Publish public information, meetings and impact reporting.",
    icon: <IconBuildingBank />,
    requiresOrg: true,
    requiresMfa: true,
  },
];

const COUNTRIES = [
  { value: "GB", label: "United Kingdom" },
  { value: "IE", label: "Ireland" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "PT", label: "Portugal" },
  { value: "ES", label: "Spain" },
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "LK", label: "Sri Lanka" },
  { value: "IN", label: "India" },
  { value: "NL", label: "Netherlands" },
];

const LANGUAGES = [
  "English",
  "German",
  "French",
  "Spanish",
  "Portuguese",
  "Welsh",
  "Polish",
  "Urdu",
  "Sinhala",
  "Tamil",
  "Arabic",
].map((language) => ({ value: language, label: language }));

const INTERESTS = [
  "Films & cinema",
  "Documentaries",
  "News & current affairs",
  "Education",
  "Music",
  "Technology",
  "Automotive",
  "Travel",
  "Home & DIY",
  "Sport",
  "Business",
  "Sustainability",
].map((interest) => ({ value: interest, label: interest }));

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = React.useState(0);
  const [furthest, setFurthest] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);

  // Account
  const [role, setRole] = React.useState<UserRole>("viewer");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [mobile, setMobile] = React.useState("");
  const [country, setCountry] = React.useState("GB");
  const [language, setLanguage] = React.useState("English");
  const [interests, setInterests] = React.useState<string[]>([]);
  const [acceptedTerms, setAcceptedTerms] = React.useState(false);

  // Verification
  const [emailCode, setEmailCode] = React.useState("");
  const [mobileCode, setMobileCode] = React.useState("");
  const [emailVerified, setEmailVerified] = React.useState(false);
  const [mobileVerified, setMobileVerified] = React.useState(false);

  // MFA
  const [mfaEnabled, setMfaEnabled] = React.useState(false);
  const [mfaMethod, setMfaMethod] = React.useState("app");

  // Organisation
  const [orgName, setOrgName] = React.useState("");
  const [orgNumber, setOrgNumber] = React.useState("");
  const [orgRep, setOrgRep] = React.useState("");
  const [orgRepEmail, setOrgRepEmail] = React.useState("");
  const [orgAbout, setOrgAbout] = React.useState("");
  const [documents, setDocuments] = React.useState<UploadedDocument[]>([]);

  // Preferences
  const [notifyUploads, setNotifyUploads] = React.useState(true);
  const [notifyLive, setNotifyLive] = React.useState(true);
  const [personalised, setPersonalised] = React.useState(true);
  const [personalisedAds, setPersonalisedAds] = React.useState(false);
  const [parentalControls, setParentalControls] = React.useState(false);
  const [maxRating, setMaxRating] = React.useState("15");

  const roleConfig = ROLES.find((item) => item.value === role)!;
  const needsOrg = Boolean(roleConfig.requiresOrg);
  const needsMfa = Boolean(roleConfig.requiresMfa);

  const steps = React.useMemo(
    () => [
      { id: "role", title: "Role", description: "How you plan to use Nexus" },
      { id: "account", title: "Account", description: "Name, email and password" },
      { id: "verify", title: "Verify", description: "Email and mobile confirmation" },
      ...(needsMfa
        ? [{ id: "mfa", title: "Security", description: "Multi-factor authentication" }]
        : []),
      ...(needsOrg
        ? [{ id: "org", title: "Organisation", description: "Business details and documents" }]
        : []),
      { id: "preferences", title: "Preferences", description: "Notifications and privacy" },
      { id: "done", title: "Finish", description: "Review and create" },
    ],
    [needsMfa, needsOrg],
  );

  const currentStep = steps[Math.min(step, steps.length - 1)];

  const canContinue = (() => {
    switch (currentStep.id) {
      case "role":
        return true;
      case "account":
        return (
          name.trim().length > 1 &&
          /.+@.+\..+/.test(email) &&
          password.length >= 8 &&
          acceptedTerms
        );
      case "verify":
        return emailVerified && mobileVerified;
      case "mfa":
        return mfaEnabled;
      case "org":
        return (
          orgName.trim().length > 1 &&
          orgNumber.trim().length > 3 &&
          orgRep.trim().length > 1 &&
          /.+@.+\..+/.test(orgRepEmail) &&
          documents.some((doc) => doc.progress === 100)
        );
      default:
        return true;
    }
  })();

  const goNext = () => {
    const next = Math.min(step + 1, steps.length - 1);
    setStep(next);
    setFurthest((current) => Math.max(current, next));
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      await registerUser({ name, email, password, role, country });
      toast({
        title: "Account created",
        description: needsOrg
          ? "Your organisation is pending verification. You can browse while it is reviewed."
          : "Welcome to Nexus.",
      });
      router.push(
        role === "creator"
          ? "/studio/dashboard"
          : role === "business" || role === "advertiser"
            ? "/business/channel"
            : "/",
      );
    } catch (err) {
      toast({
        title: "Couldn't create your account",
        description: err instanceof Error ? err.message : "Something went wrong.",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
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

      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-fg">
          Create your account
        </h1>
        <p className="mt-1.5 text-sm text-fg-muted">
          Already have one?{" "}
          <Link href="/auth/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>

      <Stepper
        steps={steps}
        current={step}
        furthestReached={furthest}
        onStepClick={setStep}
        className="mb-7"
      />

      <div className="min-h-[22rem]">
        {/* ------------------------------ Role ------------------------------ */}
        {currentStep.id === "role" ? (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">
              This sets which tools you see. You can add more roles later from
              account settings — nothing here is permanent.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {ROLES.map((item) => (
                <RadioCard
                  key={item.value}
                  name="role"
                  size="sm"
                  value={item.value}
                  checked={role === item.value}
                  onChange={(value) => setRole(value as UserRole)}
                  title={item.title}
                  description={item.description}
                  icon={item.icon}
                />
              ))}
            </div>
            {(needsOrg || needsMfa) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {needsOrg ? (
                  <Badge tone="info" size="sm">
                    Adds organisation verification
                  </Badge>
                ) : null}
                {needsMfa ? (
                  <Badge tone="warning" size="sm">
                    Requires multi-factor authentication
                  </Badge>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {/* ----------------------------- Account ---------------------------- */}
        {currentStep.id === "account" ? (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="secondary"
                onClick={() =>
                  toast({ title: "Social sign-up is a UI demonstration", tone: "info" })
                }
              >
                <IconBrandGoogle />
                Google
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  toast({ title: "Social sign-up is a UI demonstration", tone: "info" })
                }
              >
                <IconBrandApple />
                Apple
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-2xs uppercase tracking-wide text-fg-subtle">
                or use email
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <Field label="Full name" htmlFor="name" required>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Alex Whitfield"
                leading={<IconUser />}
              />
            </Field>

            <Field
              label="Email address"
              htmlFor="reg-email"
              required
              hint="We send receipts, policy notices and verification codes here."
            >
              <Input
                id="reg-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </Field>

            <Field
              label="Password"
              htmlFor="reg-password"
              required
              error={
                password.length > 0 && password.length < 8
                  ? "Use at least 8 characters"
                  : undefined
              }
            >
              <Input
                id="reg-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <PasswordStrength value={password} />
            </Field>

            <Field
              label="Mobile number"
              htmlFor="mobile"
              hint="Used for the verification code and account recovery."
            >
              <Input
                id="mobile"
                type="tel"
                value={mobile}
                onChange={(event) => setMobile(event.target.value)}
                placeholder="+44 7700 900000"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Country" htmlFor="country">
                <Select
                  id="country"
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                >
                  {COUNTRIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Preferred language" htmlFor="language">
                <Select
                  id="language"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                >
                  {LANGUAGES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Checkbox
              checked={acceptedTerms}
              onChange={(event) => setAcceptedTerms(event.target.checked)}
              label="I accept the terms of service and privacy policy"
              description="Required to create an account."
            />
          </div>
        ) : null}

        {/* ----------------------------- Verify ----------------------------- */}
        {currentStep.id === "verify" ? (
          <div className="space-y-4">
            <p className="rounded border border-info/30 bg-info/10 px-3.5 py-3 text-sm text-fg-muted">
              Mock verification: the code is always{" "}
              <span className="font-mono font-semibold text-fg">000000</span>. No
              email or SMS is sent.
            </p>

            <OtpBlock
              label="Email verification"
              target={email || "you@example.com"}
              value={emailCode}
              onChange={setEmailCode}
              verified={emailVerified}
              onVerify={() => {
                if (emailCode.replace(/\s/g, "") === "000000") {
                  setEmailVerified(true);
                  toast({ title: "Email verified" });
                } else {
                  toast({
                    title: "Incorrect code",
                    description: "Use 000000 in this prototype.",
                    tone: "error",
                  });
                }
              }}
            />

            <OtpBlock
              label="Mobile verification"
              target={mobile || "+44 7700 900000"}
              value={mobileCode}
              onChange={setMobileCode}
              verified={mobileVerified}
              onVerify={() => {
                if (mobileCode.replace(/\s/g, "") === "000000") {
                  setMobileVerified(true);
                  toast({ title: "Mobile verified" });
                } else {
                  toast({
                    title: "Incorrect code",
                    description: "Use 000000 in this prototype.",
                    tone: "error",
                  });
                }
              }}
            />
          </div>
        ) : null}

        {/* ------------------------------- MFA ------------------------------ */}
        {currentStep.id === "mfa" ? (
          <div className="space-y-4">
            <p className="text-sm text-fg-muted">
              {roleConfig.title} accounts can spend money and publish on behalf of
              an organisation, so multi-factor authentication is required.
            </p>

            <Switch
              checked={mfaEnabled}
              onCheckedChange={setMfaEnabled}
              label="Enable multi-factor authentication"
              description="You will be asked for a second factor when signing in on a new device."
            />

            {mfaEnabled ? (
              <div className="space-y-2">
                {[
                  {
                    value: "app",
                    title: "Authenticator app",
                    description: "Time-based codes from an app such as Authy or 1Password.",
                  },
                  {
                    value: "sms",
                    title: "SMS code",
                    description: "A code sent to your verified mobile number.",
                  },
                  {
                    value: "key",
                    title: "Security key / passkey",
                    description: "A hardware key or platform passkey.",
                  },
                ].map((item) => (
                  <RadioCard
                    key={item.value}
                    name="mfa"
                    value={item.value}
                    checked={mfaMethod === item.value}
                    onChange={setMfaMethod}
                    title={item.title}
                    description={item.description}
                  />
                ))}

                {mfaMethod === "app" ? (
                  <Card className="mt-3">
                    <CardBody className="flex flex-wrap items-center gap-4">
                      <div
                        aria-hidden
                        className="size-24 shrink-0 rounded"
                        style={{
                          backgroundImage:
                            "repeating-conic-gradient(rgb(var(--nx-fg)) 0% 25%, rgb(var(--nx-surface-3)) 0% 50%)",
                          backgroundSize: "12px 12px",
                        }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-fg">
                          Scan this code
                        </p>
                        <p className="mt-1 text-xs text-fg-muted">
                          Or enter the setup key manually:
                        </p>
                        <code className="mt-1.5 block break-all font-mono text-xs text-accent">
                          NXUS-4K2P-9T7Q-MOCK-ONLY
                        </code>
                      </div>
                    </CardBody>
                  </Card>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* --------------------------- Organisation ------------------------- */}
        {currentStep.id === "org" ? (
          <div className="space-y-4">
            <p className="text-sm text-fg-muted">
              Organisation details are reviewed by the Nexus team before your
              channel can publish or spend. You can browse while this is pending.
            </p>

            <Field label="Registered organisation name" htmlFor="org-name" required>
              <Input
                id="org-name"
                value={orgName}
                onChange={(event) => setOrgName(event.target.value)}
                placeholder="Northlight Pictures Ltd"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Registration number"
                htmlFor="org-number"
                required
                hint="Company, charity or institution number."
              >
                <Input
                  id="org-number"
                  value={orgNumber}
                  onChange={(event) => setOrgNumber(event.target.value)}
                  placeholder="GB-CO-07741220"
                />
              </Field>
              <Field label="Country of registration" htmlFor="org-country">
                <Select
                  id="org-country"
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                >
                  {COUNTRIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Authorised representative" htmlFor="org-rep" required>
                <Input
                  id="org-rep"
                  value={orgRep}
                  onChange={(event) => setOrgRep(event.target.value)}
                  placeholder="Nadia Okonjo"
                />
              </Field>
              <Field label="Representative email" htmlFor="org-rep-email" required>
                <Input
                  id="org-rep-email"
                  type="email"
                  value={orgRepEmail}
                  onChange={(event) => setOrgRepEmail(event.target.value)}
                  placeholder="name@organisation.example"
                />
              </Field>
            </div>

            <Field
              label="What does the organisation publish?"
              htmlFor="org-about"
              hint="Helps the review team route your application."
            >
              <Textarea
                id="org-about"
                value={orgAbout}
                onChange={(event) => setOrgAbout(event.target.value)}
                rows={3}
                placeholder="Independent feature films and shorts, licensed for rental and purchase."
              />
            </Field>

            <DocumentUploader documents={documents} onChange={setDocuments} />
          </div>
        ) : null}

        {/* ---------------------------- Preferences ------------------------- */}
        {currentStep.id === "preferences" ? (
          <div className="space-y-5">
            <Field
              label="What are you interested in?"
              hint="Used to seed your recommendations. You can change this any time."
            >
              <MultiSelect
                options={INTERESTS}
                value={interests}
                onChange={setInterests}
                placeholder="Pick a few topics"
                allLabel="No preference — show me everything"
              />
            </Field>

            <div className="space-y-4 rounded-lg border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                Notifications
              </p>
              <Switch
                checked={notifyUploads}
                onCheckedChange={setNotifyUploads}
                label="New uploads from channels I follow"
              />
              <Switch
                checked={notifyLive}
                onCheckedChange={setNotifyLive}
                label="Live streams starting"
              />
            </div>

            <div className="space-y-4 rounded-lg border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                Privacy
              </p>
              <Switch
                checked={personalised}
                onCheckedChange={setPersonalised}
                label="Personalised recommendations"
                description="Uses your watch history to order rails and suggestions."
              />
              <Switch
                checked={personalisedAds}
                onCheckedChange={setPersonalisedAds}
                label="Personalised advertising"
                description="Off by default. Ads still appear, but are not targeted using your activity."
              />
            </div>

            <div className="space-y-4 rounded-lg border border-border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                Parental controls
              </p>
              <Switch
                checked={parentalControls}
                onCheckedChange={setParentalControls}
                label="Restrict content by age rating"
                description="Applies to every profile that is not PIN-protected."
              />
              {parentalControls ? (
                <Field label="Maximum age rating" htmlFor="max-rating">
                  <Select
                    id="max-rating"
                    value={maxRating}
                    onChange={(event) => setMaxRating(event.target.value)}
                  >
                    {["U", "PG", "12", "15", "18"].map((rating) => (
                      <option key={rating} value={rating}>
                        {rating}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ------------------------------ Finish ---------------------------- */}
        {currentStep.id === "done" ? (
          <div className="space-y-4">
            <Card>
              <CardBody className="space-y-3">
                <p className="text-sm font-semibold text-fg">Review</p>
                <dl className="divide-y divide-border text-sm">
                  <Row label="Role" value={roleConfig.title} />
                  <Row label="Name" value={name || "—"} />
                  <Row label="Email" value={email || "—"} />
                  <Row
                    label="Verification"
                    value={
                      <span className="flex flex-wrap gap-1.5">
                        <Badge tone={emailVerified ? "published" : "pending"} size="sm">
                          Email {emailVerified ? "verified" : "pending"}
                        </Badge>
                        <Badge tone={mobileVerified ? "published" : "pending"} size="sm">
                          Mobile {mobileVerified ? "verified" : "pending"}
                        </Badge>
                      </span>
                    }
                  />
                  {needsMfa ? (
                    <Row
                      label="MFA"
                      value={mfaEnabled ? `Enabled · ${mfaMethod}` : "Not enabled"}
                    />
                  ) : null}
                  {needsOrg ? (
                    <>
                      <Row label="Organisation" value={orgName || "—"} />
                      <Row
                        label="Documents"
                        value={`${documents.filter((d) => d.progress === 100).length} uploaded`}
                      />
                      <Row
                        label="Verification status"
                        value={<Badge tone="pending" size="sm">Pending review</Badge>}
                      />
                    </>
                  ) : null}
                  <Row label="Country" value={country} />
                  <Row label="Language" value={language} />
                  <Row
                    label="Interests"
                    value={interests.length ? interests.join(", ") : "No preference"}
                  />
                </dl>
              </CardBody>
            </Card>

            <p className="text-xs leading-relaxed text-fg-subtle">
              This creates a real account you can sign back into. Document
              verification, fraud detection and multi-factor enrollment are not
              yet live in this build.
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-7 flex items-center justify-between gap-3 border-t border-border pt-5">
        <Button
          variant="ghost"
          onClick={() => setStep((current) => Math.max(0, current - 1))}
          disabled={step === 0}
        >
          Back
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-fg-subtle nx-tnum">
            Step {step + 1} of {steps.length}
          </span>
          {currentStep.id === "done" ? (
            <Button variant="primary" onClick={submit} loading={submitting}>
              Create account
            </Button>
          ) : (
            <Button variant="primary" onClick={goNext} disabled={!canContinue}>
              Continue
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Sub-views -------------------------------- */

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[9rem_1fr]">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="text-fg">{value}</dd>
    </div>
  );
}

function PasswordStrength({ value }: { value: string }) {
  const score = React.useMemo(() => {
    let points = 0;
    if (value.length >= 8) points += 1;
    if (value.length >= 12) points += 1;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) points += 1;
    if (/\d/.test(value)) points += 1;
    if (/[^A-Za-z0-9]/.test(value)) points += 1;
    return points;
  }, [value]);

  if (!value) return null;

  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong"];
  const tone = score <= 1 ? "danger" : score <= 2 ? "warning" : score <= 3 ? "info" : "success";

  return (
    <div className="mt-2">
      <ProgressBar
        value={(score / 5) * 100}
        size="xs"
        tone={tone as "danger"}
        label="Password strength"
        valueLabel={labels[Math.max(0, score - 1)]}
      />
    </div>
  );
}

function OtpBlock({
  label,
  target,
  value,
  onChange,
  verified,
  onVerify,
}: {
  label: string;
  target: string;
  value: string;
  onChange: (value: string) => void;
  verified: boolean;
  onVerify: () => void;
}) {
  return (
    <Card>
      <CardBody>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-fg">{label}</p>
            <p className="mt-0.5 truncate text-xs text-fg-muted">
              Code sent to {target}
            </p>
          </div>
          {verified ? (
            <Badge tone="published" size="sm">
              <IconCheck />
              Verified
            </Badge>
          ) : null}
        </div>

        {!verified ? (
          <div className="mt-3 flex items-center gap-2">
            <Input
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder="000000"
              inputMode="numeric"
              maxLength={6}
              aria-label={`${label} code`}
              className="max-w-[9rem] text-center font-mono tracking-[0.4em]"
            />
            <Button variant="secondary" onClick={onVerify}>
              Verify
            </Button>
            <Button variant="link" size="sm" className="ml-auto">
              Resend
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

interface UploadedDocument {
  id: string;
  name: string;
  size: number;
  type: string;
  progress: number;
}

const DOCUMENT_TYPES = [
  "Business registration",
  "Proof of address",
  "Authorised representative letter",
  "Accreditation certificate",
  "Rights schedule",
];

function DocumentUploader({
  documents,
  onChange,
}: {
  documents: UploadedDocument[];
  onChange: (documents: UploadedDocument[]) => void;
}) {
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const counter = React.useRef(0);

  /** Simulated transfer — the file never leaves the page. */
  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const added: UploadedDocument[] = Array.from(files).map((file) => {
      counter.current += 1;
      return {
        id: `doc_${counter.current}`,
        name: file.name,
        size: file.size,
        type: DOCUMENT_TYPES[counter.current % DOCUMENT_TYPES.length],
        progress: 0,
      };
    });

    onChange([...documents, ...added]);

    for (const doc of added) {
      let progress = 0;
      const timer = window.setInterval(() => {
        progress = Math.min(100, progress + 12 + Math.round(progress / 12));
        onChange(
          [...documents, ...added].map((item) =>
            item.id === doc.id ? { ...item, progress } : item,
          ),
        );
        if (progress >= 100) window.clearInterval(timer);
      }, 180);
    }
  };

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-fg">
        Supporting documents <span className="text-accent">*</span>
      </p>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(event.dataTransfer.files);
        }}
        className={cn(
          "rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          dragging ? "border-accent bg-accent/5" : "border-border bg-surface-2",
        )}
      >
        <IconFileUpload className="mx-auto size-7 text-fg-subtle" />
        <p className="mt-2 text-sm text-fg">
          Drop files here, or{" "}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="font-medium text-accent hover:underline"
          >
            browse
          </button>
        </p>
        <p className="mt-1 text-xs text-fg-subtle">
          PDF, JPG or PNG up to 20 MB each. Files stay in your browser.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          className="sr-only"
          onChange={(event) => addFiles(event.target.files)}
        />
      </div>

      {documents.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center gap-3 rounded border border-border bg-surface-2 p-2.5"
            >
              <IconUpload className="size-4 shrink-0 text-fg-subtle" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-fg">{doc.name}</p>
                <p className="text-2xs text-fg-subtle nx-tnum">
                  {doc.type} · {formatBytes(doc.size)}
                </p>
                {doc.progress < 100 ? (
                  <ProgressBar value={doc.progress} size="xs" className="mt-1.5" />
                ) : null}
              </div>
              {doc.progress === 100 ? (
                <Badge tone="published" size="sm">
                  <IconCheck />
                  Uploaded
                </Badge>
              ) : null}
              <button
                type="button"
                aria-label={`Remove ${doc.name}`}
                onClick={() => onChange(documents.filter((item) => item.id !== doc.id))}
                className="rounded p-1 text-fg-subtle transition-colors hover:text-danger"
              >
                <IconX className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
