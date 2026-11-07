import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useBlocker, useFetcher } from "react-router";
import { and, eq } from "drizzle-orm";
import { Check, Pencil, X } from "lucide-react";

import { PageShell } from "~/components/app-nav";
import { PlanCell } from "~/components/plan-cell";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { db } from "~/db";
import { budgetPlans } from "~/db/schema";
import { getYearPlans, listCategories } from "~/lib/budget.server";
import { KIND_LABELS, KINDS } from "~/lib/kinds";
import {
  centsToInputValue,
  formatCents,
  normalizeAmountInput,
  parseAmountToCents,
  sanitizeAmountInput,
} from "~/lib/money";
import { MONTH_LABELS, parseYear } from "~/lib/period";
import { cn } from "~/lib/utils";

import type { Route } from "./+types/planning";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** Reads a draft input the same way it will be normalized on blur. */
function draftToCents(raw: string): number | null {
  return parseAmountToCents(normalizeAmountInput(raw));
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const year = parseYear(url.searchParams.get("year"));
  const [categoryRows, planMap] = await Promise.all([listCategories(), getYearPlans(year)]);

  return {
    year,
    categories: categoryRows.map((category) => ({
      id: category.id,
      name: category.name,
      kind: category.kind,
    })),
    plans: Object.fromEntries(planMap) as Record<string, number>,
  };
}

type PlanChange = {
  categoryId: number;
  month: number;
  plannedCents: number;
};

type PlanningActionResult =
  | { ok: true; saved: number }
  | { ok: false; error: string; cell?: string };

function parseChanges(raw: string): { changes: PlanChange[] } | { error: string; cell?: string } {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { error: "Could not read the submitted changes" };
  }

  if (!Array.isArray(payload)) {
    return { error: "Could not read the submitted changes" };
  }

  const changes: PlanChange[] = [];

  for (const entry of payload) {
    if (typeof entry !== "object" || entry === null) {
      return { error: "Could not read the submitted changes" };
    }

    const { categoryId, month, amount } = entry as Record<string, unknown>;
    const cell = `${String(categoryId)}:${String(month)}`;

    if (!Number.isInteger(categoryId)) {
      return { error: "Unknown subcategory", cell };
    }
    if (!Number.isInteger(month) || (month as number) < 1 || (month as number) > 12) {
      return { error: "Unknown month", cell };
    }

    const plannedCents = parseAmountToCents(String(amount ?? ""));
    if (plannedCents === null) {
      return { error: "Enter a valid amount", cell };
    }
    if (plannedCents < 0) {
      return { error: "Amount cannot be negative", cell };
    }

    changes.push({ categoryId: categoryId as number, month: month as number, plannedCents });
  }

  return { changes };
}

export async function action({ request }: Route.ActionArgs): Promise<PlanningActionResult> {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const rawYear = form.get("year");
  const year = parseYear(rawYear === null ? null : String(rawYear));

  if (intent !== "save-plans") {
    return { ok: false, error: "Unknown action." };
  }

  const parsed = parseChanges(String(form.get("changes") ?? ""));
  if ("error" in parsed) {
    return { ok: false, error: parsed.error, cell: parsed.cell };
  }

  await db.transaction(async (tx) => {
    for (const change of parsed.changes) {
      if (change.plannedCents === 0) {
        await tx
          .delete(budgetPlans)
          .where(
            and(
              eq(budgetPlans.categoryId, change.categoryId),
              eq(budgetPlans.year, year),
              eq(budgetPlans.month, change.month),
            ),
          );
      } else {
        await tx
          .insert(budgetPlans)
          .values({
            categoryId: change.categoryId,
            year,
            month: change.month,
            plannedCents: change.plannedCents,
          })
          .onConflictDoUpdate({
            target: [budgetPlans.categoryId, budgetPlans.year, budgetPlans.month],
            set: { plannedCents: change.plannedCents },
          });
      }
    }
  });

  return { ok: true, saved: parsed.changes.length };
}

