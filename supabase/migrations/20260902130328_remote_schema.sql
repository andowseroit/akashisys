SET local check_function_bodies = off;

CREATE TABLE "public"."bank_deposits" (
  "id"              uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "session_date"    date                     NOT NULL,
  "driver_id"       uuid,
  "driver_name"     text,
  "expected_amount" numeric(10,2)            NOT NULL DEFAULT 0,
  "actual_amount"   numeric(10,2),
  "deposited"       boolean                  DEFAULT false,
  "deposited_at"    timestamp with time zone,
  "notes"           text,
  "created_at"      timestamp with time zone DEFAULT now(),
  CONSTRAINT "bank_deposits_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."corrections" (
  "id"           uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "table_name"   text                     NOT NULL,
  "record_id"    uuid,
  "action"       text                     NOT NULL,
  "old_values"   jsonb,
  "new_values"   jsonb,
  "corrected_by" text                     NOT NULL DEFAULT 'admin'::text,
  "reason"       text,
  "corrected_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "corrections_action_check" CHECK ((action = ANY (ARRAY['edit'::text, 'delete'::text, 'add'::text]))),
  CONSTRAINT "corrections_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."driver_accounts" (
  "id"           uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "full_name"    text                     NOT NULL,
  "email"        text                     NOT NULL,
  "phone"        text,
  "is_active"    boolean                  DEFAULT true,
  "auth_user_id" uuid,
  "created_at"   timestamp with time zone DEFAULT now(),
  "updated_at"   timestamp with time zone DEFAULT now(),
  CONSTRAINT "driver_accounts_email_key" UNIQUE (email),
  CONSTRAINT "driver_accounts_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."expenses" (
  "id"                uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "session_id"        uuid,
  "category"          text                     NOT NULL,
  "amount"            numeric(10,2)            NOT NULL,
  "description"       text,
  "receipt_photo_url" text,
  "spent_at"          timestamp with time zone DEFAULT now(),
  "synced"            boolean                  DEFAULT false,
  "local_id"          text,
  CONSTRAINT "expenses_category_check" CHECK ((category = ANY (ARRAY['fuel'::text, 'maintenance'::text, 'food'::text, 'other'::text]))),
  CONSTRAINT "expenses_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."outstanding_settlements" (
  "id"             uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "shop_id"        uuid,
  "settled_amount" numeric(10,2)            NOT NULL,
  "settled_by"     text                     NOT NULL DEFAULT 'admin'::text,
  "notes"          text,
  "settled_at"     timestamp with time zone DEFAULT now(),
  CONSTRAINT "outstanding_settlements_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."payments" (
  "id"           uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "session_id"   uuid,
  "shop_id"      uuid,
  "amount"       numeric(10,2)            NOT NULL,
  "payment_type" text,
  "notes"        text,
  "paid_at"      timestamp with time zone DEFAULT now(),
  "synced"       boolean                  DEFAULT false,
  "local_id"     text,
  CONSTRAINT "payments_payment_type_check" CHECK ((payment_type = ANY (ARRAY['full'::text, 'partial'::text, 'outstanding'::text]))),
  CONSTRAINT "payments_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."product_categories" (
  "id"         uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "name"       text                     NOT NULL,
  "is_active"  boolean                  DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "sort_order" integer                  DEFAULT 0,
  CONSTRAINT "product_categories_name_key" UNIQUE (name),
  CONSTRAINT "product_categories_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."products" (
  "id"             uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "name"           text                     NOT NULL,
  "size_kg"        numeric(5,2)             NOT NULL,
  "price_per_unit" numeric(10,2)            NOT NULL,
  "is_active"      boolean                  DEFAULT true,
  "created_at"     timestamp with time zone DEFAULT now(),
  "updated_at"     timestamp with time zone DEFAULT now(),
  "category_id"    uuid,
  CONSTRAINT "products_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."profiles" (
  "id"         uuid                     NOT NULL,
  "role"       text                     NOT NULL,
  "name"       text                     NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id),
  CONSTRAINT "profiles_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'driver'::text])))
);

CREATE TABLE "public"."returns" (
  "id"          uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "session_id"  uuid,
  "shop_id"     uuid,
  "product_id"  uuid,
  "quantity"    integer                  NOT NULL,
  "reason"      text,
  "unit_price"  numeric(10,2)            NOT NULL,
  "returned_at" timestamp with time zone DEFAULT now(),
  "synced"      boolean                  DEFAULT false,
  "local_id"    text,
  CONSTRAINT "returns_pkey" PRIMARY KEY (id),
  CONSTRAINT "returns_reason_check" CHECK ((reason = ANY (ARRAY['spoiled'::text, 'returned'::text, 'discarded'::text])))
);

