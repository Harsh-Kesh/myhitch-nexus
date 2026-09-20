"use client";

import { IconClock, IconClockExclamation } from "@tabler/icons-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, RailSkeleton } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress";
import { VideoCard } from "@/components/video/video-card";
import { videoById } from "@/lib/mock-api/data/videos";
import { usePurchases } from "@/lib/mock-api/hooks";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default function RentalsPage() {
  const { data: purchases = [], isLoading } = usePurchases();

  // Re-render each minute so the countdowns stay honest.
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const rentals = purchases.filter(
    (purchase) => purchase.kind === "rent" || purchase.kind === "ppv",
  );
  const active = rentals.filter(
    (rental) =>
      rental.status === "active" &&
      (!rental.expiresAt || new Date(rental.expiresAt).getTime() > Date.now()),
  );
  const past = rentals.filter((rental) => !active.includes(rental));

  if (isLoading) return <RailSkeleton count={4} />;

  if (rentals.length === 0) {
    return (
      <EmptyState
        icon={<IconClock />}
        title="No rentals"
        description="Rented titles show their remaining window here so you know how long you have left."
        action={{ label: "Browse films", href: "/films" }}
      />
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 font-display text-lg font-semibold text-fg">
          Active rentals
        </h2>
        {active.length === 0 ? (
          <EmptyState compact title="No active rentals" />
        ) : (
          <ul className="space-y-3">
            {active.map((rental) => {
              const video = videoById(rental.videoId ?? "");
              if (!video) return null;

              const start = new Date(rental.purchasedAt).getTime();
              const end = rental.expiresAt
                ? new Date(rental.expiresAt).getTime()
                : start;
              const total = Math.max(1, end - start);
              const remaining = Math.max(0, end - Date.now());
              const usedPercent = ((total - remaining) / total) * 100;
              const hoursLeft = Math.floor(remaining / 3_600_000);
              const minutesLeft = Math.floor((remaining % 3_600_000) / 60_000);
              const urgent = remaining < 6 * 3_600_000;

              return (
                <li key={rental.id}>
                  <Card className="p-3">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="w-full sm:w-56">
                        <VideoCard video={video} layout="wide" minimal />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-fg">{video.title}</p>
                          <Badge tone={urgent ? "warning" : "scheduled"} size="sm">
                            {urgent ? <IconClockExclamation /> : <IconClock />}
                            {hoursLeft}h {minutesLeft}m left
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-fg-muted nx-tnum">
                          {formatCurrency(rental.price.amount, rental.price.currency)} ·
                          expires {rental.expiresAt ? formatDateTime(rental.expiresAt) : "—"}
                        </p>
                        <ProgressBar
                          value={usedPercent}
                          size="sm"
                          tone={urgent ? "warning" : "accent"}
                          className="mt-2 max-w-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button variant="primary" size="sm" href={`/video/${video.id}`}>
                          Watch now
                        </Button>
                        {video.pricing.buyPrice ? (
                          <Button variant="secondary" size="sm" href={`/video/${video.id}`}>
                            Buy for{" "}
                            {formatCurrency(
                              video.pricing.buyPrice.amount,
                              video.pricing.buyPrice.currency,
                            )}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {past.length > 0 ? (
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold text-fg">
            Expired & past rentals
          </h2>
          <ul className="space-y-2">
            {past.map((rental) => {
              const video = videoById(rental.videoId ?? "");
              return (
                <li key={rental.id}>
                  <Card className="flex flex-wrap items-center gap-4 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-fg">{video?.title ?? rental.videoId}</p>
                      <p className="mt-0.5 text-xs text-fg-subtle nx-tnum">
                        {formatCurrency(rental.price.amount, rental.price.currency)} ·{" "}
                        {rental.invoiceNumber}
                      </p>
                    </div>
                    <Badge
                      tone={rental.status === "refunded" ? "danger" : "archived"}
                      size="sm"
                    >
                      {rental.status}
                    </Badge>
                    {video ? (
                      <Button variant="ghost" size="sm" href={`/video/${video.id}`}>
                        Rent again
                      </Button>
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
