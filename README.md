# Budtrack

A small, single-user zero-based budget tracker: plan every euro of income into subcategories,
record what actually happened, and compare the two.

- **Stack:** React Router 8 (framework mode, SSR) · TypeScript · Tailwind CSS 4 · shadcn/ui ·
  Drizzle ORM · PostgreSQL 18 · Docker Compose
- **Money:** stored as integer cents (EUR), no floating point anywhere.

## Pages

| Page | What it does |
| --- | --- |
| `/planning` | Year switcher and a full-width 12-month grid of planned amounts per subcategory. The `To be allocated` row sits on top (income − expenses − savings); a month turns green when nothing is left to allocate and red when it is over-allocated. Amounts open read-only (currency formatted); select **Modify** to edit cells and **Save changes** to commit them together (up to two decimals per amount). |
| `/savings` | Savings planner: create savings subcategories with a target amount and target date, then see how much has been saved so far, the percentage reached, the remaining amount, the calendar months left (current month included) and the suggested monthly amount. Progress comes from the savings transactions recorded in Tracking; targets can be edited or cleared without losing the subcategory or its history. |
| `/categories` | Add, rename and delete income and expense subcategories. Kind is fixed when a subcategory is created, and deleting one with transactions is refused. Savings subcategories are created and managed in the Savings Planner, which this page links to. |
| `/tracking` | Today, date of last record and the current balance to allocate. Add transactions (date, effective date, type, subcategory, amount, comment) and edit/delete them in the ledger, which shows the running balance per row. |
| `/dashboard` | Planned vs actual per subcategory and per category for a selected year and month (or the whole year), with completion bars. |

The Sun/Moon button in the top-right corner toggles the dark theme. The choice is remembered in
`localStorage`; on first visit the app follows the operating system preference.

## Run with Docker (recommended)

```bash
cp .env.example .env      # optional: adjust credentials/ports
docker compose up --build
```

Open <http://localhost:3000>. The app container applies migrations, then starts the server. A
fresh database starts empty; create your first subcategories in the app. PostgreSQL data lives
in the named volume `pgdata`, so `docker compose down` / `up` keeps your data (use
`docker compose down -v` to reset).

The database is published on host port **55432** by default (`POSTGRES_PORT`) to avoid clashing
with a local PostgreSQL install; set it in `.env` if you prefer another port.

## Local development

```bash
npm install
docker compose up -d db       # database only
npm run db:migrate            # apply migrations
npm run dev                   # http://localhost:5173
```

`DATABASE_URL` defaults to `postgres://budtrack:budtrack@localhost:55432/budtrack`; scripts read it
from `.env` when present.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Production build into `build/` |
| `npm start` | Serve the production build (`react-router-serve`) |
| `npm run typecheck` | Generate route types and run `tsc` |
| `npm run db:generate` | Generate a migration from `app/db/schema.ts` into `drizzle/` |
| `npm run db:migrate` | Apply pending migrations |

## Data model

- `categories` — `kind` (`income` | `expense` | `savings`), `name`, `sort_order`. Kind is fixed
  when a subcategory is created.
- `savings_goals` — optional target per savings subcategory: `target_cents` and `target_date`
  (unique per subcategory). Removing a goal keeps the subcategory and its transactions.
- `budget_plans` — planned amount per subcategory, year and month (unique per cell).
- `transactions` — `occurred_on` (entry date), `effective_on` (when the money actually moved),
  `kind`, `category_id`, `amount_cents` (always positive), `comment`.

Sign is derived from `kind`: income adds to the balance, expenses and savings subtract from it.
Deleting a subcategory that already has transactions is refused.
