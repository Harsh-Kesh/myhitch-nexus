"use client";

import { IconLink, IconPlus, IconShoppingBag, IconTrash } from "@tabler/icons-react";
import * as React from "react";
import { PageBody, PageHeader } from "@/components/layout/workspace-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Stat } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { MultiSelect } from "@/components/ui/multi-select";
import { useToast } from "@/components/ui/toast";
import { looksLikeRealId } from "@/lib/mock-api";
import {
  useChannelVideos,
  useCreateProductLink,
  useCurrentUser,
  useDeleteProductLink,
  useProductLinks,
} from "@/lib/mock-api/hooks";
import type { ProductLink } from "@/lib/mock-api/types";
import { compactNumber, formatCurrency, formatPercent } from "@/lib/utils";

// See leads/page.tsx's identical comment — only ever a fallback for the shared demo
// persona, never a real signed-in account.
const MOCK_CHANNEL_ID = "ch_helio";

export default function ProductLinksPage() {
  const { data: user } = useCurrentUser();
  const channelId =
    user?.channelId && looksLikeRealId(user.channelId) ? user.channelId : MOCK_CHANNEL_ID;
  const { data: links = [] } = useProductLinks(channelId);
  const { data: videos = [] } = useChannelVideos(channelId);
  const createLink = useCreateProductLink(channelId);
  const deleteLink = useDeleteProductLink(channelId);
  const { toast } = useToast();

  const [open, setOpen] = React.useState(false);
  const [productName, setProductName] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [commission, setCommission] = React.useState("6");
  const [attached, setAttached] = React.useState<string[]>([]);

  const totals = links.reduce(
    (acc, link) => ({
      clicks: acc.clicks + link.clicks,
      conversions: acc.conversions + link.conversions,
    }),
    { clicks: 0, conversions: 0 },
  );

  const conversionRate = totals.clicks
    ? (totals.conversions / totals.clicks) * 100
    : 0;

  const columns: Array<Column<ProductLink>> = [
    {
      key: "product",
      header: "Product",
      sortValue: (row) => row.productName,
      cell: (row) => (
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded bg-accent-soft text-accent"
          >
            <IconShoppingBag className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-fg">
              {row.productName}
            </span>
            <span className="block font-mono text-2xs text-fg-subtle">
              {row.martProductId}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      sortValue: (row) => row.price.amount,
      cell: (row) => (
        <span className="nx-tnum text-fg">
          {formatCurrency(row.price.amount, row.price.currency, { compact: true })}
        </span>
      ),
    },
    {
      key: "attached",
      header: "Attached to",
      secondary: true,
      sortValue: (row) => row.attachedVideoIds.length,
      cell: (row) => (
        <span className="nx-tnum">
          {row.attachedVideoIds.length} video
          {row.attachedVideoIds.length === 1 ? "" : "s"}
        </span>
      ),
    },
    {
      key: "clicks",
      header: "Clicks",
      align: "right",
      sortValue: (row) => row.clicks,
      cell: (row) => <span className="nx-tnum">{compactNumber(row.clicks)}</span>,
    },
    {
      key: "conversions",
      header: "Conversions",
      align: "right",
      sortValue: (row) => row.conversions,
      cell: (row) => (
        <span className="nx-tnum text-fg">{compactNumber(row.conversions)}</span>
      ),
    },
    {
      key: "rate",
      header: "Rate",
      align: "right",
      secondary: true,
      sortValue: (row) => (row.clicks ? row.conversions / row.clicks : 0),
      cell: (row) => (
        <span className="nx-tnum">
          {row.clicks ? formatPercent((row.conversions / row.clicks) * 100, 1) : "—"}
        </span>
      ),
    },
    {
      key: "commission",
      header: "Commission",
      align: "right",
      secondary: true,
      sortValue: (row) => row.commissionRate,
      cell: (row) =>
        row.commissionRate > 0 ? (
          <Badge tone="accent" size="sm">
            {row.commissionRate}%
          </Badge>
        ) : (
          <span className="text-fg-subtle">Own product</span>
        ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${row.productName}`}
          onClick={() => {
            if (!confirm(`Delete "${row.productName}"? This can't be undone.`)) return;
            deleteLink.mutate(row.id, {
              onError: (err) =>
                toast({
                  tone: "error",
                  title: "Couldn't delete product link",
                  description: err instanceof Error ? err.message : undefined,
                }),
            });
          }}
        >
          <IconTrash className="size-4 text-danger" />
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Product links"
        description="Attach Mart products to your videos. Viewers see a “Shop this video” card at the timestamp you choose."
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <IconPlus />
            New product link
          </Button>
        }
      />

      <PageBody className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Total clicks" value={compactNumber(totals.clicks)} />
          <Stat label="Conversions" value={compactNumber(totals.conversions)} />
          <Stat label="Conversion rate" value={formatPercent(conversionRate, 1)} />
        </div>

        {links.length === 0 ? (
          <EmptyState
            icon={<IconLink />}
            title="No product links"
            description="Link products from Mart to earn commission or drive sales from your own catalogue."
            action={{ label: "Create a product link", onClick: () => setOpen(true) }}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={links}
            rowKey={(row) => row.id}
            caption="Product links"
          />
        )}

        <Card>
          <CardBody>
            <p className="text-xs leading-relaxed text-fg-subtle">
              {looksLikeRealId(channelId)
                ? "Product links, clicks and \"Shop this video\" cards are real — but there's no real Mart product catalogue or checkout to link to yet, so mart_product_id is a stand-in identifier, not a real product lookup."
                : "Commerce is mocked. Product references point at a fictional Mart catalogue and no external request is made when a viewer taps a “Shop this video” card."}
            </p>
          </CardBody>
        </Card>
      </PageBody>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New product link"
        description="Links appear as a commerce card during playback."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={productName.trim().length < 2}
              loading={createLink.isPending}
              onClick={async () => {
                await createLink.mutateAsync({
                  channelId,
                  productName: productName.trim(),
                  martProductId: `mart_${productName.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 24)}`,
                  price: {
                    amount: Math.round(Number(price || 0) * 100),
                    currency: "AUD",
                  },
                  attachedVideoIds: attached,
                  commissionRate: Number(commission) || 0,
                });
                setOpen(false);
                setProductName("");
                setPrice("");
                setAttached([]);
                toast({ title: "Product link created" });
              }}
            >
              Create link
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Product name" htmlFor="pl-name" required>
            <Input
              id="pl-name"
              value={productName}
              onChange={(event) => setProductName(event.target.value)}
              placeholder="Helio Wallbox 11kW"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price ($)" htmlFor="pl-price">
              <Input
                id="pl-price"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                inputMode="decimal"
              />
            </Field>
            <Field
              label="Commission (%)"
              htmlFor="pl-commission"
              hint="Zero for your own products."
            >
              <Input
                id="pl-commission"
                value={commission}
                onChange={(event) => setCommission(event.target.value)}
                inputMode="numeric"
              />
            </Field>
          </div>
          <Field label="Attach to videos">
            <MultiSelect
              options={videos.map((video) => ({
                value: video.id,
                label: video.title,
              }))}
              value={attached}
              onChange={setAttached}
              placeholder="Choose videos"
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}
