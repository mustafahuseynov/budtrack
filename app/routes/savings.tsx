import { Form, Link, redirect, useActionData } from "react-router";
import { and, eq, sql } from "drizzle-orm";

import { PageShell } from "~/components/app-nav";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Progress } from "~/components/ui/progress";
import { Input } from "~/components/ui/input";
import { db } from "~/db";
import { categories, savingsGoals } from "~/db/schema";
import { formatCents, centsToInputValue, parseAmountToCents } from "~/lib/money";
import { formatIsoDate, todayIso } from "~/lib/period";
import { isValidIsoDate, summarizeGoal, type GoalSummary } from "~/lib/savings";
import { listSavingsCategories } from "~/lib/savings.server";
import { cn } from "~/lib/utils";

import type { Route } from "./+types/savings";

export async function loader() {
  const rows = await listSavingsCategories();
  const today = todayIso();

  return {
    today,
    goals: rows.map((row) => ({
      categoryId: row.categoryId,
      name: row.name,
      targetCents: row.targetCents,
      targetDate: row.targetDate,
      allocatedCents: row.allocatedCents,
      contributionCount: row.contributionCount,
      summary:
        row.targetCents !== null && row.targetDate !== null
          ? summarizeGoal({
              targetCents: row.targetCents,
              allocatedCents: row.allocatedCents,
              targetDate: row.targetDate,
              today,
            })
          : null,
    })),
  };
}

function readGoalAmounts(
  form: FormData,
): { targetCents: number; targetDate: string } | { error: string } {
  const targetCents = parseAmountToCents(String(form.get("target") ?? ""));
  const targetDate = String(form.get("targetDate") ?? "").slice(0, 10);

  if (targetCents === null) return { error: "Enter a valid target amount." };
  if (targetCents <= 0) return { error: "Target amount must be greater than zero." };
  if (!isValidIsoDate(targetDate)) return { error: "Enter a valid target date." };

  return { targetCents, targetDate };
}

async function readSavingsCategoryId(form: FormData): Promise<number | null> {
  const categoryId = Number(form.get("categoryId"));
  if (!Number.isInteger(categoryId)) return null;

  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.kind, "savings")))
    .limit(1);

  return row ? row.id : null;
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const today = todayIso();

  if (intent === "create-goal") {
    const name = String(form.get("name") ?? "").trim();
    if (!name) return { error: "Goal name is required." };

    const amounts = readGoalAmounts(form);
    if ("error" in amounts) return amounts;
    if (amounts.targetDate < today) return { error: "Target date cannot be in the past." };

    await db.transaction(async (tx) => {
      const [max] = await tx
        .select({ value: sql<number>`coalesce(max(${categories.sortOrder}), 0)` })
        .from(categories)
        .where(eq(categories.kind, "savings"));

      const [category] = await tx
        .insert(categories)
        .values({ kind: "savings", name, sortOrder: Number(max?.value ?? 0) + 1 })
        .returning({ id: categories.id });

      await tx.insert(savingsGoals).values({ categoryId: category.id, ...amounts });
    });

    return redirect("/savings");
  }

  if (intent === "update-goal") {
    const categoryId = await readSavingsCategoryId(form);
    if (categoryId === null) return { error: "Unknown savings goal." };

    const name = String(form.get("name") ?? "").trim();
    if (!name) return { error: "Goal name is required." };

    const amounts = readGoalAmounts(form);
    if ("error" in amounts) return amounts;

    await db.transaction(async (tx) => {
      await tx.update(categories).set({ name }).where(eq(categories.id, categoryId));
      await tx
        .insert(savingsGoals)
        .values({ categoryId, ...amounts })
        .onConflictDoUpdate({
          target: savingsGoals.categoryId,
          set: { targetCents: amounts.targetCents, targetDate: amounts.targetDate },
        });
    });

    return redirect("/savings");
  }

  if (intent === "set-target") {
    const categoryId = await readSavingsCategoryId(form);
    if (categoryId === null) return { error: "Unknown savings subcategory." };

    const amounts = readGoalAmounts(form);
    if ("error" in amounts) return amounts;
    if (amounts.targetDate < today) return { error: "Target date cannot be in the past." };

    await db
      .insert(savingsGoals)
      .values({ categoryId, ...amounts })
      .onConflictDoUpdate({
        target: savingsGoals.categoryId,
        set: { targetCents: amounts.targetCents, targetDate: amounts.targetDate },
      });

    return redirect("/savings");
  }

  if (intent === "clear-goal") {
    const categoryId = await readSavingsCategoryId(form);
    if (categoryId === null) return { error: "Unknown savings goal." };

    await db.delete(savingsGoals).where(eq(savingsGoals.categoryId, categoryId));
    return redirect("/savings");
  }

  return { error: "Unknown action." };
}

