"use client";

import { IconDownload, IconReceipt } from "@tabler/icons-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState, TableSkeleton } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { looksLikeRealId } from "@/lib/mock-api";
import { videoById } from "@/lib/mock-api/data/videos";
import { useCurrentUser, usePurchases } from "@/lib/mock-api/hooks";
import type { PurchaseRecord } from "@/lib/mock-api/types";
import { formatCurrency, formatDate } from "@/lib/utils";

const KIND_LABELS: Record<PurchaseRecord["kind"], string> = {
  buy: "Purchase",
  rent: "Rental",
  ppv: "Pay-per-view",
  subscription: "Subscription",
  membership: "Membership",
};

const STATUS_TONE: Record<
  PurchaseRecord["status"],
  "published" | "archived" | "danger" | "scheduled"
> = {
  completed: "published",
  active: "scheduled",
  expired: "archived",
  refunded: "danger",
};

export default function PurchasesPage() {
  const { data: user } = useCurrentUser();
  const isRealAccount = Boolean(user?.id && looksLikeRealId(user.id));
  const { data: purchases = [], isLoading } = usePurchases();
  const { toast } = useToast();

  const columns: Array<Column<PurchaseRecord>> = [
    {
      key: "title",
      header: "Title",
      sortValue: (row) =>
        row.videoTitle ?? (row.videoId ? videoById(row.videoId)?.title : undefined) ?? row.videoId ?? "",
      cell: (row) => {
        const title =
          row.videoTitle ?? (row.videoId ? videoById(row.videoId)?.title : undefined) ?? row.videoId;
        if (!row.videoId) {
          return <span className="font-medium text-fg">{title}</span>;
        }
        return (
          <Link
            href={`/video/${row.videoId}`}
            className="font-medium text-fg transition-colors hover:text-accent"
          >
            {title}
          </Link>
        );
      },
    },
    {
      key: "kind",
      header: "Type",
      sortValue: (row) => row.kind,
      cell: (row) => <Badge tone="neutral" size="sm">{KIND_LABELS[row.kind]}</Badge>,
    },
    {
      key: "price",
      header: "Amount",
      align: "right",
      sortValue: (row) => row.price.amount,
      cell: (row) => (
        <span className="nx-tnum text-fg">
          {formatCurrency(row.price.amount, row.price.currency)}
        </span>
      ),
    },
    {
      key: "date",
      header: "Purchased",
      secondary: true,
      sortValue: (row) => row.purchasedAt,
      cell: (row) => <span className="nx-tnum">{formatDate(row.purchasedAt)}</span>,
    },
    {
      key: "invoice",
      header: "Invoice",
      secondary: true,
      sortValue: (row) => row.invoiceNumber,
      cell: (row) => (
        <span className="font-mono text-xs text-fg-subtle">{row.invoiceNumber}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (row) => row.status,
      cell: (row) => (
        <Badge tone={STATUS_TONE[row.status]} size="sm">
          {row.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (row) =>
        row.receiptUrl ? (
          <a
            href={row.receiptUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "ghost", size: "xs" })}
          >
            <IconDownload />
            Receipt
          </a>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            onClick={() =>
              toast({
                title: "No receipt available",
                description: `Your invoice number is ${row.invoiceNumber}.`,
                tone: "info",
              })
            }
          >
            <IconDownload />
            Receipt
          </Button>
        ),
    },
  ];

  if (isLoading) return <TableSkeleton rows={6} cols={6} />;

  if (purchases.length === 0) {
    return (
      <EmptyState
        icon={<IconReceipt />}
        title="No purchases yet"
        description="Your plan billing history and receipts appear here once you subscribe."
        action={{ label: "View plans", href: "/plans" }}
      />
    );
  }

  const lifetime = purchases
    .filter((purchase) => purchase.status !== "refunded")
    .reduce((total, purchase) => total + purchase.price.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted nx-tnum">
          {purchases.length} transactions · {formatCurrency(lifetime)} lifetime
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            toast({
              title: "CSV export isn't built yet",
              tone: "info",
            })
          }
        >
          <IconDownload />
          Export CSV
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={purchases}
        rowKey={(row) => row.id}
        caption="Purchase history"
      />

      <p className="text-xs leading-relaxed text-fg-subtle">
        {isRealAccount
          ? "Real payments via Stripe Checkout. Refund processing isn't built yet — contact support for a refund."
          : "Payments are mocked. No payment gateway, settlement or refund processing exists anywhere in this build."}
      </p>
    </div>
  );
}
