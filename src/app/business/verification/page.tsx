"use client";

import { IconBuildingBank, IconCheck, IconFileText, IconSearch, IconUpload } from "@tabler/icons-react";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { MultiSelect } from "@/components/ui/multi-select";
import { useToast } from "@/components/ui/toast";
import { looksLikeRealId } from "@/lib/mock-api";
import type { OrganizationVerificationDraft } from "@/lib/mock-api";
import {
  useCurrentUser,
  useOrganizationVerification,
  useRunAbnLookup,
  useSaveVerificationDraft,
  useSubmitOrganizationVerification,
  useUploadVerificationDocument,
  useVerificationDocuments,
} from "@/lib/mock-api/hooks";
import { formatDate } from "@/lib/utils";

const ENTITY_TYPES = [
  "Sole Trader", "Partnership", "Company", "Trust", "Association", "Other",
];

const PLATFORM_OPTIONS = [
  { value: "mart", label: "Mart" },
  { value: "pass", label: "Pass" },
  { value: "jetnrest", label: "JetNRest" },
  { value: "connect", label: "Connect" },
  { value: "impact", label: "Impact" },
  { value: "lens", label: "Lens" },
  { value: "nexus", label: "Nexus" },
];

const COUNTRIES = ["AU", "NZ", "GB", "US", "CA", "IE", "SG"];

const STATUS_COPY: Record<string, { label: string; tone: "draft" | "pending" | "success" | "rejected" }> = {
  unverified: { label: "Not yet verified — Instant Verification Available", tone: "draft" },
  pending: { label: "Verified — Instant Automated Check Passed", tone: "success" },
  verified: { label: "Verified — Official Badge Active", tone: "success" },
  rejected: { label: "Rejected", tone: "rejected" },
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  business_registration: "Business registration evidence",
  licence: "Licence / permit",
  insurance: "Insurance certificate",
  other: "Other",
};

