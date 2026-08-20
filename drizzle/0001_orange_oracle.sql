CREATE TABLE "releves" (
	"app_id" text NOT NULL,
	"releve_le" timestamp with time zone DEFAULT now() NOT NULL,
	"etat" text NOT NULL,
	"data_as_of" timestamp with time zone,
	"metriques" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cout_montant" numeric,
	"cout_devise" text,
	"cout_periode" text,
	CONSTRAINT "releves_app_id_releve_le_pk" PRIMARY KEY("app_id","releve_le")
);