type GoalRow = Route.ComponentProps["loaderData"]["goals"][number];

const STATUS_LABELS: Record<GoalSummary["status"], string> = {
  achieved: "Achieved",
  overdue: "Target date passed",
  active: "In progress",
};

const STATUS_CLASSES: Record<GoalSummary["status"], string> = {
  achieved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  overdue: "border-amber-200 bg-amber-50 text-amber-700",
  active: "border-sky-200 bg-sky-50 text-sky-700",
};

function GoalCard({ goal, today }: { goal: GoalRow; today: string }) {
  const summary = goal.summary;

  if (!summary || goal.targetCents === null || goal.targetDate === null) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-semibold">{goal.name}</h2>
          <Badge variant="outline" className="text-muted-foreground">
            No target
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {formatCents(goal.allocatedCents)} saved so far ·{" "}
          {goal.contributionCount} contribution{goal.contributionCount === 1 ? "" : "s"}
        </p>
        <Form method="post" className="space-y-2">
          <input type="hidden" name="intent" value="set-target" />
          <input type="hidden" name="categoryId" value={goal.categoryId} />
          <div className="space-y-1">
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor={`target-${goal.categoryId}`}
            >
              Target amount
            </label>
            <Input
              id={`target-${goal.categoryId}`}
              name="target"
              inputMode="decimal"
              placeholder="0.00"
              required
            />
          </div>
          <div className="space-y-1">
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor={`target-date-${goal.categoryId}`}
            >
              Target date
            </label>
            <Input
              id={`target-date-${goal.categoryId}`}
              name="targetDate"
              type="date"
              min={today}
              required
            />
          </div>
          <Button type="submit" size="sm" className="w-full">
            Set target
          </Button>
        </Form>
      </section>
    );
  }

  const barValue = Math.min(summary.savedPercent, 100);

  return (
    <section className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{goal.name}</h2>
          <p className="text-xs text-muted-foreground">
            Target {formatIsoDate(goal.targetDate)} · {goal.contributionCount} contribution
            {goal.contributionCount === 1 ? "" : "s"}
          </p>
        </div>
        <Badge variant="outline" className={cn("font-medium", STATUS_CLASSES[summary.status])}>
          {STATUS_LABELS[summary.status]}
        </Badge>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium tabular-nums">
            {formatCents(summary.allocatedCents)}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            of {formatCents(goal.targetCents)} · {summary.savedPercent}%
          </span>
        </div>
        <Progress value={barValue} aria-label={`${goal.name} progress`} />
      </div>

      <dl className="grid grid-cols-3 gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Remaining</dt>
          <dd className="font-medium tabular-nums">{formatCents(summary.remainingCents)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Months left</dt>
          <dd className="font-medium tabular-nums">
            {summary.monthsLeft} month{summary.monthsLeft === 1 ? "" : "s"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Monthly needed</dt>
          <dd className="font-medium tabular-nums">
            {summary.monthlyCents === null ? "—" : formatCents(summary.monthlyCents)}
          </dd>
        </div>
      </dl>

      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          Edit goal
        </summary>
        <Form method="post" className="mt-3 space-y-2">
          <input type="hidden" name="intent" value="update-goal" />
          <input type="hidden" name="categoryId" value={goal.categoryId} />
          <div className="space-y-1">
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor={`name-${goal.categoryId}`}
            >
              Name
            </label>
            <Input
              id={`name-${goal.categoryId}`}
              name="name"
              defaultValue={goal.name}
              required
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`amount-${goal.categoryId}`}
              >
                Target amount
              </label>
              <Input
                id={`amount-${goal.categoryId}`}
                name="target"
                inputMode="decimal"
                defaultValue={centsToInputValue(goal.targetCents)}
                required
              />
            </div>
            <div className="space-y-1">
              <label
                className="text-xs font-medium text-muted-foreground"
                htmlFor={`date-${goal.categoryId}`}
              >
                Target date
              </label>
              <Input
                id={`date-${goal.categoryId}`}
                name="targetDate"
                type="date"
                defaultValue={goal.targetDate}
                required
              />
            </div>
          </div>
          <Button type="submit" size="sm">
            Save changes
          </Button>
        </Form>
        <Form method="post" className="mt-1">
          <input type="hidden" name="intent" value="clear-goal" />
          <input type="hidden" name="categoryId" value={goal.categoryId} />
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={(event) => {
              if (
                !window.confirm(
                  `Clear the target for "${goal.name}"? The subcategory and its savings history stay.`,
                )
              ) {
                event.preventDefault();
              }
            }}
          >
            Clear goal
          </Button>
        </Form>
      </details>
    </section>
  );
}

