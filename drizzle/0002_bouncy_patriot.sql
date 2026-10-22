CREATE TABLE "gantt_releve" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"recu_le" timestamp with time zone DEFAULT now() NOT NULL,
	"envoye_le" timestamp with time zone NOT NULL,
	"donnees_gz_b64" text NOT NULL,
	"etat" jsonb NOT NULL,
	"fiabilite" jsonb NOT NULL,
	"prochaines" jsonb NOT NULL,
	"quota" jsonb NOT NULL,
	CONSTRAINT "gantt_releve_une_ligne" CHECK ("gantt_releve"."id" = 1)
);
