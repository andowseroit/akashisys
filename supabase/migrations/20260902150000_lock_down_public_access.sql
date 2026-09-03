-- AkashiSys security hardening: establish the RLS boundary.
--
-- This migration intentionally does NOT yet define the final driver/admin
-- business policies. It first removes anonymous table/view access and
-- enables RLS so that subsequent policies become the security boundary.

BEGIN;

-- ============================================================
-- 1. Enable RLS on every public application table
-- ============================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outstanding_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.truck_loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_deposits ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Remove anonymous access to application tables
-- ============================================================

REVOKE ALL ON TABLE
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
FROM anon;

-- ============================================================
-- 3. Remove anonymous access to reporting views
-- ============================================================

REVOKE ALL ON TABLE
  public.daily_analytics,
  public.outstanding_balances,
  public.shop_outstanding_by_date
FROM anon;

COMMIT;