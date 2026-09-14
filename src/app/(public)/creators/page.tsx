import type { Metadata } from "next";
import { CreatorsClient } from "./creators-client";

export const metadata: Metadata = {
  title: "Creators & channels",
  description:
    "Browse every publisher on MYHitch Nexus — independent creators, film studios, businesses, educators and public organisations.",
};

export default function CreatorsPage() {
  return <CreatorsClient />;
}
