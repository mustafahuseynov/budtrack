CREATE TYPE "public"."category_kind" AS ENUM('income', 'expense', 'savings');--> statement-breakpoint
CREATE TABLE "budget_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"planned_cents" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "budget_plans_category_period_unique" UNIQUE("category_id","year","month")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "category_kind" NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"occurred_on" date NOT NULL,
	"effective_on" date NOT NULL,
	"kind" "category_kind" NOT NULL,
	"category_id" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_plans" ADD CONSTRAINT "budget_plans_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_occurred_on_idx" ON "transactions" USING btree ("occurred_on","id");--> statement-breakpoint
CREATE INDEX "transactions_category_idx" ON "transactions" USING btree ("category_id");