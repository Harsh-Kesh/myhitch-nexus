// Bare /business 404'd with no page.tsx of its own — send it to the same landing
// page the registration wizard already uses for both business and advertiser roles
// (see business/layout.tsx's own comment).
import { redirect } from "next/navigation";

export default function BusinessIndexPage() {
  redirect("/business/channel");
}
