CREATE TABLE "chantier_evenements" (
	"id" text PRIMARY KEY NOT NULL,
	"cle" text NOT NULL,
	"type" text NOT NULL,
	"action" text NOT NULL,
	"repo" text NOT NULL,
	"n" integer,
	"sha" text,
	"at" timestamp with time zone NOT NULL,
	"etat" text,
	"plus" jsonb,
	"recu_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "chantier_evenements_recu_le" ON "chantier_evenements" USING btree ("recu_le");