export default function Savings({ loaderData, actionData }: Route.ComponentProps) {
  const { goals, today } = loaderData;
  const errorMessage = actionData && "error" in actionData ? actionData.error : null;

  const withTarget = goals.filter(
    (goal): goal is GoalRow & { targetCents: number; summary: GoalSummary } =>
      goal.targetCents !== null && goal.summary !== null,
  );
  const totalTarget = withTarget.reduce((sum, goal) => sum + goal.targetCents, 0);
  const totalSaved = goals.reduce((sum, goal) => sum + (goal.summary?.allocatedCents ?? 0), 0);
  const overallPercent =
    totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0;

  return (
    <PageShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Savings planner</h1>
          <p className="text-sm text-muted-foreground">
            Set a target amount and date for each savings subcategory. Progress comes from the
            savings transactions you record in{" "}
            <Link to="/tracking" className="underline underline-offset-4">
              Tracking
            </Link>
            , so no amount is written into the planning grid.
          </p>
        </div>

        {errorMessage ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}

        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">New savings goal</h2>
          <Form
            method="post"
            className="mt-3 flex flex-wrap items-end gap-2"
            key={`create-${goals.length}`}
          >
            <input type="hidden" name="intent" value="create-goal" />
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="new-name">
                Subcategory
              </label>
              <Input
                id="new-name"
                name="name"
                placeholder="e.g. Holiday fund"
                className="w-56"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="new-target">
                Target amount
              </label>
              <Input
                id="new-target"
                name="target"
                inputMode="decimal"
                placeholder="0.00"
                className="w-36"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="new-date">
                Target date
              </label>
              <Input
                id="new-date"
                name="targetDate"
                type="date"
                min={today}
                className="w-40"
                required
              />
            </div>
            <Button type="submit" size="sm">
              Add goal
            </Button>
          </Form>
        </div>

        {goals.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-card/60 p-6 text-sm text-muted-foreground">
            No savings subcategories yet. Create one above to start planning; its savings
            transactions are recorded in{" "}
            <Link to="/tracking" className="underline underline-offset-4">
              Tracking
            </Link>
            .
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">Total target</p>
                <p className="text-lg font-semibold tabular-nums">{formatCents(totalTarget)}</p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">Saved so far</p>
                <p className="text-lg font-semibold tabular-nums">{formatCents(totalSaved)}</p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">Overall progress</p>
                <p className="text-lg font-semibold tabular-nums">{overallPercent}%</p>
                <Progress
                  value={Math.min(overallPercent, 100)}
                  className="mt-2"
                  aria-label="Overall savings progress"
                />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {goals.map((goal) => (
                <GoalCard key={goal.categoryId} goal={goal} today={today} />
              ))}
            </div>
          </>
        )}

        <p className="text-xs text-muted-foreground">
          The monthly amount is a suggestion only: it spreads what is still missing across the
          calendar months left, including the current one. After the target date it is shown as “—”
          until the goal is reached.
        </p>
      </div>
    </PageShell>
  );
}

export const meta: Route.MetaFunction = () => [{ title: "Savings planner · Budtrack" }];
