// Server Component — enforces SEC-1 before anything under /studio renders or ships to
// the browser (see requireRole()'s header comment for why this replaced the client-only
// AuthGuard, which only ever checked "is anyone logged in", never which roles).
//
// Every role here is one channelProvisioning.ts actually gives a real channel to
// (ROLE_TO_ORG_TYPE) — this was `requireRole("creator")` only, so every other
// channel-owning role (business, advertiser, producer, education, organisation) hit this
// gate and got silently redirected to "/" with no error, despite publishVideo() and the
// rest of the real upload pipeline never caring what *type* of channel it's publishing
// to. Found live: a real business account had no way to reach the Upload button's
// destination at all. Business Studio (/business) still separately gates its own
// advertising/commerce-specific surfaces to business/advertiser only — this only widens
// who can reach the shared content-publishing workspace underneath.
import { requireRole } from "@/lib/server/rbac";
import { StudioShell } from "./studio-shell";

const CHANNEL_OWNING_ROLES = ["creator", "business", "advertiser", "producer", "education", "organisation"];

export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(CHANNEL_OWNING_ROLES);
  return <StudioShell>{children}</StudioShell>;
}
