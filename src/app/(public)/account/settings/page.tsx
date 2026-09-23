"use client";

import {
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTv,
  IconLock,
  IconShieldLock,
  IconTrash,
  IconWorld,
} from "@tabler/icons-react";
import * as React from "react";
import { useTheme } from "@/app/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Switch } from "@/components/ui/field";
import { ConfirmModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  useCurrentUser,
  useRequestCountry,
  useSetRequestCountry,
  useSubscriptions,
  useUpdateUser,
} from "@/lib/mock-api/hooks";
import type { AgeRating } from "@/lib/mock-api/types";
import { relativeTime } from "@/lib/utils";

const DEVICES = [
  { name: "MacBook Pro · Chrome", location: "London, GB", icon: <IconDeviceDesktop />, current: true, at: 0 },
  { name: "iPhone 15 · Nexus app", location: "London, GB", icon: <IconDeviceMobile />, current: false, at: 4 },
  { name: "LG C3 · Nexus TV", location: "London, GB", icon: <IconDeviceTv />, current: false, at: 52 },
];

const COUNTRIES = ["GB", "IE", "DE", "FR", "PT", "ES", "US", "CA", "AU", "LK"];

export default function SettingsPage() {
  const { data: user } = useCurrentUser();
  const { data: subscriptions = [] } = useSubscriptions();
  const updateUser = useUpdateUser();
  const { data: requestCountry } = useRequestCountry();
  const setRequestCountry = useSetRequestCountry();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const [deleteOpen, setDeleteOpen] = React.useState(false);

  if (!user) return null;

  const hasFamilyPlan = subscriptions.some(
    (s) => s.status === "active" && (s.id.includes("family") || s.name.toLowerCase().includes("family")),
  );

  return (
    <div className="space-y-6">
      {/* Appearance */}
      <Card>
        <CardHeader
          title="Appearance"
          description="Viewing surfaces — the player, video pages and live — always stay dark. This controls the rest of the interface."
        />
        <CardBody>
          <Field label="Theme" htmlFor="theme">
            <Select
              id="theme"
              value={theme}
              onChange={(event) => setTheme(event.target.value as "dark" | "light")}
              className="max-w-xs"
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </Select>
          </Field>
        </CardBody>
      </Card>

      {/* Playback & region */}
      <Card>
        <CardHeader
          title="Playback & region"
          description="Region determines which titles are licensed to you. Change it to see geo-restriction states in the player."
        />
        <CardBody className="space-y-4">
          <Field
            label="Simulated request country"
            htmlFor="region"
            hint="Prototype control. Setting this to a blocked territory makes restricted titles show the geo-restriction surface."
          >
            <Select
              id="region"
              value={requestCountry ?? "GB"}
              onChange={(event) => {
                setRequestCountry.mutate(event.target.value);
                toast({
                  title: `Region set to ${event.target.value}`,
                  description: "Entitlement checks now run against this territory.",
                  tone: "info",
                });
              }}
              className="max-w-xs"
            >
              {COUNTRIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>

          <Switch
            checked
            onCheckedChange={() =>
              toast({ title: "Autoplay preference saved", tone: "info" })
            }
            label="Autoplay the next episode"
            description="Applies to series and playlists."
          />
          <Switch
            checked={false}
            onCheckedChange={() =>
              toast({ title: "Data saver toggled", tone: "info" })
            }
            label="Data saver"
            description="Caps streaming quality at 480p on mobile networks."
          />
        </CardBody>
      </Card>

      {/* Privacy */}
      <Card>
        <CardHeader title="Privacy" description="What Nexus may use your activity for." />
        <CardBody className="space-y-4">
          <Switch
            checked={user.privacy.personalisedRecommendations}
            onCheckedChange={(value) =>
              updateUser.mutate({
                privacy: { ...user.privacy, personalisedRecommendations: value },
              })
            }
            label="Personalised recommendations"
            description="Uses watch history to order rails and suggestions."
          />
          <Switch
            checked={user.privacy.personalisedAds}
            onCheckedChange={(value) =>
              updateUser.mutate({
                privacy: { ...user.privacy, personalisedAds: value },
              })
            }
            label="Personalised advertising"
            description="Advertising still appears when off, but is not targeted using your activity."
          />
          <Switch
            checked={user.privacy.watchlistPublic}
            onCheckedChange={(value) =>
              updateUser.mutate({
                privacy: { ...user.privacy, watchlistPublic: value },
              })
            }
            label="Public watchlist"
            description="Lets others see what you have saved."
          />
        </CardBody>
      </Card>

      {/* Parental controls */}
      {hasFamilyPlan ? (
        <Card>
          <CardHeader
            title="Parental controls"
            description="Applies across profiles that are not PIN-protected."
          />
          <CardBody className="space-y-4">
            <Switch
              checked={user.parentalControls.enabled}
              onCheckedChange={(value) =>
                updateUser.mutate({
                  parentalControls: { ...user.parentalControls, enabled: value },
                })
              }
              label="Restrict content by age rating"
            />
            {user.parentalControls.enabled ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Maximum age rating" htmlFor="max-age">
                  <Select
                    id="max-age"
                    value={user.parentalControls.maxAgeRating}
                    onChange={(event) =>
                      updateUser.mutate({
                        parentalControls: {
                          ...user.parentalControls,
                          maxAgeRating: event.target.value as AgeRating,
                        },
                      })
                    }
                  >
                    {(["U", "PG", "12", "15", "18"] as AgeRating[]).map((rating) => (
                      <option key={rating} value={rating}>
                        {rating}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Parental PIN" htmlFor="pin" hint="Four digits. Never displayed once set.">
                  <Input
                    id="pin"
                    type="password"
                    value={user.parentalControls.pin}
                    readOnly
                    leading={<IconLock />}
                  />
                </Field>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : (
        <Card className="border-accent/30 bg-accent/5">
          <CardHeader
            title="Parental controls"
            description="Parental controls, age rating filters, and profile PIN locks are exclusive to Nexus Family Plan subscribers."
            action={
              <Button variant="primary" size="sm" href="/plans">
                Upgrade to Family
              </Button>
            }
          />
          <CardBody className="border-t border-border/50 pt-4">
            <p className="text-xs text-fg-muted">
              Upgrade your subscription to set up parental PIN locks, age rating filters (U, PG, 12, 15, 18+), and Kids Mode profiles for up to 5 family members.
            </p>
          </CardBody>
        </Card>
      )}

      {/* Security */}
      <Card>
        <CardHeader title="Security" description="Sign-in and session management." />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3.5">
            <div className="flex items-center gap-3">
              <IconShieldLock className="size-5 text-accent" />
              <div>
                <p className="text-sm font-medium text-fg">
                  Multi-factor authentication
                </p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  Required for advertiser, producer and organisation roles.
                </p>
              </div>
            </div>
            <Badge tone={user.mfaEnabled ? "published" : "pending"} size="sm">
              {user.mfaEnabled ? "Enabled" : "Not set up"}
            </Badge>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              Signed-in devices
            </p>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {DEVICES.map((device) => (
                <li key={device.name} className="flex items-center gap-3 px-3.5 py-3">
                  <span className="text-fg-subtle [&_svg]:size-5">{device.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-fg">{device.name}</p>
                    <p className="text-xs text-fg-subtle">
                      <IconWorld className="mr-1 inline size-3" />
                      {device.location} ·{" "}
                      {device.current
                        ? "active now"
                        : relativeTime(
                            new Date(Date.now() - device.at * 3_600_000).toISOString(),
                          )}
                    </p>
                  </div>
                  {device.current ? (
                    <Badge tone="published" size="sm">
                      This device
                    </Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        toast({ title: `Signed out of ${device.name}`, tone: "warning" })
                      }
                    >
                      Sign out
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </CardBody>
      </Card>

      {/* Danger zone */}
      <Card className="border-danger/30">
        <CardHeader
          title={<span className="text-danger">Close your account</span>}
          description="Removes access to purchases, rentals and channel content. This cannot be undone."
        />
        <CardBody>
          <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
            <IconTrash />
            Close account
          </Button>
        </CardBody>
      </Card>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          setDeleteOpen(false);
          toast({
            title: "Account closure requested",
            description:
              "Mock action only — nothing is deleted. The fixture data reseeds on reload.",
            tone: "warning",
          });
        }}
        title="Close this account?"
        description="You will lose access to purchased titles, active rentals, channel content and revenue history."
        confirmLabel="Yes, close it"
      />
    </div>
  );
}
