import type { Metadata } from "next";
import { PlansClient } from "./plans-client";

export const metadata: Metadata = {
  title: "Plans & pricing",
  description: "Compare every MYHitch Nexus plan — Free, Premium, Family, Creator, Business and Enterprise.",
};

export default function PlansPage() {
  return <PlansClient />;
}