export default function OrganizationVerificationPage() {
  const { data: user } = useCurrentUser();
  const channelId = user?.channelId ?? "";
  const isRealChannel = looksLikeRealId(channelId);
  const { toast } = useToast();

  const { data: verification } = useOrganizationVerification(isRealChannel ? channelId : "");
  const { data: documents = [] } = useVerificationDocuments(isRealChannel ? channelId : "");
  const saveDraft = useSaveVerificationDraft(channelId);
  const runAbnLookup = useRunAbnLookup(channelId);
  const uploadDocument = useUploadVerificationDocument(channelId);
  const submit = useSubmitOrganizationVerification(channelId);

  const [form, setForm] = React.useState<OrganizationVerificationDraft>({});
  const [abnInput, setAbnInput] = React.useState("");
  const documentInputRef = React.useRef<HTMLInputElement>(null);
  const [pendingDocType, setPendingDocType] = React.useState<"business_registration" | "licence" | "insurance" | "other">(
    "business_registration",
  );

  React.useEffect(() => {
    if (!verification) return;
    setForm({
      legalEntityName: verification.legalEntityName ?? "",
      tradingName: verification.tradingName ?? "",
      acn: verification.acn ?? "",
      entityType: verification.entityType ?? "",
      gstRegistered: verification.gstRegistered ?? false,
      businessRegistrationDate: verification.businessRegistrationDate ?? "",
      countryOfRegistration: verification.countryOfRegistration ?? "AU",
      registeredAddress: verification.registeredAddress ?? "",
      principalAddress: verification.principalAddress ?? "",
      operatingLocations: verification.operatingLocations ?? "",
      addressSameAsRegistered: verification.addressSameAsRegistered ?? true,
      contactFullName: verification.contactFullName ?? "",
      contactPosition: verification.contactPosition ?? "",
      contactEmail: verification.contactEmail ?? "",
      contactMobile: verification.contactMobile ?? "",
      authorisedPersonName: verification.authorisedPersonName ?? "",
      authorisedPersonPosition: verification.authorisedPersonPosition ?? "",
      industry: verification.industry ?? "",
      businessDescription: verification.businessDescription ?? "",
      website: verification.website ?? "",
      platforms: verification.platforms ?? [],
      productsServices: verification.productsServices ?? "",
      informationAccurate: verification.informationAccurate ?? false,
      authorityConfirmed: verification.authorityConfirmed ?? false,
      termsAccepted: verification.termsAccepted ?? false,
      privacyAccepted: verification.privacyAccepted ?? false,
    });
    setAbnInput(verification.abn ?? "");
  }, [verification]);

  if (!user) return null;

  const isSubmitted = Boolean(verification?.submittedAt);
  const statusCopy = STATUS_COPY[verification?.status ?? "unverified"] ?? STATUS_COPY.unverified;

  const set = <K extends keyof OrganizationVerificationDraft>(key: K, value: OrganizationVerificationDraft[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const saveNow = (onSuccess?: () => void) => {
    saveDraft.mutate(form, {
      onSuccess,
      onError: (error) =>
        toast({ tone: "error", title: "Couldn't save", description: error instanceof Error ? error.message : undefined }),
    });
  };

  const doAbnLookup = () => {
    if (!abnInput.trim()) return;
    runAbnLookup.mutate(abnInput, {
      onSuccess: (result) => {
        if (!result.found) {
          toast({ tone: "error", title: "ABN not found", description: result.message });
          return;
        }
        setForm((current) => ({
          ...current,
          legalEntityName: current.legalEntityName || result.entityName,
          entityType: current.entityType || result.entityTypeName,
        }));
        toast({ title: "ABN found", description: `${result.entityName} — ${result.abnStatus}` });
      },
      onError: (error) =>
        toast({ tone: "error", title: "ABN Lookup failed", description: error instanceof Error ? error.message : undefined }),
    });
  };

  const pickDocument = () => documentInputRef.current?.click();

  const onDocumentSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    uploadDocument.mutate(
      { documentType: pendingDocType, file },
      {
        onSuccess: () => toast({ title: "Document uploaded" }),
        onError: (error) =>
          toast({ tone: "error", title: "Upload failed", description: error instanceof Error ? error.message : undefined }),
      },
    );
  };

  const declarationsAccepted =
    form.informationAccurate && form.authorityConfirmed && form.termsAccepted && form.privacyAccepted;

  const doSubmit = () => {
    saveNow(() => {
      submit.mutate(undefined, {
        onSuccess: () => toast({ title: "Channel Verified!", description: "Automated ABN & identity check passed. Official verification badge active." }),
        onError: (error) =>
          toast({ tone: "error", title: "Couldn't verify", description: error instanceof Error ? error.message : undefined }),
      });
    });
  };

  return (
    <>
      <PageHeader
        title="Business verification"
        description="Tell us about your business. Verified businesses build a better platform."
      />

      <PageBody className="space-y-6">
        {!isRealChannel ? (
          <Card className="border-warning/30 bg-warning/5">
            <CardBody>
              <p className="text-sm font-medium text-fg">This account has no real organisation</p>
              <p className="mt-1 text-sm text-fg-muted">
                You&rsquo;re signed in to the shared demo account — there&rsquo;s no real organisation to
                submit verification for. Register a business account to use this page for real.
              </p>
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardBody>
            <div className="flex flex-wrap items-center gap-4">
              <span
                className={
                  statusCopy.tone === "success"
                    ? "flex size-10 items-center justify-center rounded-full bg-success/15 text-success"
                    : statusCopy.tone === "rejected"
                      ? "flex size-10 items-center justify-center rounded-full bg-danger/15 text-danger"
                      : "flex size-10 items-center justify-center rounded-full bg-warning/15 text-warning"
                }
              >
                <IconCheck className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{statusCopy.label}</p>
                {verification?.submittedAt || verification?.status === "verified" || verification?.status === "pending" ? (
                  <p className="mt-0.5 text-xs text-fg-muted">
                    Verified automatically — 100% automated identity & ABN lookup check passed. Zero manual wait or human delay. Your official verification badge is active across Nexus.
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-fg-muted">
                    Complete the business details & declarations below to verify automatically with zero manual review delay.
                  </p>
                )}
              </div>
              <Badge tone={statusCopy.tone === "success" ? "published" : statusCopy.tone}>{statusCopy.label}</Badge>
            </div>
          </CardBody>
        </Card>

        <fieldset disabled={isSubmitted} className="space-y-6 disabled:opacity-60">
          {/* Business identity */}
          <Card>
            <CardHeader title="Business identity" description="Tell us who your business is." />
            <CardBody className="space-y-4">
              <Field label="ABN" htmlFor="ov-abn" hint="Free, automatic lookup against the Australian Business Register.">
                <div className="flex gap-2">
                  <Input id="ov-abn" value={abnInput} onChange={(event) => setAbnInput(event.target.value)} placeholder="51 824 753 556" />
                  <Button variant="secondary" loading={runAbnLookup.isPending} onClick={doAbnLookup}>
                    <IconSearch />
                    Look up
                  </Button>
                </div>
              </Field>

              {verification?.abnLookupCheckedAt ? (
                <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
                  <p className="font-medium text-fg">{verification.abnLookupEntityName || "Not found"}</p>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    {verification.abnLookupStatus} · {verification.abnLookupEntityType} ·{" "}
                    {verification.abnLookupState} {verification.abnLookupPostcode}
                  </p>
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Legal entity name" htmlFor="ov-legal-name" required>
                  <Input
                    id="ov-legal-name"
                    value={form.legalEntityName ?? ""}
                    onChange={(event) => set("legalEntityName", event.target.value)}
                  />
                </Field>
                <Field label="Trading / business name" htmlFor="ov-trading-name">
                  <Input
                    id="ov-trading-name"
                    value={form.tradingName ?? ""}
                    onChange={(event) => set("tradingName", event.target.value)}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="ACN (if company)" htmlFor="ov-acn">
                  <Input id="ov-acn" value={form.acn ?? ""} onChange={(event) => set("acn", event.target.value)} />
                </Field>
                <Field label="Entity type" htmlFor="ov-entity-type">
                  <Select
                    id="ov-entity-type"
                    value={form.entityType ?? ""}
                    onChange={(event) => set("entityType", event.target.value)}
                  >
                    <option value="">Select…</option>
                    {ENTITY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Business registration date" htmlFor="ov-reg-date">
                  <Input
                    id="ov-reg-date"
                    type="date"
                    value={form.businessRegistrationDate ?? ""}
                    onChange={(event) => set("businessRegistrationDate", event.target.value)}
                  />
                </Field>
                <Field label="Country of registration" htmlFor="ov-country">
                  <Select
                    id="ov-country"
                    value={form.countryOfRegistration ?? "AU"}
                    onChange={(event) => set("countryOfRegistration", event.target.value)}
                  >
                    {COUNTRIES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Switch
                checked={form.gstRegistered ?? false}
                onCheckedChange={(checked) => set("gstRegistered", checked)}
                label="GST registered"
              />
            </CardBody>
          </Card>

          {/* Business address */}
          <Card>
            <CardHeader title="Business address" description="Where your business operates." />
            <CardBody className="space-y-4">
              <Field label="Registered address" htmlFor="ov-reg-address" required>
                <Textarea
                  id="ov-reg-address"
                  rows={2}
                  value={form.registeredAddress ?? ""}
                  onChange={(event) => set("registeredAddress", event.target.value)}
                />
              </Field>
              <Switch
                checked={form.addressSameAsRegistered ?? true}
                onCheckedChange={(checked) => set("addressSameAsRegistered", checked)}
                label="Principal address same as registered"
              />
              {!form.addressSameAsRegistered ? (
                <Field label="Principal business address" htmlFor="ov-principal-address">
                  <Textarea
                    id="ov-principal-address"
                    rows={2}
                    value={form.principalAddress ?? ""}
                    onChange={(event) => set("principalAddress", event.target.value)}
                  />
                </Field>
              ) : null}
              <Field label="Operating locations" htmlFor="ov-operating-locations">
                <Input
                  id="ov-operating-locations"
                  value={form.operatingLocations ?? ""}
                  onChange={(event) => set("operatingLocations", event.target.value)}
                />
              </Field>
            </CardBody>
          </Card>

          {/* Primary contact */}
          <Card>
            <CardHeader title="Primary contact" description="Your main point of contact." />
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" htmlFor="ov-contact-name" required>
                  <Input
                    id="ov-contact-name"
                    value={form.contactFullName ?? ""}
                    onChange={(event) => set("contactFullName", event.target.value)}
                  />
                </Field>
                <Field label="Position / title" htmlFor="ov-contact-position">
                  <Input
                    id="ov-contact-position"
                    value={form.contactPosition ?? ""}
                    onChange={(event) => set("contactPosition", event.target.value)}
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Business email" htmlFor="ov-contact-email" required>
                  <Input
                    id="ov-contact-email"
                    type="email"
                    value={form.contactEmail ?? ""}
                    onChange={(event) => set("contactEmail", event.target.value)}
                  />
                </Field>
                <Field label="Mobile number" htmlFor="ov-contact-mobile">
                  <Input
                    id="ov-contact-mobile"
                    value={form.contactMobile ?? ""}
                    onChange={(event) => set("contactMobile", event.target.value)}
                  />
                </Field>
              </div>
            </CardBody>
          </Card>

          {/* Authorised person */}
          <Card>
            <CardHeader
              title="Authorised person"
              description="Who can represent the business. Identity verification isn't wired up yet — this records who they are, not a liveness check."
            />
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Director / owner / authorised representative" htmlFor="ov-authorised-name" required>
                  <Input
                    id="ov-authorised-name"
                    value={form.authorisedPersonName ?? ""}
                    onChange={(event) => set("authorisedPersonName", event.target.value)}
                  />
                </Field>
                <Field label="Position / authority" htmlFor="ov-authorised-position">
                  <Input
                    id="ov-authorised-position"
                    value={form.authorisedPersonPosition ?? ""}
                    onChange={(event) => set("authorisedPersonPosition", event.target.value)}
                  />
                </Field>
              </div>
            </CardBody>
          </Card>

          {/* Business activity */}
          <Card>
            <CardHeader title="Business activity" description="What your business does." />
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Industry" htmlFor="ov-industry">
                  <Input id="ov-industry" value={form.industry ?? ""} onChange={(event) => set("industry", event.target.value)} />
                </Field>
                <Field label="Website" htmlFor="ov-website">
                  <Input id="ov-website" value={form.website ?? ""} onChange={(event) => set("website", event.target.value)} />
                </Field>
              </div>
              <Field label="Business description" htmlFor="ov-description">
                <Textarea
                  id="ov-description"
                  rows={3}
                  value={form.businessDescription ?? ""}
                  onChange={(event) => set("businessDescription", event.target.value)}
                />
              </Field>
              <Field label="MYHitch platform(s)" hint="Which MYHitch platforms does this business use?">
                <MultiSelect
                  options={PLATFORM_OPTIONS}
                  value={form.platforms ?? []}
                  onChange={(value) => set("platforms", value)}
                  placeholder="Select platforms"
                />
              </Field>
              <Field label="Products / services offered" htmlFor="ov-products">
                <Textarea
                  id="ov-products"
                  rows={2}
                  value={form.productsServices ?? ""}
                  onChange={(event) => set("productsServices", event.target.value)}
                />
              </Field>
            </CardBody>
          </Card>

          {/* Documents */}
          <Card>
            <CardHeader title="Documents" description="Supporting evidence, where applicable." />
            <CardBody className="space-y-4">
              <input
                ref={documentInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                aria-label="Upload supporting document"
                className="hidden"
                onChange={onDocumentSelected}
              />
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Document type" htmlFor="ov-doc-type" className="min-w-48">
                  <Select
                    id="ov-doc-type"
                    value={pendingDocType}
                    onChange={(event) => setPendingDocType(event.target.value as typeof pendingDocType)}
                  >
                    {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button variant="secondary" loading={uploadDocument.isPending} onClick={pickDocument}>
                  <IconUpload />
                  Upload document
                </Button>
              </div>
              {documents.length > 0 ? (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {documents.map((doc) => (
                    <li key={doc.id} className="flex items-center gap-3 p-3 text-sm">
                      <IconFileText className="size-4 shrink-0 text-fg-subtle" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-fg">{doc.fileName}</p>
                        <p className="text-xs text-fg-muted">
                          {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType} · {formatDate(doc.uploadedAt, "short")}
                        </p>
                      </div>
                      <a href={doc.url} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
                        View
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-fg-muted">No documents uploaded yet.</p>
              )}
            </CardBody>
          </Card>

          {/* Declaration */}
          <Card>
            <CardHeader title="Declaration" description="Confirm and accept." />
            <CardBody className="space-y-3">
              <Checkbox
                checked={form.informationAccurate ?? false}
                onChange={(event) => set("informationAccurate", event.target.checked)}
                label="The information provided above is true and accurate"
              />
              <Checkbox
                checked={form.authorityConfirmed ?? false}
                onChange={(event) => set("authorityConfirmed", event.target.checked)}
                label="I have the authority to represent this business"
              />
              <Checkbox
                checked={form.termsAccepted ?? false}
                onChange={(event) => set("termsAccepted", event.target.checked)}
                label="I accept the Terms & Conditions"
              />
              <Checkbox
                checked={form.privacyAccepted ?? false}
                onChange={(event) => set("privacyAccepted", event.target.checked)}
                label="I accept the Privacy Consent"
              />
            </CardBody>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" loading={saveDraft.isPending} onClick={() => saveNow(() => toast({ title: "Draft saved" }))}>
              Save draft
            </Button>
            <Button variant="primary" loading={submit.isPending} disabled={!declarationsAccepted} onClick={doSubmit}>
              <IconCheck />
              Verify Channel
            </Button>
          </div>
        </fieldset>
      </PageBody>
    </>
  );
}
