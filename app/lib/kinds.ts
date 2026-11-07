export const KINDS = ["income", "expense", "savings"] as const;

export type CategoryKind = (typeof KINDS)[number];

export const KIND_LABELS: Record<CategoryKind, string> = {
  income: "Income",
  expense: "Expenses",
  savings: "Savings",
};

export function isCategoryKind(value: unknown): value is CategoryKind {
  return typeof value === "string" && (KINDS as readonly string[]).includes(value);
}
