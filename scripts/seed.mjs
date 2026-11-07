import pg from "pg";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://budtrack:budtrack@localhost:55432/budtrack";

const pool = new pg.Pool({ connectionString, max: 1 });

const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1;
const monthName = now.toLocaleString("en-IE", { month: "long" });

const isoDate = (day) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const categories = [
  { kind: "income", name: "Salary", plan: 320000 },
  { kind: "income", name: "Freelance", plan: 0 },
  { kind: "expense", name: "Rent", plan: 120000 },
  { kind: "expense", name: "Groceries", plan: 40000 },
  { kind: "expense", name: "Transport", plan: 15000 },
  { kind: "expense", name: "Utilities", plan: 12000 },
  { kind: "expense", name: "Dining out", plan: 18000 },
  { kind: "expense", name: "Shopping", plan: 15000 },
  { kind: "savings", name: "Emergency fund", plan: 30000 },
  { kind: "savings", name: "Investments", plan: 20000 },
  { kind: "savings", name: "Holiday fund", plan: 50000 },
];

const transactions = [
  { day: 1, effectiveDay: 1, kind: "income", category: "Salary", amount: 320000, comment: `${monthName} salary` },
  { day: 2, effectiveDay: 1, kind: "expense", category: "Rent", amount: 120000, comment: "Monthly rent" },
  { day: 2, effectiveDay: 2, kind: "expense", category: "Transport", amount: 4200, comment: "Fuel" },
  { day: 3, effectiveDay: 3, kind: "expense", category: "Groceries", amount: 13240, comment: "Weekly shop" },
  { day: 4, effectiveDay: 6, kind: "expense", category: "Dining out", amount: 3850, comment: "Dinner with friends" },
  { day: 5, effectiveDay: 5, kind: "savings", category: "Emergency fund", amount: 30000, comment: "Monthly transfer" },
];

const client = await pool.connect();

try {
  const existing = await client.query("select count(*)::int as count from categories");
  if (existing.rows[0].count > 0) {
    console.log("seed skipped: categories already exist");
  } else {
    await client.query("begin");

    const ids = new Map();
    for (const [index, category] of categories.entries()) {
      const inserted = await client.query(
        "insert into categories (kind, name, sort_order) values ($1, $2, $3) returning id",
        [category.kind, category.name, index],
      );
      ids.set(category.name, inserted.rows[0].id);
    }

    for (const category of categories) {
      for (let planMonth = 1; planMonth <= 12; planMonth += 1) {
        await client.query(
          `insert into budget_plans (category_id, year, month, planned_cents)
           values ($1, $2, $3, $4)
           on conflict (category_id, year, month) do nothing`,
          [ids.get(category.name), year, planMonth, category.plan],
        );
      }
    }

    for (const transaction of transactions) {
      await client.query(
        `insert into transactions
           (occurred_on, effective_on, kind, category_id, amount_cents, comment)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          isoDate(transaction.day),
          isoDate(transaction.effectiveDay),
          transaction.kind,
          ids.get(transaction.category),
          transaction.amount,
          transaction.comment,
        ],
      );
    }

    await client.query("commit");
    console.log(
      `seed complete: ${categories.length} categories, ${transactions.length} transactions`,
    );
  }
} catch (error) {
  await client.query("rollback").catch(() => {});
  throw error;
} finally {
  client.release();
  await pool.end();
}
