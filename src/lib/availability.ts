// Pure utilities for evaluating store availability based on
// business hours, timezone, and manual pause override.
//
// business_hours JSON shape:
//   {
//     mon: { open: true, ranges: [{ start: "09:00", end: "22:00" }] },
//     tue: { open: false, ranges: [] },
//     ...
//   }
// When business_hours is null/undefined, only `is_accepting_orders` applies
// (i.e. the schedule is treated as always-open).

export type DayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export const DAY_KEYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const DAY_LABELS: Record<DayKey, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

export type DaySchedule = { open: boolean; ranges: { start: string; end: string }[] };
export type BusinessHours = Partial<Record<DayKey, DaySchedule>>;

export type AvailabilityTenant = {
  business_hours?: BusinessHours | null;
  is_accepting_orders?: boolean | null;
  timezone?: string | null;
};

export type Availability = {
  isOpen: boolean;
  reason: "paused" | "out-of-hours" | "open";
};

export const DEFAULT_TIMEZONE = "Africa/Cairo";

export function defaultBusinessHours(): BusinessHours {
  const hours: BusinessHours = {};
  for (const d of DAY_KEYS) {
    hours[d] = { open: true, ranges: [{ start: "09:00", end: "22:00" }] };
  }
  return hours;
}

function nowInTz(tz: string): { day: DayKey; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hh = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const mm = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const map: Record<string, DayKey> = {
    Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat",
  };
  return { day: map[wd] ?? "mon", minutes: hh * 60 + mm };
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = parseInt(m[1]!, 10);
  const mi = parseInt(m[2]!, 10);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

export function getAvailability(tenant: AvailabilityTenant | null | undefined): Availability {
  if (!tenant) return { isOpen: true, reason: "open" };
  if (tenant.is_accepting_orders === false) return { isOpen: false, reason: "paused" };

  const hours = tenant.business_hours;
  if (!hours || typeof hours !== "object" || Object.keys(hours).length === 0) {
    return { isOpen: true, reason: "open" };
  }

  let tz = tenant.timezone || DEFAULT_TIMEZONE;
  let now;
  try {
    now = nowInTz(tz);
  } catch {
    tz = DEFAULT_TIMEZONE;
    now = nowInTz(tz);
  }

  const today = hours[now.day];
  if (!today || !today.open || !Array.isArray(today.ranges) || today.ranges.length === 0) {
    return { isOpen: false, reason: "out-of-hours" };
  }
  for (const r of today.ranges) {
    const start = toMinutes(r.start);
    const end = toMinutes(r.end);
    if (start == null || end == null) continue;
    // Allow overnight ranges (end <= start means wraps midnight).
    if (end > start) {
      if (now.minutes >= start && now.minutes < end) {
        return { isOpen: true, reason: "open" };
      }
    } else if (now.minutes >= start || now.minutes < end) {
      return { isOpen: true, reason: "open" };
    }
  }
  return { isOpen: false, reason: "out-of-hours" };
}

export function isStoreOpen(tenant: AvailabilityTenant | null | undefined): boolean {
  return getAvailability(tenant).isOpen;
}

// Common IANA timezones for the selector.
export const TIMEZONE_OPTIONS: string[] = [
  "Africa/Cairo",
  "Africa/Algiers",
  "Africa/Casablanca",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Asia/Amman",
  "Asia/Baghdad",
  "Asia/Beirut",
  "Asia/Dubai",
  "Asia/Istanbul",
  "Asia/Jerusalem",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Kuwait",
  "Asia/Qatar",
  "Asia/Riyadh",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/Istanbul",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "America/Sao_Paulo",
];
