import { Form } from "react-router";

import { PageShell } from "~/components/app-nav";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { getDashboardRows } from "~/lib/budget.server";
import { KIND_LABELS, KINDS } from "~/lib/kinds";
import { formatCents } from "~/lib/money";
import { MONTH_OPTIONS, parseYear } from "~/lib/period";
import { cn } from "~/lib/utils";

import type { Route } from "./+types/dashboard";

function parseMonth(value: string | null): number | null {
  if (value === "all") return null;
  const month = Number(value);
  if (Number.isInteger(month) && month >= 1 && month <= 12) return month;
  return new Date().getMonth() + 1;
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const year = parseYear(url.searchParams.get("year"));
  const month = parseMonth(url.searchParams.get("month"));
  const rows = await getDashboardRows(year, month);

  return { year, month, rows };
}

function percent(actual: number, planned: number) {
  if (planned <= 0) return actual > 0 ? 100 : 0;
  return (actual / planned) * 100;
}

const BAR_COLORS: Record<string, string> = {
  income: "bg-emerald-500",
  expense: "bg-rose-500",
  savings: "bg-sky-500",
};

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { year, month, rows } = loaderData;
  const currentYear = new Date().getFullYear();
  const years = Array.from(
    new Set([year, currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2]),
  ).sort((a, b) => a - b);

  const totals = KINDS.map((kind) => {
    const kindRows = rows.filter((row) => row.kind === kind);
    return {
      kind,
      planned: kindRows.reduce((sum, row) => sum + row.plannedCents, 0),
      actual: kindRows.reduce((sum, row) => sum + row.actualCents, 0),
    };
  });

  const plannedUnallocated =
    (totals[0]?.planned ?? 0) - (totals[1]?.planned ?? 0) - (totals[2]?.planned ?? 0);

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Planned versus actual for{" "}
              {month
                ? `${MONTH_OPTIONS.find((option) => option.value === month)?.label} ${year}`
                : `the whole of ${year}`}
              .
            </p>
          </div>

          <Form method="get" className="flex items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="period-year">
                Year
              </label>
              <select
                id="period-year"
                name="year"
                defaultValue={String(year)}
                onChange={(event) => event.currentTarget.form?.requestSubmit()}
                className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
              >
                {years.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="period-month">
                Month
              </label>
              <select
                id="period-month"
                name="month"
                defaultValue={month ? String(month) : "all"}
                onChange={(event) => event.currentTarget.form?.requestSubmit()}
                className="h-9 w-36 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="all">Full year</option>
                {MONTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm" variant="outline" className="h-9">
              View
            </Button>
          </Form>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {totals.map((total) => (
            <Card key={total.kind}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {KIND_LABELS[total.kind]}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-2xl font-semibold tabular-nums">{formatCents(total.actual)}</p>
                <p className="text-xs text-muted-foreground">
                  actual of {formatCents(total.planned)} planned
                </p>
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Planned unallocated
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  plannedUnallocated !== 0 && "text-destructive",
                )}
              >
                {formatCents(plannedUnallocated)}
              </p>
              <p className="text-xs text-muted-foreground">income − expenses − savings</p>
            </CardContent>
          </Card>
        </div>

        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>Subcategory</TableHead>
                <TableHead className="text-right">Planned</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="w-48">Completion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {KINDS.map((kind) => {
                const kindRows = rows.filter((row) => row.kind === kind);
                const plannedTotal = kindRows.reduce((sum, row) => sum + row.plannedCents, 0);
                const actualTotal = kindRows.reduce((sum, row) => sum + row.actualCents, 0);

                return [
                  <TableRow key={`${kind}-header`} className="bg-muted/60 hover:bg-muted/60">
                    <TableCell colSpan={5} className="py-2 text-sm font-semibold">
                      {KIND_LABELS[kind]}
                    </TableCell>
                  </TableRow>,
                  kindRows.length === 0 ? (
                    <TableRow key={`${kind}-empty`}>
                      <TableCell colSpan={5} className="text-sm text-muted-foreground">
                        No subcategories yet.
                      </TableCell>
                    </TableRow>
                  ) : null,
                  ...kindRows.map((row) => {
                    const completion = percent(row.actualCents, row.plannedCents);
                    return (
                      <TableRow key={row.categoryId}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCents(row.plannedCents)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCents(row.actualCents)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            row.plannedCents - row.actualCents < 0 && "text-destructive",
                          )}
                        >
                          {formatCents(row.plannedCents - row.actualCents)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-28 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn("h-full rounded-full", BAR_COLORS[kind])}
                                style={{ width: `${Math.min(100, completion)}%` }}
                              />
                            </div>
                            <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                              {Math.round(completion)}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }),
                  <TableRow
                    key={`${kind}-total`}
                    className="bg-muted/30 font-medium hover:bg-muted/30"
                  >
                    <TableCell className="text-sm">Total {KIND_LABELS[kind].toLowerCase()}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(plannedTotal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(actualTotal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(plannedTotal - actualTotal)}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {Math.round(percent(actualTotal, plannedTotal))}% of plan
                    </TableCell>
                  </TableRow>,
                ];
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </PageShell>
  );
}

export const meta: Route.MetaFunction = () => [{ title: "Dashboard · Budtrack" }];
