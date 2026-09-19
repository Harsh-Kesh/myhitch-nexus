// Client-safe CSV export. Not "server-only" — this runs in the browser, building a real
// file from data already fetched (mock or real, whichever a page has on screen) and
// triggering a genuine browser download. No server round-trip, no vendor.
function toCsvValue(value: unknown): string {
  const str = value == null ? "" : String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** One CSV table: a title line (kept out of the header row so a viewer can tell where
 * one section ends and the next begins when several are concatenated), a header row and
 * data rows. Returns "" for an empty `rows` — callers skip empty sections entirely rather
 * than emitting a header with nothing under it. */
export function csvSection(title: string, headers: string[], rows: Array<Array<unknown>>): string {
  if (rows.length === 0) return "";
  const lines = [title, headers.map(toCsvValue).join(",")];
  for (const row of rows) lines.push(row.map(toCsvValue).join(","));
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, sections: string[]): void {
  const content = sections.filter(Boolean).join("\r\n\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
