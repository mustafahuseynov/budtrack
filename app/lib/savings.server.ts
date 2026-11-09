import { asc, eq, sql } from "drizzle-orm";

import { db } from "~/db";
import { categories, savingsGoals, transactions } from "~/db/schema";

export type SavingsCategoryRow = {
  categoryId: number;
  name: string;
  targetCents: number | null;
  targetDate: string | null;
  allocatedCents: number;
  contributionCount: number;
};

/**
 * Savings subcategories with their optional goal and the amount actually saved
 * so far, which only comes from savings transactions recorded in Tracking.
 */
export async function listSavingsCategories(): Promise<SavingsCategoryRow[]> {
  return db
    .select({
      categoryId: categories.id,
      name: categories.name,
      targetCents: savingsGoals.targetCents,
      targetDate: savingsGoals.targetDate,
      allocatedCents:
        sql<number>`coalesce(sum(${transactions.amountCents}), 0)`.mapWith(Number),
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
    )
    .orderBy(asc(categories.sortOrder), asc(categories.id));
}
