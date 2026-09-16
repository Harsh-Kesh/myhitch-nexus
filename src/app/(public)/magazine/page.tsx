import type { Metadata } from "next";
import { MagazineIndexClient } from "./magazine-client";

export const metadata: Metadata = {
  title: "Magazine",
  description:
    "Filmmakers and creators on MYHitch Nexus write about their own work — the story behind a film, alongside its trailer.",
};

export default function MagazineIndexPage() {
  return <MagazineIndexClient />;
}
