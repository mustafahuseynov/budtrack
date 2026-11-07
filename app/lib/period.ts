export const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const MONTH_OPTIONS = MONTH_LABELS.map((label, index) => ({
  value: index + 1,
  label: new Date(Date.UTC(2024, index, 1)).toLocaleString("en-IE", {
    month: "long",
    timeZone: "UTC",
  }),
}));

export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

export function clampYear(year: number): number {
  if (!Number.isFinite(year)) return new Date().getFullYear();
  return Math.min(MAX_YEAR, Math.max(MIN_YEAR, Math.trunc(year)));
}

export function parseYear(value: string | null): number {
  const year = Number(value);
  return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR
    ? year
    : new Date().getFullYear();
}

export function monthOptions(year: number) {
  return MONTH_LABELS.map((label, index) => {
    const start = `${year}-${String(index + 1).padStart(2, "0")}-01`;
    return { value: index + 1, label, start };
  });
}

/** Inclusive first day / exclusive last day boundaries for a month. */
export function monthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { start, end };
}

/** Inclusive first day / exclusive last day boundaries for a year. */
export function yearRange(year: number) {
  return { start: `${year}-01-01`, end: `${year + 1}-01-01` };
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatIsoDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}
