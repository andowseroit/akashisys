BEGIN;

ALTER VIEW public.outstanding_balances
SET (security_invoker = true);

ALTER VIEW public.daily_analytics
SET (security_invoker = true);

CREATE OR REPLACE VIEW public.outstanding_balances
WITH (security_invoker = true)
AS
WITH sales_totals AS (
  SELECT
    sales.shop_id,
    sum(sales.total_amount) AS total_sold,
    count(*) AS total_transactions,
    max(sales.sold_at) AS last_sale_at
  FROM public.sales
  GROUP BY sales.shop_id
),
payment_totals AS (
  SELECT
    payments.shop_id,
    sum(payments.amount) AS total_paid,
    max(payments.paid_at) AS last_payment_at
  FROM public.payments
  GROUP BY payments.shop_id
)
SELECT
  s.id AS shop_id,
  s.name AS shop_name,
  s.owner_name,
  s.phone,
  s.address,
  s.credit_limit,
  COALESCE(st.total_sold, 0::numeric) AS total_sold,
  COALESCE(pt.total_paid, 0::numeric) AS total_paid,
  (
    COALESCE(st.total_sold, 0::numeric)
    - COALESCE(pt.total_paid, 0::numeric)
  ) AS outstanding_amount,
  COALESCE(st.total_transactions, 0::bigint) AS total_transactions,
  st.last_sale_at,
  pt.last_payment_at
FROM public.shops s
LEFT JOIN sales_totals st ON st.shop_id = s.id
LEFT JOIN payment_totals pt ON pt.shop_id = s.id
WHERE s.is_active = true
  AND (select private.is_admin());

CREATE OR REPLACE VIEW public.daily_analytics
WITH (security_invoker = true)
AS
WITH date_series AS (
  SELECT DISTINCT date(sales.sold_at) AS day
  FROM public.sales
),
daily_sales AS (
  SELECT
    date(sales.sold_at) AS day,
    sum(sales.total_amount) AS revenue,
    count(*) AS transaction_count,
    count(DISTINCT sales.shop_id) AS shops_served,
    sum(sales.quantity) AS units_sold
  FROM public.sales
  GROUP BY date(sales.sold_at)
),
daily_payments AS (
  SELECT
    date(payments.paid_at) AS day,
    sum(payments.amount) AS collected
  FROM public.payments
  GROUP BY date(payments.paid_at)
),
daily_expenses AS (
  SELECT
    date(expenses.spent_at) AS day,
    sum(expenses.amount) AS expenses
  FROM public.expenses
  GROUP BY date(expenses.spent_at)
),
daily_returns AS (
  SELECT
    date(returns.returned_at) AS day,
    sum(returns.total_loss) AS return_loss
  FROM public.returns
  GROUP BY date(returns.returned_at)
)
SELECT
  d.day,
  COALESCE(ds.revenue, 0::numeric) AS revenue,
  COALESCE(dp.collected, 0::numeric) AS collected,
  COALESCE(de.expenses, 0::numeric) AS expenses,
  COALESCE(dr.return_loss, 0::numeric) AS return_loss,
  (
    COALESCE(ds.revenue, 0::numeric)
    - COALESCE(dp.collected, 0::numeric)
  ) AS outstanding_created,
  (
    COALESCE(dp.collected, 0::numeric)
    - COALESCE(de.expenses, 0::numeric)
  ) AS net_deposit,
  COALESCE(ds.transaction_count, 0::bigint) AS transaction_count,
  COALESCE(ds.shops_served, 0::bigint) AS shops_served,
  COALESCE(ds.units_sold, 0::bigint) AS units_sold
FROM date_series d
LEFT JOIN daily_sales ds ON ds.day = d.day
LEFT JOIN daily_payments dp ON dp.day = d.day
LEFT JOIN daily_expenses de ON de.day = d.day
LEFT JOIN daily_returns dr ON dr.day = d.day
WHERE (select private.is_admin())
ORDER BY d.day DESC;

GRANT SELECT ON public.outstanding_balances TO authenticated;
GRANT SELECT ON public.daily_analytics TO authenticated;

COMMIT;