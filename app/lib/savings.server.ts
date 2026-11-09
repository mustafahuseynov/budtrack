import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "~/db";
import { budgetPlans, categories, savingsGoals, transactions } from "~/db/schema";
import { monthIndex, monthlyGoalHints, summarizeGoal } from "~/lib/savings";

export type SavingsCategoryRow = {
  categoryId: number;
  name: string;
  targetCents: number | null;
  targetDate: string | null;
  initialCents: number | null;
  allocatedCents: number;
  contributionCount: number;
};

/**
 * Savings subcategories with their optional goal and the amount actually saved
 * so far: the goal's starting amount plus every savings transaction recorded in
 * Tracking.
 */
export async function listSavingsCategories(): Promise<SavingsCategoryRow[]> {
  return db
    .select({
      categoryId: categories.id,
      name: categories.name,
      targetCents: savingsGoals.targetCents,
      targetDate: savingsGoals.targetDate,
      initialCents: savingsGoals.initialCents,
      allocatedCents:
        sql<number>`coalesce(sum(${transactions.amountCents}), 0) + coalesce(${savingsGoals.initialCents}, 0)`.mapWith(
          Number,
        ),
      contributionCount: sql<number>`count(${transactions.id})`.mapWith(Number),
    })
    .from(categories)
    .leftJoin(savingsGoals, eq(savingsGoals.categoryId, categories.id))
    .leftJoin(transactions, eq(transactions.categoryId, categories.id))
    .where(eq(categories.kind, "savings"))
    .groupBy(
      categories.id,
      categories.name,
      categories.sortOrder,
      savingsGoals.targetCents,
      savingsGoals.targetDate,
      savingsGoals.initialCents,
    )
    .orderBy(asc(categories.sortOrder), asc(categories.id));
}

type ActiveSavingsGoal = SavingsCategoryRow & {
  targetCents: number;
  targetDate: string;
};

/**
 * Suggested savings amount per planning cell of `year`, keyed by
 * `${categoryId}:${month}`, for savings subcategories with an active goal.
 */
export async function getSavingsHints(
  year: number,
  today: string,
): Promise<Record<string, number>> {
  const activeGoals: ActiveSavingsGoal[] = [];

  for (const row of await listSavingsCategories()) {
    if (row.targetCents === null || row.targetDate === null) continue;

    const { status } = summarizeGoal({
      targetCents: row.targetCents,
      allocatedCents: row.allocatedCents,
      targetDate: row.targetDate,
      today,
    });
    if (status !== "active") continue;

    activeGoals.push({ ...row, targetCents: row.targetCents, targetDate: row.targetDate });
  }

  if (activeGoals.length === 0) return {};

  const firstIndex = monthIndex(today);
  const lastIndex = Math.max(...activeGoals.map((goal) => monthIndex(goal.targetDate)));

  const plannedRows = await db
    .select({
      categoryId: budgetPlans.categoryId,
      year: budgetPlans.year,
      month: budgetPlans.month,
      plannedCents: budgetPlans.plannedCents,
    })
    .from(budgetPlans)
    .where(
      and(
        inArray(
          budgetPlans.categoryId,
          activeGoals.map((goal) => goal.categoryId),
        ),
        gte(budgetPlans.year, Math.min(year, Math.floor(firstIndex / 12))),
        lte(budgetPlans.year, Math.max(year, Math.floor(lastIndex / 12))),
      ),
    );

  const plannedByCategory = new Map<number, Map<number, number>>();
  for (const row of plannedRows) {
    const byIndex = plannedByCategory.get(row.categoryId) ?? new Map<number, number>();
    byIndex.set(row.year * 12 + (row.month - 1), row.plannedCents);
    plannedByCategory.set(row.categoryId, byIndex);
  }

  const hints: Record<string, number> = {};
  for (const goal of activeGoals) {
    const monthly = monthlyGoalHints({
      targetCents: goal.targetCents,
      allocatedCents: goal.allocatedCents,
      targetDate: goal.targetDate,
      today,
      year,
      plannedCentsByIndex: plannedByCategory.get(goal.categoryId) ?? new Map(),
    });

    for (const [month, cents] of monthly) {
      hints[`${goal.categoryId}:${month}`] = cents;
    }
  }

  return hints;
}
