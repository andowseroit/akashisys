BEGIN;

-- Remove privileges that authenticated users should never need.
-- RLS does not protect TRUNCATE, so this is especially important.
REVOKE TRUNCATE, TRIGGER, REFERENCES
ON TABLE
  public.users,
  public.profiles,
  public.products,
  public.product_categories,
  public.shops,
  public.sales,
  public.payments,
  public.returns,
  public.expenses,
  public.route_sessions,
  public.outstanding_settlements,
  public.corrections,
  public.session_control,
  public.truck_loads,
  public.driver_accounts,
  public.bank_deposits
FROM authenticated;

COMMIT;