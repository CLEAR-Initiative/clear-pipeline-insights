CREATE TABLE "evaluation_metric" (
	"run_id" uuid NOT NULL,
	"metric_name" text NOT NULL,
	"scope" text DEFAULT 'overall' NOT NULL,
	"metric_value" numeric(20, 8),
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_metric_run_id_metric_name_scope_pk" PRIMARY KEY("run_id","metric_name","scope")
);
--> statement-breakpoint
CREATE TABLE "evaluation_set" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"stage" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_set_name_version_key" UNIQUE("name","version")
);
--> statement-breakpoint
CREATE TABLE "evaluation_set_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_id" uuid NOT NULL,
	"signal_id" text,
	"input_payload" jsonb NOT NULL,
	"ground_truth" jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evaluation_metric" ADD CONSTRAINT "evaluation_metric_run_id_pipeline_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pipeline_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_set_item" ADD CONSTRAINT "evaluation_set_item_set_id_evaluation_set_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."evaluation_set"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evaluation_metric_run_idx" ON "evaluation_metric" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "evaluation_set_stage_idx" ON "evaluation_set" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "evaluation_set_item_set_idx" ON "evaluation_set_item" USING btree ("set_id");--> statement-breakpoint
CREATE INDEX "evaluation_set_item_signal_idx" ON "evaluation_set_item" USING btree ("signal_id") WHERE "evaluation_set_item"."signal_id" IS NOT NULL;