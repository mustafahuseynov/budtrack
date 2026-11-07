import { Form, redirect, useActionData } from "react-router";
import { eq, sql } from "drizzle-orm";

import { PageShell } from "~/components/app-nav";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { db } from "~/db";
import { categories, transactions } from "~/db/schema";
import { listCategories } from "~/lib/budget.server";
import { isCategoryKind, KIND_LABELS, KINDS } from "~/lib/kinds";

import type { Route } from "./+types/categories";

export async function loader() {
  const [categoryRows, usageRows] = await Promise.all([
    listCategories(),
    db
      .select({
        categoryId: transactions.categoryId,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(transactions)
      .groupBy(transactions.categoryId),
  ]);

  const usage = new Map(usageRows.map((row) => [row.categoryId, row.count]));

  const groups = KINDS.map((kind) => ({
    kind,
    label: KIND_LABELS[kind],
    rows: categoryRows
      .filter((category) => category.kind === kind)
      .map((category) => ({
        id: category.id,
        name: category.name,
        transactionCount: usage.get(category.id) ?? 0,
      })),
  }));

  return { groups };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "create-category") {
    const name = String(form.get("name") ?? "").trim();
    const kind = form.get("kind");

    if (!name) return { error: "Subcategory name is required." };
    if (!isCategoryKind(kind)) return { error: "Choose a category type." };

    const [max] = await db
      .select({ value: sql<number>`coalesce(max(${categories.sortOrder}), 0)` })
      .from(categories)
      .where(eq(categories.kind, kind));

    await db.insert(categories).values({ kind, name, sortOrder: Number(max?.value ?? 0) + 1 });
    return redirect("/categories");
  }

  if (intent === "rename-category") {
    const categoryId = Number(form.get("categoryId"));
    const name = String(form.get("name") ?? "").trim();

    if (!Number.isInteger(categoryId)) return { error: "Unknown subcategory." };
    if (!name) return { error: "Subcategory name is required." };

    await db.update(categories).set({ name }).where(eq(categories.id, categoryId));
    return redirect("/categories");
  }

  if (intent === "delete-category") {
    const categoryId = Number(form.get("categoryId"));
    if (!Number.isInteger(categoryId)) return { error: "Unknown subcategory." };

    const [usage] = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(transactions)
      .where(eq(transactions.categoryId, categoryId));

    if ((usage?.count ?? 0) > 0) {
      return {
        error: `Cannot delete this subcategory: ${usage.count} transaction(s) still reference it.`,
      };
    }

    await db.delete(categories).where(eq(categories.id, categoryId));
    return redirect("/categories");
  }

  return { error: "Unknown action." };
}

export default function Categories({ loaderData, actionData }: Route.ComponentProps) {
  const { groups } = loaderData;
  const errorMessage = actionData && "error" in actionData ? actionData.error : null;

  return (
    <PageShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Subcategories</h1>
          <p className="text-sm text-muted-foreground">
            Add, rename and remove the subcategories used by the planning grid. A subcategory keeps
            its type for its whole lifetime.
          </p>
        </div>

        {errorMessage ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}

        <div className="rounded-lg border bg-card p-4">
          <Form method="post" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="intent" value="create-category" />
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="new-kind">
                Category
              </label>
              <Select name="kind" defaultValue="expense">
                <SelectTrigger id="new-kind" className="h-9 w-36">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {KIND_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="new-name">
                New subcategory
              </label>
              <Input
                id="new-name"
                name="name"
                placeholder="e.g. Groceries"
                className="w-56"
                required
              />
            </div>
            <Button type="submit" size="sm">
              Add subcategory
            </Button>
          </Form>
        </div>

        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.kind} className="rounded-lg border bg-card">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 className="text-sm font-semibold">{group.label}</h2>
                <span className="text-xs text-muted-foreground">
                  {group.rows.length} subcategor{group.rows.length === 1 ? "y" : "ies"}
                </span>
              </div>

              {group.rows.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">No subcategories yet.</p>
              ) : (
                <ul className="divide-y">
                  {group.rows.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center gap-2 px-4 py-2 sm:flex-nowrap"
                    >
                      <Form method="post" className="flex flex-1 items-center gap-2">
                        <input type="hidden" name="intent" value="rename-category" />
                        <input type="hidden" name="categoryId" value={row.id} />
                        <Input
                          name="name"
                          defaultValue={row.name}
                          aria-label={`Rename ${row.name}`}
                          className="h-8 max-w-xs"
                        />
                        <Button type="submit" size="sm" variant="outline">
                          Save
                        </Button>
                      </Form>
                      <span className="w-28 text-right text-xs text-muted-foreground tabular-nums">
                        {row.transactionCount} transaction{row.transactionCount === 1 ? "" : "s"}
                      </span>
                      <Form method="post">
                        <input type="hidden" name="intent" value="delete-category" />
                        <input type="hidden" name="categoryId" value={row.id} />
                        <Button
                          type="submit"
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={(event) => {
                            if (!window.confirm(`Delete "${row.name}"?`)) {
                              event.preventDefault();
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </Form>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Deleting a subcategory also removes its planned amounts. Renaming keeps all plans and
          transactions intact.
        </p>
      </div>
    </PageShell>
  );
}

export const meta: Route.MetaFunction = () => [{ title: "Subcategories · Budtrack" }];
