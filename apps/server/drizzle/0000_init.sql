CREATE TABLE "bindings" (
	"customer_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"guide_id" text NOT NULL,
	"store_id" text NOT NULL,
	"strength" text NOT NULL,
	"since" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"source_record_id" text NOT NULL,
	"last_record_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bindings_customer_id_merchant_id_pk" PRIMARY KEY("customer_id","merchant_id")
);
--> statement-breakpoint
CREATE TABLE "codes" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"merchant_id" text NOT NULL,
	"store_id" text NOT NULL,
	"spu_id" text,
	"guide_id" text,
	"order_draft_id" text,
	"zone" text,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"guide_id" text NOT NULL,
	"store_id" text NOT NULL,
	"discount" jsonb NOT NULL,
	"scope" jsonb NOT NULL,
	"stack_with_platform" boolean NOT NULL,
	"status" text DEFAULT 'unused' NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"issued_record_id" text NOT NULL,
	"used_order_id" text
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guides" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"store_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"customer_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"on_duty" boolean DEFAULT false NOT NULL,
	"zones" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_settings" (
	"merchant_id" text PRIMARY KEY NOT NULL,
	"attribution_rules" jsonb NOT NULL,
	"guide_coupon_rules" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"store_id" text NOT NULL,
	"guide_id" text NOT NULL,
	"lines" jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"source" text NOT NULL,
	"draft_id" text,
	"lines" jsonb NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"discount_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"coupon_id" text,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"attr_kind" text NOT NULL,
	"attr_store_id" text,
	"attr_guide_id" text,
	"attr_basis_record_id" text,
	"commission_eligible" boolean NOT NULL,
	"commission_ineligible_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_records" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"store_id" text,
	"guide_id" text,
	"type" text NOT NULL,
	"spu_id" text,
	"meta" jsonb,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skus" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"spu_id" text NOT NULL,
	"color" text NOT NULL,
	"size" text NOT NULL,
	"price_cents" integer NOT NULL,
	"status" text DEFAULT 'on_sale' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spus" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'on_sale' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_samples" (
	"merchant_id" text NOT NULL,
	"store_id" text NOT NULL,
	"sku_id" text NOT NULL,
	CONSTRAINT "store_samples_store_id_sku_id_pk" PRIMARY KEY("store_id","sku_id")
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bindings" ADD CONSTRAINT "bindings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bindings" ADD CONSTRAINT "bindings_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bindings" ADD CONSTRAINT "bindings_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bindings" ADD CONSTRAINT "bindings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codes" ADD CONSTRAINT "codes_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codes" ADD CONSTRAINT "codes_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codes" ADD CONSTRAINT "codes_spu_id_spus_id_fk" FOREIGN KEY ("spu_id") REFERENCES "public"."spus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codes" ADD CONSTRAINT "codes_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guides" ADD CONSTRAINT "guides_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_settings" ADD CONSTRAINT "merchant_settings_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_drafts" ADD CONSTRAINT "order_drafts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_drafts" ADD CONSTRAINT "order_drafts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_drafts" ADD CONSTRAINT "order_drafts_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_spu_id_spus_id_fk" FOREIGN KEY ("spu_id") REFERENCES "public"."spus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_spu_id_spus_id_fk" FOREIGN KEY ("spu_id") REFERENCES "public"."spus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spus" ADD CONSTRAINT "spus_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_samples" ADD CONSTRAINT "store_samples_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_samples" ADD CONSTRAINT "store_samples_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_samples" ADD CONSTRAINT "store_samples_sku_id_skus_id_fk" FOREIGN KEY ("sku_id") REFERENCES "public"."skus"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bindings_guide_expires_idx" ON "bindings" USING btree ("guide_id","expires_at");--> statement-breakpoint
CREATE INDEX "codes_merchant_idx" ON "codes" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "codes_active_product_uq" ON "codes" USING btree ("store_id","spu_id") WHERE kind = 'product' and status = 'active';--> statement-breakpoint
CREATE INDEX "coupons_customer_merchant_issued_idx" ON "coupons" USING btree ("customer_id","merchant_id","issued_at");--> statement-breakpoint
CREATE INDEX "guides_merchant_idx" ON "guides" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "guides_store_idx" ON "guides" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "guides_customer_idx" ON "guides" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "order_drafts_guide_idx" ON "order_drafts" USING btree ("guide_id");--> statement-breakpoint
CREATE INDEX "orders_merchant_idx" ON "orders" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_attr_guide_idx" ON "orders" USING btree ("attr_guide_id");--> statement-breakpoint
CREATE INDEX "service_records_customer_merchant_at_idx" ON "service_records" USING btree ("customer_id","merchant_id","at");--> statement-breakpoint
CREATE INDEX "service_records_guide_idx" ON "service_records" USING btree ("guide_id");--> statement-breakpoint
CREATE INDEX "skus_spu_idx" ON "skus" USING btree ("spu_id");--> statement-breakpoint
CREATE INDEX "spus_merchant_idx" ON "spus" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "stores_merchant_idx" ON "stores" USING btree ("merchant_id");