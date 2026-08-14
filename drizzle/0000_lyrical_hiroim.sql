CREATE TABLE "acces" (
	"email" text NOT NULL,
	"app_id" text NOT NULL,
	"accorde_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acces_email_app_id_pk" PRIMARY KEY("email","app_id")
);
--> statement-breakpoint
CREATE TABLE "personnes" (
	"email" text PRIMARY KEY NOT NULL,
	"nom" text,
	"actif" boolean DEFAULT true NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "acces" ADD CONSTRAINT "acces_email_personnes_email_fk" FOREIGN KEY ("email") REFERENCES "public"."personnes"("email") ON DELETE cascade ON UPDATE no action;