import { useEffect, useState } from "react";
import { Form, useFetcher } from "react-router";
import { eq } from "drizzle-orm";

import { PageShell } from "~/components/app-nav";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { db } from "~/db";
import { categories as categoriesTable, transactions } from "~/db/schema";
import { getLedger, getTrackingSummary, listCategories } from "~/lib/budget.server";
import { isCategoryKind, KIND_LABELS, KINDS, type CategoryKind } from "~/lib/kinds";
import { formatCents, formatSignedCents, parseAmountToCents } from "~/lib/money";
import { formatIsoDate, todayIso } from "~/lib/period";
import { cn } from "~/lib/utils";

import type { Route } from "./+types/tracking";

type CategoryOption = { id: number; name: string; kind: CategoryKind };
type ActionResult = { ok: true } | { ok: false; error: string };

export async function loader() {
  const [ledger, summary, categoryRows] = await Promise.all([
    getLedger(),
    getTrackingSummary(),
    listCategories(),
  ]);

  return {
    rows: [...ledger].reverse(),
    summary,
    today: todayIso(),
    categories: categoryRows.map((category) => ({
      id: category.id,
      name: category.name,
      kind: category.kind,
    })),
  };
}

function isValidIsoDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
  );
}

async function readTransaction(
  form: FormData,
): Promise<
  | {
      value: {
        occurredOn: string;
        effectiveOn: string;
        kind: CategoryKind;
        categoryId: number;
        amountCents: number;
        comment: string | null;
      };
    }
  | { error: string }
> {
  const occurredOn = String(form.get("occurredOn") ?? "").slice(0, 10);
  const rawEffective = String(form.get("effectiveOn") ?? "").slice(0, 10);
  const effectiveOn = rawEffective || occurredOn;
  const kind = form.get("kind");
  const categoryId = Number(form.get("categoryId"));
  const amount = parseAmountToCents(String(form.get("amount") ?? ""));
  const comment = String(form.get("comment") ?? "").trim();

  if (!isValidIsoDate(occurredOn)) return { error: "Enter a valid date." };
  if (!isValidIsoDate(effectiveOn)) return { error: "Enter a valid effective date." };
  if (!isCategoryKind(kind)) return { error: "Choose a transaction type." };
  if (amount === null) return { error: "Enter a valid amount." };
  if (amount <= 0) return { error: "Amount must be greater than zero." };
  if (!Number.isInteger(categoryId)) return { error: "Choose a subcategory." };

  const [category] = await db
    .select({ id: categoriesTable.id, kind: categoriesTable.kind })
    .from(categoriesTable)
    .where(eq(categoriesTable.id, categoryId))
    .limit(1);

  if (!category) return { error: "Choose a subcategory." };
  if (category.kind !== kind) {
    return { error: "That subcategory belongs to a different type." };
  }

  return {
    value: {
      occurredOn,
      effectiveOn,
      kind,
      categoryId,
      amountCents: amount,
      comment: comment || null,
    },
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "create-transaction" || intent === "update-transaction") {
    const parsed = await readTransaction(form);
    if ("error" in parsed) return { ok: false as const, error: parsed.error };

    if (intent === "create-transaction") {
      await db.insert(transactions).values(parsed.value);
    } else {
      const id = Number(form.get("id"));
      if (!Number.isInteger(id)) return { ok: false as const, error: "Unknown transaction." };
      await db
        .update(transactions)
        .set({ ...parsed.value, updatedAt: new Date() })
        .where(eq(transactions.id, id));
    }

    return { ok: true as const };
  }

  if (intent === "delete-transaction") {
    const id = Number(form.get("id"));
    if (!Number.isInteger(id)) return { ok: false as const, error: "Unknown transaction." };
    await db.delete(transactions).where(eq(transactions.id, id));
    return { ok: true as const };
  }

  return { ok: false as const, error: "Unknown action." };
}

