"use client";

import {
  IconAlertTriangle,
  IconEye,
  IconPlus,
  IconShieldCheck,
  IconTarget,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, Input, RadioCard, Select, Switch } from "@/components/ui/field";
import { MultiSelect } from "@/components/ui/multi-select";
import { Stepper } from "@/components/ui/stepper";
import { useToast } from "@/components/ui/toast";
import {
  AGE_BANDS,
  BRAND_SAFETY_LABELS,
  DEVICES,
  INTERESTS,
  PLACEMENT_FORMATS,
} from "@/lib/mock-api/data/advertising";
import { categories } from "@/lib/mock-api/data/categories";
import { useCreateCampaign } from "@/lib/mock-api/hooks";
import type { AgeRating, Campaign, CampaignCreative } from "@/lib/mock-api/types";
import { cn, compactNumber, formatCurrency } from "@/lib/utils";

const STEPS = [
  { id: "basics", title: "Basics", description: "Name, objective, dates" },
  { id: "budget", title: "Budget", description: "Spend and pacing" },
  { id: "targeting", title: "Targeting", description: "Who sees this" },
  { id: "creative", title: "Creative", description: "Assets and formats" },
  { id: "safety", title: "Brand safety", description: "Where it must not run" },
  { id: "review", title: "Review", description: "Check and submit" },
];

const COUNTRIES = [
  "GB", "IE", "DE", "FR", "ES", "PT", "NL", "IT", "PL", "US", "CA", "AU", "LK", "IN",
].map((code) => ({ value: code, label: code }));

const LANGUAGES = [
  "English", "German", "French", "Spanish", "Portuguese", "Dutch", "Polish", "Sinhala",
].map((value) => ({ value, label: value }));

const CREATIVE_GRADIENTS: Array<[string, string]> = [
  ["#0E4C5E", "#04141B"],
  ["#5C2A14", "#170A05"],
  ["#123A2E", "#05120E"],
  ["#2A1B4D", "#0B1020"],
];