CREATE TABLE "public"."route_sessions" (
  "id"           uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "driver_id"    uuid,
  "session_date" date                     NOT NULL,
  "status"       text                     DEFAULT 'active'::text,
  "notes"        text,
  "created_at"   timestamp with time zone DEFAULT now(),
  "completed_at" timestamp with time zone,
  "paused_at"    timestamp with time zone,
  "started_by"   text,
  "stopped_by"   text,
  "date"         text,
  "started_at"   timestamp with time zone,
  CONSTRAINT "route_sessions_driver_id_session_date_key" UNIQUE (driver_id, session_date),
  CONSTRAINT "route_sessions_pkey" PRIMARY KEY (id),
  CONSTRAINT "route_sessions_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'paused'::text, 'completed'::text])))
);

CREATE TABLE "public"."sales" (
  "id"         uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "session_id" uuid,
  "shop_id"    uuid,
  "product_id" uuid,
  "quantity"   integer                  NOT NULL,
  "unit_price" numeric(10,2)            NOT NULL,
  "sold_at"    timestamp with time zone DEFAULT now(),
  "synced"     boolean                  DEFAULT false,
  "local_id"   text,
  CONSTRAINT "sales_pkey" PRIMARY KEY (id),
  CONSTRAINT "sales_quantity_check" CHECK ((quantity > 0))
);

CREATE TABLE "public"."session_control" (
  "id"           uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "session_date" date                     NOT NULL,
  "status"       text                     NOT NULL DEFAULT 'pending'::text,
  "started_at"   timestamp with time zone,
  "paused_at"    timestamp with time zone,
  "completed_at" timestamp with time zone,
  "started_by"   text                     DEFAULT 'admin'::text,
  "notes"        text,
  "created_at"   timestamp with time zone DEFAULT now(),
  CONSTRAINT "session_control_date_unique" UNIQUE (session_date),
  CONSTRAINT "session_control_pkey" PRIMARY KEY (id),
  CONSTRAINT "session_control_session_date_key" UNIQUE (session_date),
  CONSTRAINT "session_control_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'paused'::text, 'completed'::text])))
);

CREATE TABLE "public"."shops" (
  "id"             uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "name"           text                     NOT NULL,
  "owner_name"     text,
  "phone"          text,
  "address"        text,
  "route_order"    integer,
  "is_active"      boolean                  DEFAULT true,
  "created_at"     timestamp with time zone DEFAULT now(),
  "email"          text,
  "notes"          text,
  "credit_limit"   numeric(10,2)            DEFAULT 0,
  "session_active" boolean                  DEFAULT true,
  CONSTRAINT "shops_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."truck_loads" (
  "id"                uuid                     NOT NULL DEFAULT extensions.uuid_generate_v4(),
  "session_date"      date                     NOT NULL,
  "product_id"        uuid                     NOT NULL,
  "quantity_loaded"   integer                  NOT NULL DEFAULT 0,
  "quantity_returned" integer                  DEFAULT 0,
  "notes"             text,
  "created_at"        timestamp with time zone DEFAULT now(),
  "updated_at"        timestamp with time zone DEFAULT now(),
  CONSTRAINT "truck_loads_pkey" PRIMARY KEY (id),
  CONSTRAINT "truck_loads_session_date_product_id_key" UNIQUE (session_date, product_id)
);

