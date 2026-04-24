CREATE TABLE "call_rating" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid NOT NULL,
	"rater" text DEFAULT 'james' NOT NULL,
	"verdict" text NOT NULL,
	"confidence" smallint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "call_rating_call_rater_key" UNIQUE("call_id","rater")
);
--> statement-breakpoint
ALTER TABLE "call_rating" ADD CONSTRAINT "call_rating_call_id_llm_call_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."llm_call"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "call_rating_created_idx" ON "call_rating" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "call_rating_call_idx" ON "call_rating" USING btree ("call_id");