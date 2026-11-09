export type GoalStatus = "achieved" | "overdue" | "active";

export type GoalSummary = {
  allocatedCents: number;
  remainingCents: number;
  savedPercent: number;
  monthsLeft: number;
  /** Suggested monthly amount; null when there is nothing left to save or no time left. */
  monthlyCents: number | null;
  status: GoalStatus;
};

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
}

/** Turns `YYYY-MM-DD` into a comparable month index. */
function monthIndex(value: string): number {
  const [year, month] = value.slice(0, 10).split("-").map(Number);
  return year * 12 + (month - 1);
}

/**
 * Calendar months from the current month through the target month, both
 * inclusive: a target in the current month leaves one month to save.
 */
export function monthsLeftInclusive(targetDate: string, today: string): number {
  return Math.max(0, monthIndex(targetDate) - monthIndex(today) + 1);
}

export function summarizeGoal({
  targetCents,
  allocatedCents,
  targetDate,
  today,
}: {
  targetCents: number;
  allocatedCents: number;
  targetDate: string;
  today: string;
}): GoalSummary {
  const remainingCents = Math.max(targetCents - allocatedCents, 0);
  const savedPercent =
    targetCents > 0 ? Math.round((allocatedCents / targetCents) * 100) : 0;
  const monthsLeft = monthsLeftInclusive(targetDate, today);

  const status: GoalStatus =
    allocatedCents >= targetCents ? "achieved" : monthsLeft === 0 ? "overdue" : "active";

  const monthlyCents =
    status === "active" && remainingCents > 0
      ? Math.ceil(remainingCents / monthsLeft)
      : null;

  return {
    allocatedCents,
    remainingCents,
    savedPercent,
    monthsLeft,
    monthlyCents,
    status,
  };
}
