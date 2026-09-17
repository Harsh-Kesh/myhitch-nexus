// GET /api/series/[id] — one series with its published episodes. Public, no auth: a
// real video's own page links here for "more from this series."
import { NextResponse } from "next/server";
import { getSeriesById } from "@/lib/server/series";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const series = await getSeriesById(id);
    if (!series) {
      return NextResponse.json({ error: "Series not found." }, { status: 404 });
    }
    return NextResponse.json(series);
  } catch (err) {
    console.error(`GET /api/series/${id} failed`, err);
    return NextResponse.json({ error: "Failed to load the series." }, { status: 500 });
  }
}
