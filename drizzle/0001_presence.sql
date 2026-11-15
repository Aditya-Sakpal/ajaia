CREATE TABLE "document_presence" (
	"document_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_presence_document_id_user_id_pk" PRIMARY KEY("document_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "document_presence" ADD CONSTRAINT "document_presence_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_presence" ADD CONSTRAINT "document_presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;