CREATE TABLE "public"."users" (
  "id"    uuid NOT NULL DEFAULT gen_random_uuid(),
  "email" text,
  "role"  text NOT NULL,
  "pin"   text,
  CONSTRAINT "users_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."returns"
  ADD COLUMN "total_loss" numeric(10,2) GENERATED ALWAYS AS (((quantity)::numeric * unit_price)) STORED;

ALTER TABLE "public"."sales"
  ADD COLUMN "total_amount" numeric GENERATED ALWAYS AS (((quantity)::numeric * unit_price)) STORED;

CREATE OR REPLACE FUNCTION public.enforce_credit_limit_on_payment()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_credit_limit numeric;
  v_current_balance numeric;
  v_new_debt numeric;
  v_projected_balance numeric;
BEGIN
  -- Only enforce for payments that create or increase debt
  -- (outstanding or partial payment types)
  IF NEW.payment_type NOT IN ('outstanding', 'partial') THEN
    RETURN NEW;
  END IF;

  -- Get the shop's credit limit
  SELECT COALESCE(credit_limit, 0) INTO v_credit_limit
  FROM shops
  WHERE id = NEW.shop_id;

  -- If no credit limit is set (0 or NULL), skip enforcement
  IF v_credit_limit <= 0 THEN
    RETURN NEW;
  END IF;

  -- Calculate current outstanding balance from the database
  -- by summing all sales, payments, and returns for this shop
  WITH sales_total AS (
    SELECT COALESCE(SUM(COALESCE(total_amount, quantity * unit_price)), 0) AS total
    FROM sales
    WHERE shop_id = NEW.shop_id
  ),
  payments_total AS (
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM payments
    WHERE shop_id = NEW.shop_id
  ),
  returns_total AS (
    SELECT COALESCE(SUM(quantity * unit_price), 0) AS total
    FROM returns
    WHERE shop_id = NEW.shop_id
  )
  SELECT
    GREATEST(sales_total.total - payments_total.total - returns_total.total, 0)
    INTO v_current_balance
  FROM sales_total, payments_total, returns_total;

  -- Calculate the new debt this payment would add
  v_new_debt := GREATEST(NEW.amount, 0);

  -- Projected balance after this transaction
  v_projected_balance := v_current_balance + v_new_debt;

  -- Block if projected balance exceeds credit limit
  IF v_projected_balance > v_credit_limit THEN
    RAISE EXCEPTION 'CREDIT_LIMIT_EXCEEDED: Shop credit limit is LKR %. Current balance is LKR %. This transaction would bring it to LKR %, exceeding the limit by LKR %.',
      v_credit_limit,
      v_current_balance,
      v_projected_balance,
      v_projected_balance - v_credit_limit;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

ALTER TABLE "public"."driver_accounts"
  ADD CONSTRAINT "driver_accounts_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."bank_deposits"
  ADD CONSTRAINT "bank_deposits_driver_id_fkey" FOREIGN KEY (driver_id) REFERENCES public.driver_accounts(id);

ALTER TABLE "public"."products"
  ADD CONSTRAINT "fk_product_category" FOREIGN KEY (category_id) REFERENCES public.product_categories(id);

ALTER TABLE "public"."products"
  ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.product_categories(id) ON DELETE CASCADE;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id);

ALTER TABLE "public"."returns"
  ADD CONSTRAINT "returns_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id);

ALTER TABLE "public"."route_sessions"
  ADD CONSTRAINT "route_sessions_driver_id_fkey" FOREIGN KEY (driver_id) REFERENCES public.profiles(id);

ALTER TABLE "public"."expenses"
  ADD CONSTRAINT "expenses_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.route_sessions(id) ON DELETE CASCADE;

ALTER TABLE "public"."payments"
  ADD CONSTRAINT "payments_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.route_sessions(id) ON DELETE CASCADE;

ALTER TABLE "public"."returns"
  ADD CONSTRAINT "returns_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.route_sessions(id) ON DELETE CASCADE;

ALTER TABLE "public"."sales"
  ADD CONSTRAINT "sales_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id);

ALTER TABLE "public"."sales"
  ADD CONSTRAINT "sales_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.route_sessions(id) ON DELETE CASCADE;

ALTER TABLE "public"."outstanding_settlements"
  ADD CONSTRAINT "outstanding_settlements_shop_id_fkey" FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE CASCADE;

ALTER TABLE "public"."payments"
  ADD CONSTRAINT "payments_shop_id_fkey" FOREIGN KEY (shop_id) REFERENCES public.shops(id);

ALTER TABLE "public"."returns"
  ADD CONSTRAINT "returns_shop_id_fkey" FOREIGN KEY (shop_id) REFERENCES public.shops(id);

ALTER TABLE "public"."sales"
  ADD CONSTRAINT "sales_shop_id_fkey" FOREIGN KEY (shop_id) REFERENCES public.shops(id);

ALTER TABLE "public"."truck_loads"
  ADD CONSTRAINT "truck_loads_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id);

