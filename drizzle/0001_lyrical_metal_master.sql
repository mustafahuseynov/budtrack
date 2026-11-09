CREATE TABLE "savings_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"target_cents" integer NOT NULL,
	"target_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "savings_goals_category_unique" UNIQUE("category_id")
);
--> statement-breakpoint
ALTER TABLE "savings_goals" ADD CONSTRAINT "savings_goals_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;