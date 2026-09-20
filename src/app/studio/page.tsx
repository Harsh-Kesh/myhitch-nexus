// Bare /studio 404'd with no page.tsx of its own — send it to the dashboard,
// same fix as business/page.tsx for the equivalent gap under /business.
import { redirect } from "next/navigation";

export default function StudioIndexPage() {
  redirect("/studio/dashboard");
}
