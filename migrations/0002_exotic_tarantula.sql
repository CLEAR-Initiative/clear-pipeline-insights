CREATE TABLE "event_rating" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"rater" text DEFAULT 'james' NOT NULL,
	"verdict" text NOT NULL,
	"confidence" smallint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_rating_event_rater_key" UNIQUE("event_id","rater")
);
--> statement-breakpoint
CREATE TABLE "imported_event" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"description" text,
	"types" text[],
	"rank" real,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone NOT NULL,
	"first_signal_created_at" timestamp with time zone NOT NULL,
	"last_signal_created_at" timestamp with time zone NOT NULL,
	"population_affected" text,
	"origin_location_id" text,
	"destination_location_id" text,
	"location_id" text,
	"raw_event" jsonb NOT NULL,
	"team_id" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imported_signal" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"source_id" text,
	"source_name" text,
	"title" text,
	"description" text,
	"url" text,
	"published_at" timestamp with time zone NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
	"raw_signal" jsonb NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "imported_signal" ADD CONSTRAINT "imported_signal_event_id_imported_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."imported_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_rating_event_idx" ON "event_rating" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_rating_created_idx" ON "event_rating" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "imported_event_valid_from_idx" ON "imported_event" USING btree ("valid_from" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "imported_event_imported_at_idx" ON "imported_event" USING btree ("imported_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "imported_signal_event_idx" ON "imported_signal" USING btree ("event_id");