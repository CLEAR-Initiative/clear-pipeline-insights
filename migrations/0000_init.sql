CREATE TABLE "llm_call" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"signal_id" text,
	"event_id" text,
	"system_prompt" text NOT NULL,
	"user_prompt" text NOT NULL,
	"raw_response" text NOT NULL,
	"parsed_response" jsonb,
	"parse_error" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_read_tokens" integer,
	"cache_create_tokens" integer,
	"cost_usd" numeric(10, 6),
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"env" text NOT NULL,
	"pipeline_repo" text NOT NULL,
	"git_sha" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_call" ADD CONSTRAINT "llm_call_run_id_pipeline_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pipeline_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_call_run_stage_created_idx" ON "llm_call" USING btree ("run_id","stage","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "llm_call_signal_idx" ON "llm_call" USING btree ("signal_id") WHERE "llm_call"."signal_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "llm_call_created_idx" ON "llm_call" USING btree ("created_at" DESC NULLS LAST);