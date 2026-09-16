import type { Metadata } from "next";
import { ExchangeIndexClient } from "./exchange-client";

export const metadata: Metadata = {
  title: "Exchange Hub",
  description:
    "Creators on MYHitch Nexus pitching their films and projects for sponsorship — a trailer, their analysis, and what a sponsor gets in return.",
};

export default function ExchangeIndexPage() {
  return <ExchangeIndexClient />;
}