CREATE VIEW "public"."daily_analytics" AS  WITH date_series AS (
         SELECT DISTINCT date(sales.sold_at) AS day
           FROM public.sales
        ), daily_sales AS (
         SELECT date(sales.sold_at) AS day,
            sum(sales.total_amount) AS revenue,
            count(*) AS transaction_count,
            count(DISTINCT sales.shop_id) AS shops_served,
            sum(sales.quantity) AS units_sold
           FROM public.sales
          GROUP BY (date(sales.sold_at))
        ), daily_payments AS (
         SELECT date(payments.paid_at) AS day,
            sum(payments.amount) AS collected
           FROM public.payments
          GROUP BY (date(payments.paid_at))
        ), daily_expenses AS (
         SELECT date(expenses.spent_at) AS day,
            sum(expenses.amount) AS expenses
           FROM public.expenses
          GROUP BY (date(expenses.spent_at))
        ), daily_returns AS (
         SELECT date(returns.returned_at) AS day,
            sum(returns.total_loss) AS return_loss
           FROM public.returns
          GROUP BY (date(returns.returned_at))
        )
 SELECT d.day,
    COALESCE(ds.revenue, (0)::numeric) AS revenue,
    COALESCE(dp.collected, (0)::numeric) AS collected,
    COALESCE(de.expenses, (0)::numeric) AS expenses,
    COALESCE(dr.return_loss, (0)::numeric) AS return_loss,
    (COALESCE(ds.revenue, (0)::numeric) - COALESCE(dp.collected, (0)::numeric)) AS outstanding_created,
    (COALESCE(dp.collected, (0)::numeric) - COALESCE(de.expenses, (0)::numeric)) AS net_deposit,
    COALESCE(ds.transaction_count, (0)::bigint) AS transaction_count,
    COALESCE(ds.shops_served, (0)::bigint) AS shops_served,
    COALESCE(ds.units_sold, (0)::bigint) AS units_sold
   FROM ((((date_series d
     LEFT JOIN daily_sales ds ON ((ds.day = d.day)))
     LEFT JOIN daily_payments dp ON ((dp.day = d.day)))
     LEFT JOIN daily_expenses de ON ((de.day = d.day)))
     LEFT JOIN daily_returns dr ON ((dr.day = d.day)))
  ORDER BY d.day DESC;

CREATE VIEW "public"."outstanding_balances" AS  WITH sales_totals AS (
         SELECT sales.shop_id,
            sum(sales.total_amount) AS total_sold,
            count(*) AS total_transactions,
            max(sales.sold_at) AS last_sale_at
           FROM public.sales
          GROUP BY sales.shop_id
        ), payment_totals AS (
         SELECT payments.shop_id,
            sum(payments.amount) AS total_paid,
            max(payments.paid_at) AS last_payment_at
           FROM public.payments
          GROUP BY payments.shop_id
        )
 SELECT s.id AS shop_id,
    s.name AS shop_name,
    s.owner_name,
    s.phone,
    s.address,
    s.credit_limit,
    COALESCE(st.total_sold, (0)::numeric) AS total_sold,
    COALESCE(pt.total_paid, (0)::numeric) AS total_paid,
    (COALESCE(st.total_sold, (0)::numeric) - COALESCE(pt.total_paid, (0)::numeric)) AS outstanding_amount,
    COALESCE(st.total_transactions, (0)::bigint) AS total_transactions,
    st.last_sale_at,
    pt.last_payment_at
   FROM ((public.shops s
     LEFT JOIN sales_totals st ON ((st.shop_id = s.id)))
     LEFT JOIN payment_totals pt ON ((pt.shop_id = s.id)))
  WHERE (s.is_active = true);

CREATE VIEW "public"."shop_outstanding_by_date" AS  WITH daily_sales AS (
         SELECT sales.shop_id,
            date(sales.sold_at) AS sale_date,
            sum(sales.total_amount) AS sold_amount
           FROM public.sales
          GROUP BY sales.shop_id, (date(sales.sold_at))
        ), total_paid AS (
         SELECT payments.shop_id,
            sum(payments.amount) AS total_paid
           FROM public.payments
          GROUP BY payments.shop_id
        ), ranked_sales AS (
         SELECT ds.shop_id,
            ds.sale_date,
            ds.sold_amount,
            COALESCE(sum(ds2.sold_amount), (0)::numeric) AS cumulative_before
           FROM (daily_sales ds
             LEFT JOIN daily_sales ds2 ON (((ds2.shop_id = ds.shop_id) AND (ds2.sale_date < ds.sale_date))))
          GROUP BY ds.shop_id, ds.sale_date, ds.sold_amount
        )
 SELECT rs.shop_id,
    sh.name AS shop_name,
    rs.sale_date,
    rs.sold_amount,
    COALESCE(tp.total_paid, (0)::numeric) AS total_paid_overall,
    GREATEST((0)::numeric, (rs.sold_amount - GREATEST((0)::numeric, (COALESCE(tp.total_paid, (0)::numeric) - rs.cumulative_before)))) AS outstanding_for_date
   FROM ((ranked_sales rs
     JOIN public.shops sh ON ((sh.id = rs.shop_id)))
     LEFT JOIN total_paid tp ON ((tp.shop_id = rs.shop_id)))
  WHERE (GREATEST((0)::numeric, (rs.sold_amount - GREATEST((0)::numeric, (COALESCE(tp.total_paid, (0)::numeric) - rs.cumulative_before)))) > (0)::numeric)
  ORDER BY rs.shop_id, rs.sale_date;