export default function NewCampaignPage() {
  const router = useRouter();
  const { toast } = useToast();
  const createCampaign = useCreateCampaign();

  const [step, setStep] = React.useState(0);
  const [furthest, setFurthest] = React.useState(0);

  // Basics
  const [name, setName] = React.useState("");
  const [objective, setObjective] = React.useState<Campaign["objective"]>("awareness");
  const [startDate, setStartDate] = React.useState("2026-08-20");
  const [endDate, setEndDate] = React.useState("2026-09-20");

  // Budget
  const [budget, setBudget] = React.useState("25000");
  const [dailyCap, setDailyCap] = React.useState("1200");
  const [bidStrategy, setBidStrategy] = React.useState("auto");

  // Targeting
  const [countries, setCountries] = React.useState<string[]>(["GB"]);
  const [languages, setLanguages] = React.useState<string[]>(["English"]);
  const [ageBands, setAgeBands] = React.useState<string[]>([]);
  const [interests, setInterests] = React.useState<string[]>([]);
  const [categoryIds, setCategoryIds] = React.useState<string[]>([]);
  const [devices, setDevices] = React.useState<string[]>([]);

  // Creative
  const [creatives, setCreatives] = React.useState<CampaignCreative[]>([]);
  const [placements, setPlacements] = React.useState<string[]>(["pre-roll"]);
  const [frequencyImpressions, setFrequencyImpressions] = React.useState("3");
  const [frequencyHours, setFrequencyHours] = React.useState("24");

  // Brand safety
  const [excludedLabels, setExcludedLabels] = React.useState<string[]>([
    "Graphic content",
    "Gambling",
  ]);
  const [minAgeRating, setMinAgeRating] = React.useState<AgeRating>("U");
  const [blockUserGenerated, setBlockUserGenerated] = React.useState(false);

  const budgetMinor = Math.round(Number(budget || 0) * 100);
  const dailyMinor = Math.round(Number(dailyCap || 0) * 100);

  /** Rough, deliberately transparent reach model — no ad server is involved. */
  const estimate = React.useMemo(() => {
    const base = 12_000_000;
    const geo = Math.max(0.15, countries.length * 0.16);
    const age = ageBands.length ? Math.max(0.2, ageBands.length / AGE_BANDS.length) : 1;
    const interest = interests.length ? Math.max(0.25, interests.length / 12) : 1;
    const cat = categoryIds.length ? Math.max(0.3, categoryIds.length / 16) : 1;
    const device = devices.length ? Math.max(0.4, devices.length / DEVICES.length) : 1;
    const ugc = blockUserGenerated ? 0.72 : 1;
    const reach = Math.round(base * geo * age * interest * cat * device * ugc);
    const cpm = 320 + excludedLabels.length * 18;
    const impressions = budgetMinor ? Math.round((budgetMinor / cpm) * 1000) : 0;
    return { reach, impressions, cpm };
  }, [
    countries.length,
    ageBands.length,
    interests.length,
    categoryIds.length,
    devices.length,
    blockUserGenerated,
    excludedLabels.length,
    budgetMinor,
  ]);

  const canContinue = (() => {
    switch (STEPS[step].id) {
      case "basics":
        return name.trim().length > 2 && Boolean(startDate) && Boolean(endDate);
      case "budget":
        return budgetMinor > 0 && dailyMinor > 0;
      case "targeting":
        return countries.length > 0 && languages.length > 0;
      case "creative":
        return creatives.length > 0 && placements.length > 0;
      default:
        return true;
    }
  })();

  const addCreative = () => {
    const index = creatives.length;
    setCreatives((current) => [
      ...current,
      {
        id: `cre_${index + 1}`,
        name: `Creative ${index + 1}`,
        format: (placements[0] as CampaignCreative["format"]) ?? "pre-roll",
        durationSeconds: 30,
        gradient: CREATIVE_GRADIENTS[index % CREATIVE_GRADIENTS.length],
        clickThroughLabel: "Learn more",
        status: "pending",
      },
    ]);
  };

  const submit = async () => {
    const campaign = await createCampaign.mutateAsync({
      advertiserId: "ch_helio",
      advertiserName: "Helio Motors",
      name: name.trim(),
      objective,
      budget: { amount: budgetMinor, currency: "GBP" },
      dailyCap: { amount: dailyMinor, currency: "GBP" },
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      targeting: { countries, languages, ageBands, interests, categoryIds, devices },
      creatives,
      placements,
      frequencyCap: {
        impressions: Number(frequencyImpressions) || 3,
        perHours: Number(frequencyHours) || 24,
      },
      brandSafety: { excludedLabels, minAgeRating, blockUserGenerated },
    });

    toast({
      title: "Campaign submitted",
      description: `“${campaign.name}” is pending approval and now appears in the admin review queue.`,
    });
    router.push("/business/campaigns");
  };

  return (
    <>
      <PageHeader
        title="New campaign"
        description="Build a campaign, then submit it for approval. No ad server, targeting service or measurement provider is contacted — everything here is mocked."
        breadcrumb={
          <Button variant="ghost" size="xs" href="/business/campaigns">
            ← Campaigns
          </Button>
        }
      />

      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)_18rem]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <Stepper
              steps={STEPS}
              current={step}
              furthestReached={furthest}
              onStepClick={setStep}
              orientation="vertical"
            />
          </aside>

          <div className="min-w-0">
            <Card>
              <CardHeader
                title={STEPS[step].title}
                description={STEPS[step].description}
                action={
                  <span className="text-xs text-fg-subtle nx-tnum">
                    Step {step + 1} of {STEPS.length}
                  </span>
                }
              />
              <CardBody className="space-y-5">
                {/* ------------------------- Basics ------------------------ */}
                {STEPS[step].id === "basics" ? (
                  <>
                    <Field label="Campaign name" htmlFor="c-name" required>
                      <Input
                        id="c-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Aurora launch — UK & DE awareness"
                      />
                    </Field>

                    <div>
                      <p className="mb-2 text-sm font-medium text-fg">Objective</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {[
                          { value: "awareness", title: "Awareness", description: "Maximise reach and completed views." },
                          { value: "consideration", title: "Consideration", description: "Drive engagement with longer content." },
                          { value: "traffic", title: "Traffic", description: "Send viewers to your channel or site." },
                          { value: "conversion", title: "Conversion", description: "Optimise for sign-ups or purchases." },
                        ].map((option) => (
                          <RadioCard
                            key={option.value}
                            name="objective"
                            value={option.value}
                            checked={objective === option.value}
                            onChange={(value) =>
                              setObjective(value as Campaign["objective"])
                            }
                            title={option.title}
                            description={option.description}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Start date" htmlFor="c-start" required>
                        <DatePicker id="c-start" value={startDate} onChange={setStartDate} />
                      </Field>
                      <Field label="End date" htmlFor="c-end" required>
                        <DatePicker
                          id="c-end"
                          value={endDate}
                          onChange={setEndDate}
                          min={startDate}
                        />
                      </Field>
                    </div>
                  </>
                ) : null}

                {/* ------------------------- Budget ------------------------ */}
                {STEPS[step].id === "budget" ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        label="Total budget (£)"
                        htmlFor="c-budget"
                        required
                        hint="The most this campaign can spend in total."
                      >
                        <Input
                          id="c-budget"
                          value={budget}
                          onChange={(event) => setBudget(event.target.value)}
                          inputMode="decimal"
                        />
                      </Field>
                      <Field
                        label="Daily cap (£)"
                        htmlFor="c-daily"
                        required
                        hint="Paces delivery so the budget lasts the flight."
                      >
                        <Input
                          id="c-daily"
                          value={dailyCap}
                          onChange={(event) => setDailyCap(event.target.value)}
                          inputMode="decimal"
                        />
                      </Field>
                    </div>

                    <Field label="Bid strategy" htmlFor="c-bid">
                      <Select
                        id="c-bid"
                        value={bidStrategy}
                        onChange={(event) => setBidStrategy(event.target.value)}
                      >
                        <option value="auto">Automatic — maximise delivery</option>
                        <option value="cpm">Target CPM</option>
                        <option value="cpv">Target cost per completed view</option>
                        <option value="cpc">Target cost per click</option>
                      </Select>
                    </Field>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <Stat
                        label="Estimated CPM"
                        value={formatCurrency(estimate.cpm)}
                      />
                      <Stat
                        label="Estimated impressions"
                        value={compactNumber(estimate.impressions)}
                      />
                      <Stat
                        label="Flight length"
                        value={`${Math.max(
                          1,
                          Math.round(
                            (new Date(endDate).getTime() - new Date(startDate).getTime()) /
                              86_400_000,
                          ),
                        )} days`}
                      />
                    </div>
                  </>
                ) : null}

                {/* ------------------------ Targeting ---------------------- */}
                {STEPS[step].id === "targeting" ? (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Countries" required>
                        <MultiSelect
                          options={COUNTRIES}
                          value={countries}
                          onChange={setCountries}
                          placeholder="Select countries"
                        />
                      </Field>
                      <Field label="Languages" required>
                        <MultiSelect
                          options={LANGUAGES}
                          value={languages}
                          onChange={setLanguages}
                          placeholder="Select languages"
                        />
                      </Field>
                    </div>

                    <Field
                      label="Age bands"
                      hint="Leave empty to reach all ages permitted by your brand-safety settings."
                    >
                      <div className="flex flex-wrap gap-1.5">
                        {AGE_BANDS.map((band) => (
                          <button
                            key={band}
                            type="button"
                            aria-pressed={ageBands.includes(band)}
                            onClick={() =>
                              setAgeBands((current) =>
                                current.includes(band)
                                  ? current.filter((b) => b !== band)
                                  : [...current, band],
                              )
                            }
                            className={cn(
                              "rounded-full border px-3 py-1 text-xs transition-colors",
                              ageBands.includes(band)
                                ? "border-accent bg-accent/10 font-medium text-accent-hover"
                                : "border-border bg-surface-2 text-fg-muted hover:border-border-strong",
                            )}
                          >
                            {band}
                          </button>
                        ))}
                      </div>
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Interests">
                        <MultiSelect
                          options={INTERESTS.map((value) => ({ value, label: value }))}
                          value={interests}
                          onChange={setInterests}
                          placeholder="Any interest"
                          allLabel="All interests"
                        />
                      </Field>
                      <Field label="Content categories">
                        <MultiSelect
                          options={categories.map((category) => ({
                            value: category.id,
                            label: category.name,
                          }))}
                          value={categoryIds}
                          onChange={setCategoryIds}
                          placeholder="Any category"
                          allLabel="All categories"
                        />
                      </Field>
                    </div>

                    <Field label="Devices">
                      <div className="flex flex-wrap gap-1.5">
                        {DEVICES.map((device) => (
                          <button
                            key={device}
                            type="button"
                            aria-pressed={devices.includes(device)}
                            onClick={() =>
                              setDevices((current) =>
                                current.includes(device)
                                  ? current.filter((d) => d !== device)
                                  : [...current, device],
                              )
                            }
                            className={cn(
                              "rounded-full border px-3 py-1 text-xs transition-colors",
                              devices.includes(device)
                                ? "border-accent bg-accent/10 font-medium text-accent-hover"
                                : "border-border bg-surface-2 text-fg-muted hover:border-border-strong",
                            )}
                          >
                            {device}
                          </button>
                        ))}
                      </div>
                    </Field>
                  </>
                ) : null}

                {/* ------------------------- Creative ---------------------- */}
                {STEPS[step].id === "creative" ? (
                  <>
                    <div>
                      <p className="mb-2 text-sm font-medium text-fg">
                        Placement formats
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {PLACEMENT_FORMATS.map((format) => (
                          <label
                            key={format.id}
                            className={cn(
                              "flex cursor-pointer gap-2.5 rounded border p-3 transition-colors",
                              placements.includes(format.id)
                                ? "border-accent bg-accent/[0.07]"
                                : "border-border bg-surface-2 hover:border-border-strong",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={placements.includes(format.id)}
                              onChange={() =>
                                setPlacements((current) =>
                                  current.includes(format.id)
                                    ? current.filter((p) => p !== format.id)
                                    : [...current, format.id],
                                )
                              }
                              className="mt-0.5 size-4 shrink-0 rounded-sm border border-border-strong bg-surface accent-[rgb(var(--nx-accent))]"
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-fg">
                                {format.label}
                              </span>
                              <span className="mt-0.5 block text-xs text-fg-muted">
                                {format.description}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-border pt-5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-fg">Creatives</p>
                        <Button variant="secondary" size="sm" onClick={addCreative}>
                          <IconPlus />
                          Add creative
                        </Button>
                      </div>

                      {creatives.length === 0 ? (
                        <div className="mt-3 rounded-lg border-2 border-dashed border-border bg-surface-2 px-6 py-10 text-center">
                          <p className="text-sm text-fg-muted">
                            No creatives yet. Add at least one to continue.
                          </p>
                          <Button variant="primary" size="sm" className="mt-3" onClick={addCreative}>
                            Add your first creative
                          </Button>
                        </div>
                      ) : (
                        <ul className="mt-3 space-y-3">
                          {creatives.map((creative, index) => (
                            <li
                              key={creative.id}
                              className="rounded-lg border border-border p-3"
                            >
                              <div className="flex flex-wrap items-start gap-3">
                                <span
                                  aria-hidden
                                  className="h-16 w-28 shrink-0 rounded"
                                  style={{
                                    backgroundImage: `linear-gradient(140deg, ${creative.gradient[0]}, ${creative.gradient[1]})`,
                                  }}
                                />
                                <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                                  <Field label="Name">
                                    <Input
                                      value={creative.name}
                                      sizeVariant="sm"
                                      onChange={(event) =>
                                        setCreatives((current) =>
                                          current.map((item, i) =>
                                            i === index
                                              ? { ...item, name: event.target.value }
                                              : item,
                                          ),
                                        )
                                      }
                                    />
                                  </Field>
                                  <Field label="Format">
                                    <Select
                                      value={creative.format}
                                      sizeVariant="sm"
                                      onChange={(event) =>
                                        setCreatives((current) =>
                                          current.map((item, i) =>
                                            i === index
                                              ? {
                                                  ...item,
                                                  format: event.target
                                                    .value as CampaignCreative["format"],
                                                }
                                              : item,
                                          ),
                                        )
                                      }
                                    >
                                      {PLACEMENT_FORMATS.map((format) => (
                                        <option key={format.id} value={format.id}>
                                          {format.label}
                                        </option>
                                      ))}
                                    </Select>
                                  </Field>
                                  <Field label="Duration (seconds)">
                                    <Input
                                      value={String(creative.durationSeconds)}
                                      sizeVariant="sm"
                                      inputMode="numeric"
                                      onChange={(event) =>
                                        setCreatives((current) =>
                                          current.map((item, i) =>
                                            i === index
                                              ? {
                                                  ...item,
                                                  durationSeconds:
                                                    Number(event.target.value) || 0,
                                                }
                                              : item,
                                          ),
                                        )
                                      }
                                    />
                                  </Field>
                                  <Field label="Call to action">
                                    <Input
                                      value={creative.clickThroughLabel}
                                      sizeVariant="sm"
                                      onChange={(event) =>
                                        setCreatives((current) =>
                                          current.map((item, i) =>
                                            i === index
                                              ? {
                                                  ...item,
                                                  clickThroughLabel: event.target.value,
                                                }
                                              : item,
                                          ),
                                        )
                                      }
                                    />
                                  </Field>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Remove ${creative.name}`}
                                  onClick={() =>
                                    setCreatives((current) =>
                                      current.filter((_, i) => i !== index),
                                    )
                                  }
                                >
                                  <IconTrash />
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="border-t border-border pt-5">
                      <p className="text-sm font-medium text-fg">Frequency cap</p>
                      <p className="mt-1 text-xs text-fg-muted">
                        Limits how often one viewer sees this campaign.
                      </p>
                      <div className="mt-3 flex flex-wrap items-end gap-3">
                        <Field label="Impressions" className="w-32">
                          <Input
                            value={frequencyImpressions}
                            onChange={(event) =>
                              setFrequencyImpressions(event.target.value)
                            }
                            inputMode="numeric"
                            sizeVariant="sm"
                          />
                        </Field>
                        <span className="pb-2 text-sm text-fg-muted">per</span>
                        <Field label="Hours" className="w-32">
                          <Input
                            value={frequencyHours}
                            onChange={(event) => setFrequencyHours(event.target.value)}
                            inputMode="numeric"
                            sizeVariant="sm"
                          />
                        </Field>
                      </div>
                    </div>
                  </>
                ) : null}

                {/* ------------------------- Safety ------------------------ */}
                {STEPS[step].id === "safety" ? (
                  <>
                    <Field
                      label="Do not run alongside"
                      hint="Your ads will be withheld from any video carrying these labels."
                    >
                      <div className="flex flex-wrap gap-1.5">
                        {BRAND_SAFETY_LABELS.map((label) => (
                          <button
                            key={label}
                            type="button"
                            aria-pressed={excludedLabels.includes(label)}
                            onClick={() =>
                              setExcludedLabels((current) =>
                                current.includes(label)
                                  ? current.filter((l) => l !== label)
                                  : [...current, label],
                              )
                            }
                            className={cn(
                              "rounded-full border px-3 py-1 text-xs transition-colors",
                              excludedLabels.includes(label)
                                ? "border-danger bg-danger/10 font-medium text-danger"
                                : "border-border bg-surface-2 text-fg-muted hover:border-border-strong",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </Field>

                    <Field
                      label="Minimum age rating of surrounding content"
                      htmlFor="c-rating"
                    >
                      <Select
                        id="c-rating"
                        value={minAgeRating}
                        onChange={(event) =>
                          setMinAgeRating(event.target.value as AgeRating)
                        }
                        className="max-w-xs"
                      >
                        {(["U", "PG", "12", "15", "18"] as AgeRating[]).map((rating) => (
                          <option key={rating} value={rating}>
                            {rating} and above
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <Switch
                      checked={blockUserGenerated}
                      onCheckedChange={setBlockUserGenerated}
                      label="Exclude user-generated content"
                      description="Restricts delivery to verified business, film, education, news and organisation channels. Reduces reach by roughly 28%."
                    />

                    <p className="flex items-start gap-2 rounded border border-info/30 bg-info/10 p-3 text-xs leading-relaxed text-fg-muted">
                      <IconShieldCheck className="mt-0.5 size-4 shrink-0 text-info" />
                      Brand-safety rules are applied at delivery time. Tighter rules
                      reduce available inventory and typically raise CPM.
                    </p>
                  </>
                ) : null}

                {/* ------------------------- Review ------------------------ */}
                {STEPS[step].id === "review" ? (
                  <div className="space-y-4">
                    <dl className="divide-y divide-border text-sm">
                      <ReviewRow label="Name" value={name || "—"} />
                      <ReviewRow label="Objective" value={objective} />
                      <ReviewRow
                        label="Flight"
                        value={`${startDate} → ${endDate}`}
                      />
                      <ReviewRow
                        label="Budget"
                        value={`${formatCurrency(budgetMinor)} total · ${formatCurrency(dailyMinor)} / day`}
                      />
                      <ReviewRow label="Countries" value={countries.join(", ")} />
                      <ReviewRow label="Languages" value={languages.join(", ")} />
                      <ReviewRow
                        label="Age bands"
                        value={ageBands.length ? ageBands.join(", ") : "All"}
                      />
                      <ReviewRow
                        label="Interests"
                        value={interests.length ? interests.join(", ") : "All"}
                      />
                      <ReviewRow
                        label="Devices"
                        value={devices.length ? devices.join(", ") : "All"}
                      />
                      <ReviewRow
                        label="Placements"
                        value={placements.join(", ")}
                      />
                      <ReviewRow
                        label="Creatives"
                        value={`${creatives.length} asset${creatives.length === 1 ? "" : "s"}`}
                      />
                      <ReviewRow
                        label="Frequency cap"
                        value={`${frequencyImpressions} per ${frequencyHours} hours`}
                      />
                      <ReviewRow
                        label="Excluded labels"
                        value={excludedLabels.length ? excludedLabels.join(", ") : "None"}
                      />
                      <ReviewRow
                        label="Status on submit"
                        value={<Badge tone="pending" size="sm">Pending approval</Badge>}
                      />
                    </dl>

                    <p className="flex items-start gap-2 rounded border border-warning/30 bg-warning/10 p-3 text-xs leading-relaxed text-fg-muted">
                      <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                      Submitting sends this campaign to the platform review queue. It
                      will not deliver until an admin approves it.
                    </p>
                  </div>
                ) : null}
              </CardBody>
            </Card>

            <div className="mt-4 flex items-center justify-between gap-3">
              <Button
                variant="ghost"
                onClick={() => setStep((current) => Math.max(0, current - 1))}
                disabled={step === 0}
              >
                Back
              </Button>
              {step === STEPS.length - 1 ? (
                <Button
                  variant="primary"
                  onClick={submit}
                  loading={createCampaign.isPending}
                >
                  Submit for approval
                </Button>
              ) : (
                <Button
                  variant="primary"
                  disabled={!canContinue}
                  onClick={() => {
                    const next = Math.min(step + 1, STEPS.length - 1);
                    setStep(next);
                    setFurthest((current) => Math.max(current, next));
                  }}
                >
                  Continue
                </Button>
              )}
            </div>
          </div>

          {/* Live estimate panel */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <IconTarget className="size-4 text-accent" />
                    Estimated delivery
                  </span>
                }
                description="Updates as you change targeting."
              />
              <CardBody className="space-y-4">
                <div>
                  <p className="text-2xs uppercase tracking-wide text-fg-subtle">
                    Addressable audience
                  </p>
                  <p className="font-display text-2xl font-semibold text-fg nx-tnum">
                    {compactNumber(estimate.reach)}
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-300"
                      style={{
                        width: `${Math.min(100, (estimate.reach / 12_000_000) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-2xs text-fg-subtle">
                    of 12.0M monthly viewers
                  </p>
                </div>

                <dl className="space-y-2 border-t border-border pt-3 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-fg-muted">Impressions</dt>
                    <dd className="text-fg nx-tnum">
                      {compactNumber(estimate.impressions)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-fg-muted">Est. CPM</dt>
                    <dd className="text-fg nx-tnum">{formatCurrency(estimate.cpm)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-fg-muted">Creatives</dt>
                    <dd className="text-fg nx-tnum">{creatives.length}</dd>
                  </div>
                </dl>

                <p className="flex items-start gap-2 border-t border-border pt-3 text-2xs leading-relaxed text-fg-subtle">
                  <IconEye className="mt-0.5 size-3.5 shrink-0" />
                  Figures are illustrative and generated locally. No forecasting or
                  measurement service is called.
                </p>
              </CardBody>
            </Card>
          </aside>
        </div>
      </PageBody>
    </>
  );
}

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[11rem_1fr]">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="text-fg">{value}</dd>
    </div>
  );
}
