CREATE TABLE "chantier_gestes" (
	"id" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"geste" text NOT NULL,
	"texte" text,
	"quand" timestamp with time zone NOT NULL,
	"recu_le" timestamp with time zone DEFAULT now() NOT NULL,
	"prise_le" timestamp with time zone
);
