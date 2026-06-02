// Server-only helpers for admin analytics. Never import from client code.

type Row = Record<string, unknown>;

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  // Quote if contains comma, quote, newline, or carriage return.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(rows: Row[], columns?: string[]): string {
  if (rows.length === 0) {
    return (columns ?? []).join(",") + "\n";
  }
  const cols = columns ?? Array.from(
    rows.reduce<Set<string>>((acc, r) => {
      Object.keys(r).forEach((k) => acc.add(k));
      return acc;
    }, new Set<string>()),
  );
  const header = cols.map(escapeCsvCell).join(",");
  const body = rows.map((r) => cols.map((c) => escapeCsvCell(r[c])).join(",")).join("\n");
  return header + "\n" + body + "\n";
}

export function rowsToJson(rows: Row[]): string {
  return JSON.stringify(rows, null, 2);
}

export function isoDay(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

/** Bucket a list of {created_at, amount_usd} rows into ISO week → sum. */
export function weeklyRevenueBuckets(
  rows: Array<{ created_at: string; amount_usd: number | string | null }>,
  weeks: number,
): Array<{ week: string; usd: number }> {
  const now = new Date();
  const nowMonday = new Date(now);
  const day = nowMonday.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  nowMonday.setUTCDate(nowMonday.getUTCDate() + diff);
  nowMonday.setUTCHours(0, 0, 0, 0);

  const buckets = new Map<string, number>();
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(nowMonday);
    d.setUTCDate(d.getUTCDate() - i * 7);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }

  for (const r of rows) {
    const created = new Date(r.created_at);
    const cd = created.getUTCDay();
    const cdiff = (cd === 0 ? -6 : 1) - cd;
    const monday = new Date(created);
    monday.setUTCDate(monday.getUTCDate() + cdiff);
    monday.setUTCHours(0, 0, 0, 0);
    const key = monday.toISOString().slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + Number(r.amount_usd ?? 0));
    }
  }

  return Array.from(buckets.entries()).map(([week, usd]) => ({ week, usd }));
}