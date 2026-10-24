CREATE TABLE "lia_reglages" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"pause" boolean DEFAULT false NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lia_reglages_une_ligne" CHECK ("lia_reglages"."id" = 1)
);