CREATE INDEX idx_bank_deposits_date ON public.bank_deposits USING btree (session_date);

CREATE INDEX idx_corrections_date ON public.corrections USING btree (corrected_at);

CREATE INDEX idx_expenses_session ON public.expenses USING btree (session_id);

CREATE INDEX idx_payments_session ON public.payments USING btree (session_id);

CREATE INDEX idx_payments_shop ON public.payments USING btree (shop_id);

CREATE INDEX idx_returns_session ON public.returns USING btree (session_id);

CREATE INDEX idx_route_sessions_date ON public.route_sessions USING btree (session_date);

CREATE INDEX idx_sales_session ON public.sales USING btree (session_id);

CREATE INDEX idx_sales_shop ON public.sales USING btree (shop_id);

CREATE INDEX idx_sales_sold_at ON public.sales USING btree (sold_at);

CREATE INDEX idx_session_control_date ON public.session_control USING btree (session_date);

CREATE INDEX idx_settlements_date ON public.outstanding_settlements USING btree (settled_at);

CREATE INDEX idx_settlements_shop ON public.outstanding_settlements USING btree (shop_id);

CREATE INDEX idx_truck_loads_date ON public.truck_loads USING btree (session_date);

CREATE TRIGGER trg_enforce_credit_limit
  BEFORE INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_credit_limit_on_payment();

CREATE POLICY "Admins have full access to expenses" ON "public"."expenses"
  FOR ALL
  TO PUBLIC
  USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text));

CREATE POLICY "Admins have full access to payments" ON "public"."payments"
  FOR ALL
  TO PUBLIC
  USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text));

CREATE POLICY "Admins have full access to profiles" ON "public"."profiles"
  FOR ALL
  TO PUBLIC
  USING ((( SELECT profiles_1.role
   FROM public.profiles profiles_1
  WHERE (profiles_1.id = auth.uid())) = 'admin'::text));

CREATE POLICY "Admins have full access to returns" ON "public"."returns"
  FOR ALL
  TO PUBLIC
  USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text));

CREATE POLICY "Drivers can view own sessions" ON "public"."route_sessions"
  FOR SELECT
  TO PUBLIC
  USING (((driver_id = auth.uid()) OR (( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE POLICY "Admins have full access to sales" ON "public"."sales"
  FOR ALL
  TO PUBLIC
  USING ((( SELECT profiles.role
   FROM public.profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text));

CREATE POLICY "Drivers can insert own sales" ON "public"."sales"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((session_id IN ( SELECT route_sessions.id
   FROM public.route_sessions
  WHERE (route_sessions.driver_id = auth.uid()))));

CREATE POLICY "Drivers can view own sales" ON "public"."sales"
  FOR SELECT
  TO PUBLIC
  USING ((session_id IN ( SELECT route_sessions.id
   FROM public.route_sessions
  WHERE ((route_sessions.driver_id = auth.uid()) OR (( SELECT profiles.role
           FROM public.profiles
          WHERE (profiles.id = auth.uid())) = 'admin'::text)))));

CREATE POLICY "anon_select_by_pin_dev" ON "public"."users"
  FOR SELECT
  TO "anon"
  USING (((ROLE = 'driver'::text) AND (((current_setting('request.jwt.claims.pin'::text, true) IS
    NOT NULL) AND (pin = current_setting('request.jwt.claims.pin'::text, true))) OR ((current_setting('request.jwt.claims.pin'::text, true) IS NULL) AND (pin = '1234'::text)))));

CREATE POLICY "anon_select_by_pin" ON "public"."users"
  FOR SELECT
  TO "anon"
  USING (((ROLE = 'driver'::text) AND (pin = current_setting('request.jwt.claims.pin'::text, true))));

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

GRANT EXECUTE ON FUNCTION "public"."enforce_credit_limit_on_payment"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO PUBLIC, "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."bank_deposits" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."corrections" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."driver_accounts" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."expenses" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."outstanding_settlements" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payments" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."product_categories" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."products" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."returns" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."route_sessions" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sales" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."session_control" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."shops" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."truck_loads" TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON TABLE "public"."users" FROM "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."users" TO "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."daily_analytics" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."outstanding_balances" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."shop_outstanding_by_date" TO "anon", "authenticated", "postgres", "service_role";

