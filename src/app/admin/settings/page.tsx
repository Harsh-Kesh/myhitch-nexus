"use client";

import { IconPlus } from "@tabler/icons-react";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { CONTENT_TYPE_LABELS } from "@/lib/mock-api/data/categories";
import {
  useAddCategory,
  usePlatformConfig,
  useUpdateConfigTable,
} from "@/lib/mock-api/hooks";
import type { ContentType, PlatformConfigTables } from "@/lib/mock-api/types";
import { cn, formatCurrency, formatDate, slugify } from "@/lib/utils";

const TABS = [
  { value: "categories", label: "Categories" },
  { value: "labels", label: "Content labels" },
  { value: "pricing", label: "Pricing rules" },
  { value: "commissions", label: "Commissions" },
  { value: "taxes", label: "Taxes" },
  { value: "currencies", label: "Currencies" },
  { value: "payouts", label: "Payout rules" },
];

export default function AdminSettingsPage() {
  const { data: config, isLoading } = usePlatformConfig();
  const addCategory = useAddCategory();
  const updateTable = useUpdateConfigTable();
  const { toast } = useToast();

  const [tab, setTab] = React.useState("categories");
  const [addOpen, setAddOpen] = React.useState(false);

  // New category form
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [contentType, setContentType] = React.useState<ContentType>("user-generated");
  const [featured, setFeatured] = React.useState(false);
  const [accentToken, setAccentToken] = React.useState(1);

  // Edit commission rate
  const [editingCommission, setEditingCommission] = React.useState<
    PlatformConfigTables["commissions"][number] | null
  >(null);
  const [draftPlatformShare, setDraftPlatformShare] = React.useState("");

  if (isLoading || !config) return null;

  return (
    <>
      <PageHeader
        title="Platform settings"
        description="Configuration tables. Everything here is data — new categories, labels, pricing rules and payout methods can be added without a code change."
        actions={
          tab === "categories" ? (
            <Button variant="primary" onClick={() => setAddOpen(true)}>
              <IconPlus />
              New category
            </Button>
          ) : null
        }
      >
        <Tabs value={tab} onChange={setTab} variant="pill" items={TABS} />
      </PageHeader>

      <PageBody className="space-y-5">
        {/* ---------------------------- Categories --------------------------- */}
        {tab === "categories" ? (
          <Card>
            <CardHeader
              title="Categories"
              description={`${config.categories.length} categories drive discovery, browse pages and upload classification.`}
            />
            <CardBody className="p-0">
              <ConfigTable
                head={["Name", "Slug", "Content type", "Videos", "Featured", "Accent"]}
                rows={config.categories.map((category) => [
                  <span key="n" className="font-medium text-fg">
                    {category.name}
                    <span className="mt-0.5 block text-2xs font-normal text-fg-subtle">
                      {category.description}
                    </span>
                  </span>,
                  <code key="s" className="font-mono text-xs text-fg-muted">
                    {category.slug}
                  </code>,
                  <Badge key="t" tone="outline" size="sm">
                    {CONTENT_TYPE_LABELS[category.contentType]}
                  </Badge>,
                  <span key="v" className="nx-tnum">
                    {category.videoCount}
                  </span>,
                  <Switch
                    key="f"
                    checked={category.featured}
                    onCheckedChange={(value) =>
                      updateTable.mutate({
                        table: "categories",
                        rows: config.categories.map((item) =>
                          item.id === category.id ? { ...item, featured: value } : item,
                        ),
                      })
                    }
                    label=""
                  />,
                  <span
                    key="a"
                    aria-hidden
                    className="inline-block size-4 rounded"
                    style={{
                      background: `rgb(var(--nx-chart-${category.accentToken}))`,
                    }}
                  />,
                ])}
              />
            </CardBody>
          </Card>
        ) : null}

        {/* ------------------------------ Labels ----------------------------- */}
        {tab === "labels" ? (
          <Card>
            <CardHeader
              title="Content labels"
              description="Applied at upload. Labels marked auto age-gate force an 18 rating and send the video to human review."
            />
            <CardBody className="p-0">
              <ConfigTable
                head={["Label", "Severity", "Auto age-gate"]}
                rows={config.contentLabels.map((label) => [
                  <span key="l" className="font-medium text-fg">
                    {label.label}
                  </span>,
                  <Badge
                    key="s"
                    tone={
                      label.severity === "restricted"
                        ? "danger"
                        : label.severity === "warning"
                          ? "warning"
                          : "info"
                    }
                    size="sm"
                  >
                    {label.severity}
                  </Badge>,
                  <Switch
                    key="g"
                    checked={label.autoAgeGate}
                    onCheckedChange={(value) =>
                      updateTable.mutate({
                        table: "contentLabels",
                        rows: config.contentLabels.map((item) =>
                          item.id === label.id ? { ...item, autoAgeGate: value } : item,
                        ),
                      })
                    }
                    label=""
                  />,
                ])}
              />
            </CardBody>
          </Card>
        ) : null}

        {/* ------------------------------ Pricing ---------------------------- */}
        {tab === "pricing" ? (
          <Card>
            <CardHeader
              title="Pricing rules"
              description="Bounds enforced in the upload wizard and campaign builder."
            />
            <CardBody className="p-0">
              <ConfigTable
                head={["Rule", "Model", "Minimum", "Maximum", "Active"]}
                rows={config.pricingRules.map((rule) => [
                  <span key="n" className="font-medium text-fg">
                    {rule.name}
                  </span>,
                  <Badge key="m" tone="outline" size="sm">
                    {rule.model.replace("-", " ")}
                  </Badge>,
                  <span key="min" className="nx-tnum">
                    {formatCurrency(rule.minPrice.amount, rule.minPrice.currency)}
                  </span>,
                  <span key="max" className="nx-tnum">
                    {formatCurrency(rule.maxPrice.amount, rule.maxPrice.currency)}
                  </span>,
                  <Switch
                    key="a"
                    checked={rule.active}
                    onCheckedChange={(value) =>
                      updateTable.mutate({
                        table: "pricingRules",
                        rows: config.pricingRules.map((item) =>
                          item.id === rule.id ? { ...item, active: value } : item,
                        ),
                      })
                    }
                    label=""
                  />,
                ])}
              />
            </CardBody>
          </Card>
        ) : null}

        {/* ---------------------------- Commissions -------------------------- */}
        {tab === "commissions" ? (
          <Card>
            <CardHeader
              title="Commission splits"
              description="Applied to every transaction at settlement. Changing a split takes effect for new transactions only."
            />
            <CardBody className="p-0">
              <ConfigTable
                head={["Scope", "Platform", "Creator", "Effective from", ""]}
                rows={config.commissions.map((rule) => [
                  <span key="s" className="font-medium text-fg">
                    {rule.scope}
                  </span>,
                  <span key="p" className="nx-tnum">
                    {rule.platformShare}%
                  </span>,
                  <span key="c" className="nx-tnum text-success">
                    {rule.creatorShare}%
                  </span>,
                  <span key="d" className="nx-tnum text-fg-subtle">
                    {formatDate(rule.effectiveFrom)}
                  </span>,
                  rule.scopeKey ? (
                    <Button
                      key="e"
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        setEditingCommission(rule);
                        setDraftPlatformShare(String(rule.platformShare));
                      }}
                    >
                      Edit
                    </Button>
                  ) : null,
                ])}
              />
            </CardBody>
          </Card>
        ) : null}

        {/* ------------------------------- Taxes ----------------------------- */}
        {tab === "taxes" ? (
          <Card>
            <CardHeader
              title="Tax rates"
              description="Resolved at checkout from the buyer's billing country."
            />
            <CardBody className="p-0">
              <ConfigTable
                head={["Country", "Tax", "Rate", "Applies to"]}
                rows={config.taxes.map((tax) => [
                  <span key="c" className="font-medium text-fg">
                    {tax.country}
                  </span>,
                  <Badge key="n" tone="outline" size="sm">
                    {tax.name}
                  </Badge>,
                  <span key="r" className="nx-tnum">
                    {tax.rate}%
                  </span>,
                  <span key="a" className="text-xs text-fg-muted">
                    {tax.appliesTo}
                  </span>,
                ])}
              />
            </CardBody>
          </Card>
        ) : null}

        {/* ----------------------------- Currencies -------------------------- */}
        {tab === "currencies" ? (
          <Card>
            <CardHeader
              title="Currencies"
              description="Enabled currencies appear in creator pricing and viewer checkout."
            />
            <CardBody className="p-0">
              <ConfigTable
                head={["Code", "Name", "Symbol", "Rate to GBP", "Enabled"]}
                rows={config.currencies.map((currency) => [
                  <code key="c" className="font-mono text-xs font-medium text-fg">
                    {currency.code}
                  </code>,
                  <span key="n" className="text-fg">
                    {currency.name}
                  </span>,
                  <span key="s" className="text-fg-muted">
                    {currency.symbol}
                  </span>,
                  <span key="r" className="nx-tnum">
                    {currency.rateToGbp}
                  </span>,
                  <Switch
                    key="e"
                    checked={currency.enabled}
                    onCheckedChange={(value) =>
                      updateTable.mutate({
                        table: "currencies",
                        rows: config.currencies.map((item) =>
                          item.code === currency.code
                            ? { ...item, enabled: value }
                            : item,
                        ),
                      })
                    }
                    label=""
                  />,
                ])}
              />
            </CardBody>
          </Card>
        ) : null}

        {/* ------------------------------ Payouts ---------------------------- */}
        {tab === "payouts" ? (
          <Card>
            <CardHeader
              title="Payout rules"
              description="Methods offered to creators, with their minimums and clearing periods."
            />
            <CardBody className="p-0">
              <ConfigTable
                head={["Method", "Minimum", "Schedule", "Hold", "Active"]}
                rows={config.payoutRules.map((rule) => [
                  <span key="m" className="font-medium text-fg">
                    {rule.method}
                  </span>,
                  <span key="min" className="nx-tnum">
                    {formatCurrency(rule.minimum.amount, rule.minimum.currency)}
                  </span>,
                  <span key="s" className="text-fg-muted">
                    {rule.schedule}
                  </span>,
                  <span key="h" className="nx-tnum">
                    {rule.holdDays} days
                  </span>,
                  <Switch
                    key="a"
                    checked={rule.active}
                    onCheckedChange={(value) =>
                      updateTable.mutate({
                        table: "payoutRules",
                        rows: config.payoutRules.map((item) =>
                          item.id === rule.id ? { ...item, active: value } : item,
                        ),
                      })
                    }
                    label=""
                  />,
                ])}
              />
            </CardBody>
          </Card>
        ) : null}

        <p className="text-xs leading-relaxed text-fg-subtle">
          Every change on this page writes an entry to the audit log with your
          name and the table affected.
        </p>
      </PageBody>

      {/* Add category */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a category"
        description="New categories appear immediately in browse, search filters and the upload wizard — no deployment required."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={name.trim().length < 2}
              loading={addCategory.isPending}
              onClick={async () => {
                await addCategory.mutateAsync({
                  slug: slugify(name),
                  name: name.trim(),
                  description: description.trim() || "No description yet.",
                  contentType,
                  featured,
                  accentToken: accentToken as 1 | 2 | 3 | 4 | 5 | 6,
                });
                setAddOpen(false);
                setName("");
                setDescription("");
                toast({
                  title: "Category added",
                  description: `“${name.trim()}” is now selectable across the platform.`,
                });
              }}
            >
              Add category
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" htmlFor="cat-name" required>
            <Input
              id="cat-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Archive & heritage"
            />
          </Field>

          {name ? (
            <p className="text-xs text-fg-subtle">
              URL will be{" "}
              <code className="font-mono text-accent">/category/{slugify(name)}</code>
            </p>
          ) : null}

          <Field label="Description" htmlFor="cat-desc">
            <Textarea
              id="cat-desc"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              placeholder="Restored archive footage and heritage collections."
            />
          </Field>

          <Field label="Content type" htmlFor="cat-type" required>
            <Select
              id="cat-type"
              value={contentType}
              onChange={(event) => setContentType(event.target.value as ContentType)}
            >
              {(Object.keys(CONTENT_TYPE_LABELS) as ContentType[]).map((type) => (
                <option key={type} value={type}>
                  {CONTENT_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Accent colour">
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6].map((token) => (
                <button
                  key={token}
                  type="button"
                  aria-label={`Accent ${token}`}
                  aria-pressed={accentToken === token}
                  onClick={() => setAccentToken(token)}
                  className={cn(
                    "size-9 rounded ring-2 transition-all",
                    accentToken === token ? "ring-accent" : "ring-transparent",
                  )}
                  style={{ background: `rgb(var(--nx-chart-${token}))` }}
                />
              ))}
            </div>
          </Field>

          <Switch
            checked={featured}
            onCheckedChange={setFeatured}
            label="Feature on the explore page"
            description="Featured categories get a rail on the homepage."
          />
        </div>
      </Modal>

      {/* Edit commission rate */}
      <Modal
        open={Boolean(editingCommission)}
        onClose={() => setEditingCommission(null)}
        title={`Edit ${editingCommission?.scope ?? "commission"}`}
        description="Applies to new transactions from now on — past transactions keep whatever rate was in effect when they happened."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditingCommission(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={
                !draftPlatformShare ||
                Number(draftPlatformShare) < 0 ||
                Number(draftPlatformShare) > 100
              }
              loading={updateTable.isPending}
              onClick={async () => {
                if (!editingCommission) return;
                await updateTable.mutateAsync({
                  table: "commissions",
                  rows: config.commissions.map((item) =>
                    item.id === editingCommission.id
                      ? { ...item, platformShare: Number(draftPlatformShare) }
                      : item,
                  ),
                });
                toast({
                  title: "Commission rate updated",
                  description: `${editingCommission.scope} is now ${draftPlatformShare}% platform / ${100 - Number(draftPlatformShare)}% creator.`,
                });
                setEditingCommission(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Field
          label="Platform share"
          htmlFor="commission-platform-share"
          hint="The creator's share is whatever's left — it always adds up to 100%."
        >
          <Input
            id="commission-platform-share"
            type="number"
            min={0}
            max={100}
            value={draftPlatformShare}
            onChange={(event) => setDraftPlatformShare(event.target.value)}
          />
        </Field>
      </Modal>
    </>
  );
}

/** Shared config table shell so all seven tables read identically. */
function ConfigTable({
  head,
  rows,
}: {
  head: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="nx-scrollbar overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2/60">
            {head.map((label) => (
              <th
                key={label}
                scope="col"
                className="px-5 py-2.5 text-left text-2xs font-semibold uppercase tracking-wide text-fg-subtle"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((cells, rowIndex) => (
            <tr key={rowIndex}>
              {cells.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="px-5 py-3 align-middle text-fg-muted"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
