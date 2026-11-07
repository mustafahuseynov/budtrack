import { and, asc, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "~/db";
import { budgetPlans, categories, transactions } from "~/db/schema";
import type { CategoryKind } from "~/lib/kinds";
import { monthRange, yearRange } from "~/lib/period";

export async function listCategories() {
  return db
    .select()
    .from(categories)
    .orderBy(asc(categories.kind), asc(categories.sortOrder), asc(categories.id));
}

/** Plans of a year keyed by `${categoryId}:${month}`. */
export async function getYearPlans(year: number) {
  const rows = await db
    .select({
      categoryId: budgetPlans.categoryId,
      month: budgetPlans.month,
      plannedCents: budgetPlans.plannedCents,
    })
    .from(budgetPlans)
    .where(eq(budgetPlans.year, year));

  return new Map(rows.map((row) => [`${row.categoryId}:${row.month}`, row.plannedCents]));
}

export function signedAmountSql() {
  return sql<number>`case when ${transactions.kind} = 'income' then ${transactions.amountCents} else -${transactions.amountCents} end`;
}

export type LedgerRow = {
  id: number;
  occurredOn: string;
  effectiveOn: string;
  kind: CategoryKind;
  categoryId: number;
  categoryName: string;
  amountCents: number;
  comment: string | null;
  balanceCents: number;
};

export async function getLedger(): Promise<LedgerRow[]> {
  const signed = signedAmountSql();

  const rows = await db
    .select({
      id: transactions.id,
      occurredOn: transactions.occurredOn,
      effectiveOn: transactions.effectiveOn,
      kind: transactions.kind,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      amountCents: transactions.amountCents,
      comment: transactions.comment,
      balanceCents:
        sql<number>`sum(${signed}) over (order by ${transactions.occurredOn}, ${transactions.id})`.mapWith(
          Number,
        ),
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .orderBy(asc(transactions.occurredOn), asc(transactions.id));

  return rows;
}

export async function getTrackingSummary() {
  const [row] = await db
    .select({
      balanceCents: sql<number>`coalesce(sum(${signedAmountSql()}), 0)`.mapWith(Number),
      lastRecordOn: sql<string | null>`max(${transactions.occurredOn})`,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(transactions);

  return row ?? { balanceCents: 0, lastRecordOn: null, count: 0 };
}

export type DashboardRow = {
  categoryId: number;
  name: string;
  kind: CategoryKind;
  plannedCents: number;
  actualCents: number;
};

export async function getDashboardRows(
  year: number,
  month: number | null,
): Promise<DashboardRow[]> {
  const { start, end } = month ? monthRange(year, month) : yearRange(year);

  const plannedConditions = [eq(budgetPlans.year, year)];
  if (month) plannedConditions.push(eq(budgetPlans.month, month));

  const [plannedRows, actualRows, categoryRows] = await Promise.all([
    db
      .select({
        categoryId: budgetPlans.categoryId,
        plannedCents: sql<number>`sum(${budgetPlans.plannedCents})`.mapWith(Number),
      })
      .from(budgetPlans)
      .where(and(...plannedConditions))
      .groupBy(budgetPlans.categoryId),
    db
      .select({
        categoryId: transactions.categoryId,
        actualCents: sql<number>`sum(${transactions.amountCents})`.mapWith(Number),
      })
      .from(transactions)
      .where(and(gte(transactions.occurredOn, start), lt(transactions.occurredOn, end)))
      .groupBy(transactions.categoryId),
    listCategories(),
  ]);

  const planned = new Map(plannedRows.map((row) => [row.categoryId, row.plannedCents]));
  const actual = new Map(actualRows.map((row) => [row.categoryId, row.actualCents]));

  return categoryRows.map((category) => ({
    categoryId: category.id,
    name: category.name,
    kind: category.kind,
    plannedCents: planned.get(category.id) ?? 0,
    actualCents: actual.get(category.id) ?? 0,
  }));
}