function kindBadgeClass(kind: CategoryKind) {
  if (kind === "income") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (kind === "savings") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function KindBadge({ kind }: { kind: CategoryKind }) {
  return (
    <Badge variant="outline" className={cn("font-medium", kindBadgeClass(kind))}>
      {KIND_LABELS[kind]}
    </Badge>
  );
}

function AddTransactionForm({
  categories,
  today,
}: {
  categories: CategoryOption[];
  today: string;
}) {
  const fetcher = useFetcher<ActionResult>();
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [categoryId, setCategoryId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [occurredOn, setOccurredOn] = useState(today);
  const [effectiveOn, setEffectiveOn] = useState(today);

  const options = categories.filter((category) => category.kind === kind);
  const selectedCategory = options.some((option) => String(option.id) === categoryId)
    ? categoryId
    : "";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      setAmount("");
      setComment("");
    }
  }, [fetcher.state, fetcher.data]);

  const error = fetcher.data && !fetcher.data.ok ? fetcher.data.error : null;

  return (
    <fetcher.Form method="post" className="space-y-3">
      <input type="hidden" name="intent" value="create-transaction" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="tx-date">
            Date
          </label>
          <Input
            id="tx-date"
            name="occurredOn"
            type="date"
            value={occurredOn}
            onChange={(event) => setOccurredOn(event.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="tx-effective">
            Effective date
          </label>
          <Input
            id="tx-effective"
            name="effectiveOn"
            type="date"
            value={effectiveOn}
            onChange={(event) => setEffectiveOn(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="tx-kind">
            Type
          </label>
          <Select
            name="kind"
            value={kind}
            onValueChange={(value) => {
              setKind(value as CategoryKind);
              setCategoryId("");
            }}
          >
            <SelectTrigger id="tx-kind" className="w-full">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((option) => (
                <SelectItem key={option} value={option}>
                  {KIND_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="tx-category">
            Subcategory
          </label>
          <Select name="categoryId" value={selectedCategory} onValueChange={setCategoryId}>
            <SelectTrigger id="tx-category" className="w-full">
              <SelectValue placeholder={options.length ? "Choose…" : "No subcategories"} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.id} value={String(option.id)}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="tx-amount">
            Amount
          </label>
          <Input
            id="tx-amount"
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="tx-comment">
            Comment
          </label>
          <Input
            id="tx-comment"
            name="comment"
            placeholder="Optional note"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={fetcher.state !== "idle"}>
          {fetcher.state === "idle" ? "Add transaction" : "Saving…"}
        </Button>
        {error ? <span className="text-sm text-destructive">{error}</span> : null}
      </div>
    </fetcher.Form>
  );
}

function EditRow({
  row,
  categories,
  onCancel,
  onSaved,
}: {
  row: Route.ComponentProps["loaderData"]["rows"][number];
  categories: CategoryOption[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const fetcher = useFetcher<ActionResult>();
  const formId = `edit-tx-${row.id}`;
  const options = categories.filter((category) => category.kind === row.kind);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) onSaved();
  }, [fetcher.state, fetcher.data, onSaved]);

  const error = fetcher.data && !fetcher.data.ok ? fetcher.data.error : null;

  return (
    <TableRow className="bg-muted/30">
      <TableCell>
        <fetcher.Form id={formId} method="post" className="contents">
          <input type="hidden" name="intent" value="update-transaction" />
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="kind" value={row.kind} />
        </fetcher.Form>
        <Input
          form={formId}
          name="occurredOn"
          type="date"
          defaultValue={row.occurredOn.slice(0, 10)}
          className="h-8 w-36"
          aria-label="Date"
        />
      </TableCell>
      <TableCell>
        <KindBadge kind={row.kind} />
      </TableCell>
      <TableCell>
        <select
          form={formId}
          name="categoryId"
          defaultValue={String(row.categoryId)}
          aria-label="Subcategory"
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <Input
          form={formId}
          name="comment"
          defaultValue={row.comment ?? ""}
          className="h-8"
          aria-label="Comment"
        />
      </TableCell>
      <TableCell>
        <Input
          form={formId}
          name="amount"
          inputMode="decimal"
          defaultValue={(row.amountCents / 100).toFixed(2)}
          className="h-8 w-28 text-right"
          aria-label="Amount"
        />
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
        {formatSignedCents(row.balanceCents)}
      </TableCell>
      <TableCell>
        <Input
          form={formId}
          name="effectiveOn"
          type="date"
          defaultValue={row.effectiveOn.slice(0, 10)}
          className="h-8 w-36"
          aria-label="Effective date"
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button form={formId} type="submit" size="sm" className="h-8">
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={onCancel}>
            Cancel
          </Button>
        </div>
        {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      </TableCell>
    </TableRow>
  );
}

export default function Tracking({ loaderData }: Route.ComponentProps) {
  const { rows, summary, today, categories } = loaderData;
  const [editingId, setEditingId] = useState<number | null>(null);

  return (
    <PageShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Budget tracking</h1>
          <p className="text-sm text-muted-foreground">
            Record what actually moved. Income increases the available balance, expenses and
            savings reduce it.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Today
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">
              {formatIsoDate(today)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Last record
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">
              {formatIsoDate(summary.lastRecordOn)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Balance to allocate
              </CardTitle>
            </CardHeader>
            <CardContent
              className={cn(
                "text-2xl font-semibold tabular-nums",
                summary.balanceCents < 0 && "text-destructive",
              )}
            >
              {formatSignedCents(summary.balanceCents)}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New transaction</CardTitle>
          </CardHeader>
          <CardContent>
            <AddTransactionForm categories={categories} today={today} />
          </CardContent>
        </Card>

        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table className="min-w-[980px]">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Subcategory</TableHead>
                <TableHead>Comment</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Effective date</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-sm text-muted-foreground">
                    No transactions yet. Add your first one above.
                  </TableCell>
                </TableRow>
              ) : null}

              {rows.map((row) =>
                editingId === row.id ? (
                  <EditRow
                    key={row.id}
                    row={row}
                    categories={categories}
                    onCancel={() => setEditingId(null)}
                    onSaved={() => setEditingId(null)}
                  />
                ) : (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatIsoDate(row.occurredOn)}
                    </TableCell>
                    <TableCell>
                      <KindBadge kind={row.kind} />
                    </TableCell>
                    <TableCell>{row.categoryName}</TableCell>
                    <TableCell className="max-w-64 truncate text-muted-foreground">
                      {row.comment ?? "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular-nums",
                        row.kind === "income" ? "text-emerald-700" : "text-foreground",
                      )}
                    >
                      {row.kind === "income" ? "+" : "−"}
                      {formatCents(row.amountCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatSignedCents(row.balanceCents)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {formatIsoDate(row.effectiveOn)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          onClick={() => setEditingId(row.id)}
                        >
                          Edit
                        </Button>
                        <Form method="post">
                          <input type="hidden" name="intent" value="delete-transaction" />
                          <input type="hidden" name="id" value={row.id} />
                          <Button
                            type="submit"
                            size="sm"
                            variant="ghost"
                            className="h-8 text-muted-foreground hover:text-destructive"
                            onClick={(event) => {
                              if (!window.confirm("Delete this transaction?")) {
                                event.preventDefault();
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </Form>
                      </div>
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </PageShell>
  );
}

export const meta: Route.MetaFunction = () => [{ title: "Tracking · Budtrack" }];