export default function Planning({ loaderData }: Route.ComponentProps) {
  const { year, categories: categoryRows, plans } = loaderData;
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<{ error: string; cell?: string } | null>(null);
  const fetcher = useFetcher<PlanningActionResult>();
  const saving = fetcher.state !== "idle";

  const actionError = saveError?.error ?? null;
  const errorCell = saveError?.cell ?? null;

  const effectivePlans = useMemo(() => {
    if (Object.keys(drafts).length === 0) return plans;
    const next = { ...plans };
    for (const [key, raw] of Object.entries(drafts)) {
      next[key] = draftToCents(raw) ?? 0;
    }
    return next;
  }, [plans, drafts]);

  const changes = useMemo(
    () =>
      Object.entries(drafts).flatMap(([key, raw]) => {
        const plannedCents = draftToCents(raw);
        if (plannedCents === null || plannedCents === (plans[key] ?? 0)) return [];
        const [categoryId, month] = key.split(":").map(Number);
        return [{ categoryId, month, amount: (plannedCents / 100).toFixed(2) }];
      }),
    [drafts, plans],
  );

  const hasInvalidDraft = Object.values(drafts).some((raw) => draftToCents(raw) === null);
  const changeLabel = `${changes.length} change${changes.length === 1 ? "" : "s"}`;

  useEffect(() => {
    setEditing(false);
    setDrafts({});
    setSaveError(null);
  }, [year]);

  useEffect(() => {
    if (!editing || changes.length === 0) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [editing, changes.length]);

  const blocker = useBlocker(changes.length > 0);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("You have unsaved changes. Leave without saving?")) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;

    if (fetcher.data.ok) {
      setDrafts({});
      setEditing(false);
      setSaveError(null);
    } else {
      setSaveError({ error: fetcher.data.error, cell: fetcher.data.cell });
    }
  }, [fetcher.state, fetcher.data]);

  function updateDraft(key: string, raw: string) {
    const sanitized = sanitizeAmountInput(raw);
    setSaveError(null);
    setDrafts((current) => ({ ...current, [key]: sanitized }));
  }

  function commitDraft(key: string, raw: string) {
    const normalized = normalizeAmountInput(raw);
    const original = centsToInputValue(plans[key] ?? 0);
    setDrafts((current) => {
      if (normalized === original) {
        if (!(key in current)) return current;
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: normalized };
    });
  }

  function cancelEditing() {
    if (changes.length > 0 && !window.confirm(`Discard ${changeLabel}?`)) return;
    setSaveError(null);
    setDrafts({});
    setEditing(false);
  }

  function saveChanges() {
    if (changes.length === 0 || hasInvalidDraft || saving) return;
    if (!window.confirm(`Save ${changeLabel} for ${year}?`)) return;
    fetcher.submit(
      { intent: "save-plans", year: String(year), changes: JSON.stringify(changes) },
      { method: "post" },
    );
  }

  const groups = KINDS.map((kind) => {
    const rows = categoryRows.filter((category) => category.kind === kind);
    const totals = MONTHS.map((month) =>
      rows.reduce((sum, row) => sum + (effectivePlans[`${row.id}:${month}`] ?? 0), 0),
    );
    return { kind, label: KIND_LABELS[kind], rows, totals };
  });

  const unallocated = MONTHS.map(
    (_, index) =>
      (groups[0]?.totals[index] ?? 0) -
      (groups[1]?.totals[index] ?? 0) -
      (groups[2]?.totals[index] ?? 0),
  );

  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const errorMessage = actionError;

  return (
    <PageShell wide>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Budget planning</h1>
            <p className="text-sm text-muted-foreground">
              Plan every euro of income. To be allocated = income − expenses − savings.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`/planning?year=${year - 1}`} aria-label="Previous year">
                ←
              </Link>
            </Button>
            <span className="w-16 text-center text-lg font-semibold tabular-nums">{year}</span>
            <Button asChild variant="outline" size="sm">
              <Link to={`/planning?year=${year + 1}`} aria-label="Next year">
                →
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to={`/planning?year=${new Date().getFullYear()}`}>This year</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/categories">Manage subcategories</Link>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {editing
              ? changes.length > 0
                ? `${changeLabel} not saved yet.`
                : "Edit mode — change any amount below. Amounts keep two decimals."
              : "View mode — amounts are read-only."}
          </p>
          {editing ? (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={saveChanges}
                disabled={changes.length === 0 || hasInvalidDraft || saving}
              >
                <Check />
                {saving ? "Saving…" : changes.length > 0 ? `Save ${changeLabel}` : "Save changes"}
              </Button>
              <Button size="sm" variant="outline" onClick={cancelEditing} disabled={saving}>
                <X />
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                setSaveError(null);
                setEditing(true);
              }}
            >
              <Pencil />
              Modify
            </Button>
          )}
        </div>

        {errorMessage ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table className="min-w-[1100px]">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 w-[160px] bg-card">Subcategory</TableHead>
                {MONTH_LABELS.map((label, index) => {
                  const amount = unallocated[index] ?? 0;
                  return (
                    <TableHead
                      key={label}
                      className={cn(
                        "text-right",
                        amount === 0 && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                        amount < 0 && "bg-destructive/10 text-destructive",
                      )}
                      title={
                        amount === 0
                          ? "Fully allocated"
                          : amount > 0
                            ? "Income still to allocate"
                            : "Over-allocated"
                      }
                    >
                      {label}
                    </TableHead>
                  );
                })}
                <TableHead className="text-right">Year</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="border-b-2 bg-card hover:bg-card">
                <TableCell className="sticky left-0 z-10 bg-card text-sm font-semibold">
                  To be allocated
                </TableCell>
                {unallocated.map((amount, index) => (
                  <TableCell
                    key={MONTHS[index]}
                    className={cn(
                      "text-right text-sm font-semibold tabular-nums",
                      amount === 0 && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                      amount < 0 && "bg-destructive/10 text-destructive",
                      amount > 0 && "text-muted-foreground",
                    )}
                    title={
                      amount === 0
                        ? "Fully allocated"
                        : amount > 0
                          ? "Income still to allocate"
                          : "Over-allocated"
                    }
                  >
                    {formatCents(amount)}
                  </TableCell>
                ))}
                <TableCell
                  className={cn(
                    "text-right text-sm font-semibold tabular-nums",
                    sum(unallocated) === 0 && "text-emerald-700 dark:text-emerald-400",
                    sum(unallocated) < 0 && "text-destructive",
                  )}
                >
                  {formatCents(sum(unallocated))}
                </TableCell>
              </TableRow>

              {groups.map((group) => (
                <Fragment key={group.kind}>
                  <TableRow className="bg-muted/60 hover:bg-muted/60">
                    <TableCell colSpan={14} className="py-2 text-sm font-semibold">
                      {group.label}
                    </TableCell>
                  </TableRow>

                  {group.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={14} className="text-sm text-muted-foreground">
                        No subcategories yet.
                      </TableCell>
                    </TableRow>
                  ) : null}

                  {group.rows.map((row) => {
                    const rowTotal = MONTHS.reduce(
                      (total, month) => total + (effectivePlans[`${row.id}:${month}`] ?? 0),
                      0,
                    );

                    return (
                      <TableRow key={row.id}>
                        <TableCell className="sticky left-0 z-10 bg-card text-sm font-medium">
                          <div className="max-w-[160px] truncate" title={row.name}>
                            {row.name}
                          </div>
                        </TableCell>
                        {MONTHS.map((month) => {
                          const key = `${row.id}:${month}`;
                          return (
                            <TableCell key={month} className={editing ? "p-0" : undefined}>
                              <PlanCell
                                editing={editing}
                                cents={effectivePlans[key] ?? 0}
                                value={drafts[key] ?? centsToInputValue(plans[key] ?? 0)}
                                label={`${row.name} ${MONTH_LABELS[month - 1]}`}
                                error={
                                  errorCell === key ? (actionError ?? "Enter a valid amount") : null
                                }
                                onChange={(raw) => updateDraft(key, raw)}
                                onBlur={(raw) => commitDraft(key, raw)}
                              />
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right text-sm font-medium tabular-nums">
                          {formatCents(rowTotal)}
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell className="sticky left-0 z-10 bg-muted/30 text-sm font-medium">
                      Total {group.label.toLowerCase()}
                    </TableCell>
                    {group.totals.map((total, index) => (
                      <TableCell
                        key={MONTHS[index]}
                        className="text-right text-sm font-medium tabular-nums"
                      >
                        {formatCents(total)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right text-sm font-semibold tabular-nums">
                      {formatCents(sum(group.totals))}
                    </TableCell>
                  </TableRow>
                </Fragment>
              ))}

            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground">
          Select <span className="font-medium">Modify</span> to edit amounts, then{" "}
          <span className="font-medium">Save changes</span> to store them together. Amounts accept up
          to two decimals and are shown with two on save; leave a cell blank to clear it. Editing is
          not validated against a zero balance — check the "To be allocated" row. Add, rename or
          remove subcategories on the manage subcategories screen.
        </p>
      </div>
    </PageShell>
  );
}

export const meta: Route.MetaFunction = () => [{ title: "Planning · Budtrack" }];
