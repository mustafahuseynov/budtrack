import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const categoryKindEnum = pgEnum("category_kind", [
  "income",
  "expense",
  "savings",
]);

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  kind: categoryKindEnum("kind").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const budgetPlans = pgTable(
  "budget_plans",
  {
    id: serial("id").primaryKey(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    plannedCents: integer("planned_cents").notNull().default(0),
  },
  (table) => [
    unique("budget_plans_category_period_unique").on(
      table.categoryId,
      table.year,
      table.month,
    ),
  ],
);

export const savingsGoals = pgTable(
  "savings_goals",
  {
    id: serial("id").primaryKey(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    targetCents: integer("target_cents").notNull(),
    targetDate: date("target_date").notNull(),
    initialCents: integer("initial_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("savings_goals_category_unique").on(table.categoryId),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    occurredOn: date("occurred_on").notNull(),
    effectiveOn: date("effective_on").notNull(),
    kind: categoryKindEnum("kind").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("transactions_occurred_on_idx").on(table.occurredOn, table.id),
    index("transactions_category_idx").on(table.categoryId),
  ],
);

export type Category = typeof categories.$inferSelect;
export type BudgetPlan = typeof budgetPlans.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type SavingsGoal = typeof savingsGoals.$inferSelect;
export type CategoryKind = Category["kind"];
