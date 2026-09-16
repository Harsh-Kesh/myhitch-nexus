"use client";

import {
  IconBell,
  IconBookmark,
  IconBroadcast,
  IconBuildingStore,
  IconChevronDown,
  IconHistory,
  IconHome,
  IconLayoutGrid,
  IconLogout,
  IconMenu2,
  IconMoon,
  IconSearch,
  IconSettings,
  IconShieldCog,
  IconSun,
  IconUsers,
  IconVideoPlus,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { useTheme } from "@/app/providers";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import {
  useCurrentUser,
  useLogout,
  useNotifications,
  useSwitchProfile,
} from "@/lib/mock-api/hooks";
import { cn, relativeTime } from "@/lib/utils";
import { NexusMark } from "./logo";

const PRIMARY_NAV: Array<{
  href: string;
  label: string;
  /** Home matches "/" only — prefix matching would light it on every route. */
  exact?: boolean;
}> = [
  { href: "/", label: "Home", exact: true },
  { href: "/films", label: "Films" },
  { href: "/commercial", label: "Commercial" },
  { href: "/live", label: "Live" },
  { href: "/education", label: "Education" },
  { href: "/news", label: "News" },
  { href: "/entertainment", label: "Entertainment" },
  { href: "/creators", label: "Creators" },
  { href: "/explore", label: "Categories" },
];

const isNavActive = (pathname: string, item: (typeof PRIMARY_NAV)[number]) =>
  item.exact ? pathname === item.href : pathname.startsWith(item.href);

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { data: user } = useCurrentUser();
  const { data: notifications = [] } = useNotifications();
  const switchProfile = useSwitchProfile();
  const logout = useLogout();

  const [query, setQuery] = React.useState("");
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  const isGuest = !user;
  const unread = notifications.filter((item) => !item.read).length;
  const activeProfile = user?.profiles.find(
    (profile) => profile.id === user.activeProfileId,
  );

  React.useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => router.push("/"),
    });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="flex h-header items-center gap-2 px-3 sm:gap-3 sm:px-5 lg:px-8">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((current) => !current)}
        >
          {mobileOpen ? <IconX /> : <IconMenu2 />}
        </Button>

        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="MYHitch Nexus Home">
          <NexusMark className="h-10 w-auto" />
        </Link>

        <nav aria-label="Primary" className="ml-2 hidden items-center gap-0.5 lg:flex">
          {PRIMARY_NAV.map((item) => {
            const active = isNavActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded px-2.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-surface-2 text-fg"
                    : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Search */}
        <form
          onSubmit={submitSearch}
          role="search"
          className={cn(
            "ml-auto flex-1 justify-end gap-2 xl:flex xl:max-w-md",
            searchOpen ? "flex" : "hidden xl:flex",
          )}
        >
          <div className="relative w-full">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles, creators, businesses…"
              aria-label="Search"
              className="h-9 w-full rounded-full border border-border bg-surface-2 pl-9 pr-3 text-sm text-fg placeholder:text-fg-subtle transition-colors focus:border-accent focus:outline-none"
            />
          </div>
        </form>

        <div className={cn("flex items-center gap-1", searchOpen && "hidden xl:flex")}>
          <Button
            variant="ghost"
            size="icon"
            className="xl:hidden"
            aria-label="Search"
            onClick={() => setSearchOpen(true)}
          >
            <IconSearch />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            onClick={toggleTheme}
            className="hidden sm:inline-flex"
          >
            {theme === "dark" ? <IconSun /> : <IconMoon />}
          </Button>

          {/* ---- GUEST: show Sign in button only ---- */}
          {isGuest ? (
            <Button variant="primary" size="sm" href="/auth/login" className="ml-1">
              Sign in
            </Button>
          ) : (
            <>
              {/* Upload — authenticated only */}
              <Button
                variant="ghost"
                size="sm"
                href="/studio/upload"
                className="hidden md:inline-flex"
              >
                <IconVideoPlus />
                Upload
              </Button>

              {/* Notifications — authenticated only */}
              <Menu
                label="Notifications"
                panelClassName="w-80"
                trigger={
                  <button
                    type="button"
                    aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                    className="relative inline-flex size-9 items-center justify-center rounded text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                  >
                    <IconBell className="size-[18px]" />
                    {unread > 0 ? (
                      <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-accent-fg nx-tnum">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    ) : null}
                  </button>
                }
              >
                <div className="flex items-center justify-between px-2.5 py-2">
                  <p className="text-sm font-semibold text-fg">Notifications</p>
                  <Link
                    href="/account/notifications"
                    className="text-2xs font-medium text-accent hover:underline"
                  >
                    Preferences
                  </Link>
                </div>
                <MenuSeparator />
                <div className="nx-scrollbar max-h-80 overflow-y-auto">
                  {notifications.slice(0, 6).map((item) => (
                    <MenuItem key={item.id} href={item.href} className="items-start">
                      <span className="block">
                        <span className="flex items-center gap-2">
                          {!item.read ? (
                            <span className="size-1.5 shrink-0 rounded-full bg-accent" />
                          ) : null}
                          <span
                            className={cn(
                              "text-xs",
                              item.read ? "text-fg-muted" : "font-medium text-fg",
                            )}
                          >
                            {item.title}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-2xs text-fg-subtle">
                          {relativeTime(item.createdAt)}
                        </span>
                      </span>
                    </MenuItem>
                  ))}
                </div>
              </Menu>

              {/* Account menu — authenticated only */}
              <Menu
                label="Account"
                panelClassName="w-64"
                trigger={
                  <button
                    type="button"
                    className="ml-0.5 flex items-center gap-1 rounded-full p-0.5 transition-colors hover:bg-surface-2"
                  >
                    <Avatar
                      name={activeProfile?.name ?? user?.name ?? "Guest"}
                      gradient={activeProfile?.avatarGradient ?? user?.avatarGradient}
                      src={activeProfile?.avatarUrl ?? user?.avatarUrl}
                      size="sm"
                    />
                    <IconChevronDown className="size-3.5 text-fg-subtle" />
                  </button>
                }
              >
                <>
                  <div className="px-2.5 py-2">
                    <p className="truncate text-sm font-medium text-fg">{user.name}</p>
                    <p className="truncate text-xs text-fg-subtle">{user.email}</p>
                  </div>
                  <MenuSeparator />
                  <MenuLabel>Viewing as</MenuLabel>
                  {user.profiles.map((profile) => (
                    <MenuItem
                      key={profile.id}
                      active={profile.id === user.activeProfileId}
                      onClick={() => switchProfile.mutate(profile.id)}
                      icon={
                        <Avatar
                          name={profile.name}
                          gradient={profile.avatarGradient}
                          src={profile.avatarUrl}
                          size="xs"
                        />
                      }
                      trailing={
                        profile.kind !== "adult" ? (
                          <Badge tone="outline" size="sm">
                            {profile.maxAgeRating}
                          </Badge>
                        ) : undefined
                      }
                    >
                      {profile.name}
                    </MenuItem>
                  ))}
                  <MenuSeparator />
                </>
                <MenuItem href="/account/profile" icon={<IconUsers />}>
                  Profile &amp; settings
                </MenuItem>
                <MenuItem href="/account/watchlist" icon={<IconBookmark />}>
                  Watchlist
                </MenuItem>
                <MenuItem href="/account/history" icon={<IconHistory />}>
                  Watch history
                </MenuItem>
                <MenuSeparator />
                <MenuLabel>Workspaces</MenuLabel>
                <MenuItem href="/studio/dashboard" icon={<IconLayoutGrid />}>
                  Creator Studio
                </MenuItem>
                <MenuItem href="/business/channel" icon={<IconBuildingStore />}>
                  Business Studio
                </MenuItem>
                <MenuItem href="/studio/live" icon={<IconBroadcast />}>
                  Go live
                </MenuItem>
                <MenuItem href="/admin" icon={<IconShieldCog />}>
                  Admin console
                </MenuItem>
                <MenuSeparator />
                <MenuItem href="/account/settings" icon={<IconSettings />}>
                  Settings
                </MenuItem>
                <MenuItem onClick={handleLogout} icon={<IconLogout />}>
                  Sign out
                </MenuItem>
              </Menu>
            </>
          )}
        </div>

        {searchOpen ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close search"
            className="xl:hidden"
            onClick={() => setSearchOpen(false)}
          >
            <IconX />
          </Button>
        ) : null}
      </div>

      {/* Mobile nav */}
      {mobileOpen ? (
        <nav
          aria-label="Mobile"
          className="border-t border-border bg-surface px-3 py-2 lg:hidden"
        >
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {PRIMARY_NAV.map((item) => {
              const active = isNavActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded px-3 py-2 text-sm font-medium transition-colors [&_svg]:size-4",
                    active
                      ? "bg-surface-2 text-fg"
                      : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  {item.exact ? <IconHome /> : null}
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2 border-t border-border pt-2">
            {isGuest ? (
              <Button variant="primary" size="sm" href="/auth/login" block>
                Sign in
              </Button>
            ) : (
              <Button variant="primary" size="sm" href="/studio/upload" block>
                <IconVideoPlus />
                Upload
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={toggleTheme}>
              {theme === "dark" ? <IconSun /> : <IconMoon />}
            </Button>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
