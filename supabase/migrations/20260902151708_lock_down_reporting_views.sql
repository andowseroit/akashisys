BEGIN;

-- Reporting views contain business-wide financial information.
-- They should not be directly accessible through the client API.
REVOKE ALL ON TABLE
  public.daily_analytics,
  public.outstanding_balances,
  public.shop_outstanding_by_date
FROM anon, authenticated;

COMMIT;