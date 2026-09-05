import { useState, useEffect } from "react";
import { supabase } from "../db/supabase";
import { useLang } from "../i18n/LanguageContext";

const COLOMBO_TZ = "Asia/Colombo";
function businessDate(offsetDays = 0) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: COLOMBO_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const y = Number(parts.find(p => p.type === "year")?.value);
  const m = Number(parts.find(p => p.type === "month")?.value);
  const d = Number(parts.find(p => p.type === "day")?.value);
  const date = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return date.toISOString().slice(0, 10);
}

export default function AdminDashboard() {
  const { t } = useLang();
  const [todayStats, setTodayStats] = useState({ revenue: 0, collected: 0, outstanding: 0, expenses: 0, netDeposit: 0, shopsServed: 0, unitsLoaded: 0, unitsSold: 0, unitsReturned: 0 });
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<any[]>([]);
  const [outstandingShops, setOutstandingShops] = useState<any[]>([]);
  const [depositInfo, setDepositInfo] = useState<any>(null);
  const [sessionStatus, setSessionStatus] = useState("pending");
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState<"today" | "week" | "month">("today");

  const today = businessDate();
  useEffect(() => { loadDashboard(); }, [dateRange]);

  async function loadDashboard() {
    setIsLoading(true);
    try {
      const rangeStart = businessDate(dateRange === "today" ? 0 : dateRange === "week" ? -6 : -29);
      const rangeEnd = businessDate(1);
      const [{ data: sales, error: salesError }, { data: payments, error: paymentsError }, { data: expenses, error: expensesError }, { data: returns, error: returnsError }, { data: balances, error: balancesError }, { data: sessions, error: sessionsError }] = await Promise.all([
        supabase.from("sales").select("total_amount, quantity, shop_id, product_id, sold_at, session_id").gte("sold_at", `${rangeStart}T00:00:00+05:30`).lt("sold_at", `${rangeEnd}T00:00:00+05:30`),
        supabase.from("payments").select("amount, paid_at, session_id").gte("paid_at", `${rangeStart}T00:00:00+05:30`).lt("paid_at", `${rangeEnd}T00:00:00+05:30`),
        supabase.from("expenses").select("amount, spent_at, session_id").gte("spent_at", `${rangeStart}T00:00:00+05:30`).lt("spent_at", `${rangeEnd}T00:00:00+05:30`),
        supabase.from("returns").select("quantity, total_loss, product_id, returned_at, session_id").gte("returned_at", `${rangeStart}T00:00:00+05:30`).lt("returned_at", `${rangeEnd}T00:00:00+05:30`),
        supabase.from("outstanding_balances").select("shop_name, outstanding_amount").gt("outstanding_amount", 0).order("outstanding_amount", { ascending: false }).limit(5),
        supabase.from("route_sessions").select("id, status, driver_id, session_date, started_at").eq("session_date", today).order("started_at", { ascending: false })
      ]);
      const firstError = [salesError, paymentsError, expensesError, returnsError, balancesError, sessionsError].find(Boolean);
      if (firstError) throw firstError;

      const sessionIds = (sessions || []).map(s => s.id);
      const { data: truckLoad, error: truckError } = sessionIds.length
        ? await supabase.from("truck_loads").select("quantity_loaded, quantity_returned, product_id, session_id, products(name, category_id)").in("session_id", sessionIds)
        : { data: [], error: null };
      if (truckError) throw truckError;

      const revenue = (sales || []).reduce((s, r) => s + Number(r.total_amount || 0), 0);
      const collected = (payments || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      const totalExpenses = (expenses || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      const unitsLoaded = (truckLoad || []).reduce((s, r) => s + Number(r.quantity_loaded || 0), 0);
      const unitsSold = (sales || []).reduce((s, r) => s + Number(r.quantity || 0), 0);
      const unitsReturned = (returns || []).reduce((s, r) => s + Number(r.quantity || 0), 0);
      const uniqueShops = new Set((sales || []).map(s => s.shop_id)).size;
      const totalOutstanding = (balances || []).reduce((s, r) => s + Number(r.outstanding_amount || 0), 0);
      setTodayStats({ revenue, collected, outstanding: totalOutstanding, expenses: totalExpenses, netDeposit: collected - totalExpenses, shopsServed: uniqueShops, unitsLoaded, unitsSold, unitsReturned });
      setSessionStatus(sessions?.[0]?.status || "pending");
      setOutstandingShops(balances || []);
      setDepositInfo({ driverName: "Driver", amount: collected - totalExpenses, collected, expenses: totalExpenses });

      const productIds = [...new Set((sales || []).map(s => s.product_id).filter(Boolean))];
      const { data: prods, error: productError } = productIds.length ? await supabase.from("products").select("id, name, category_id, product_categories(name)").in("id", productIds) : { data: [], error: null };
      if (productError) throw productError;
      const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
      (sales || []).forEach(s => { if (!productMap[s.product_id]) productMap[s.product_id] = { name: s.product_id, qty: 0, revenue: 0 }; productMap[s.product_id].qty += Number(s.quantity || 0); productMap[s.product_id].revenue += Number(s.total_amount || 0); });
      (prods || []).forEach(p => { if (productMap[p.id]) productMap[p.id].name = p.name; });
      setTopProducts(Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 6));

      const { data: weekly, error: weeklyError } = await supabase.from("daily_analytics").select("*").gte("day", rangeStart).lte("day", today).order("day", { ascending: true });
      if (weeklyError) throw weeklyError;
      setWeeklyData(weekly || []);

      const catMap: Record<string, { loaded: number; sold: number; returned: number }> = {};
      (truckLoad || []).forEach(tl => {
        const product = (prods || []).find(p => p.id === tl.product_id);
        const category = (product as any)?.product_categories?.name || "Uncategorized";
        if (!catMap[category]) catMap[category] = { loaded: 0, sold: 0, returned: 0 };
        catMap[category].loaded += Number(tl.quantity_loaded || 0);
        catMap[category].returned += Number(tl.quantity_returned || 0);
        catMap[category].sold += (sales || []).filter(s => s.product_id === tl.product_id && s.session_id === tl.session_id).reduce((n, s) => n + Number(s.quantity || 0), 0);
      });
      setCategoryBreakdown(Object.entries(catMap).map(([name, vals]) => ({ name, ...vals })));
    } catch (err) { console.error("Dashboard load error:", err); }
    finally { setIsLoading(false); }
  }

  const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = { pending: { label: "Not Started", bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" }, active: { label: "Active", bg: "bg-green-100", text: "text-green-700", dot: "bg-green-500" }, paused: { label: "Paused", bg: "bg-yellow-100", text: "text-yellow-700", dot: "bg-yellow-400" }, completed: { label: "Completed", bg: "bg-blue-100", text: "text-blue-700", dot: "bg-blue-500" } };
  const sc = statusConfig[sessionStatus] || statusConfig.pending;
  const maxRevenue = Math.max(...weeklyData.map(d => Number(d.revenue || 0)), 1);
  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-400 text-sm">{t("common_loading")}</p></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 shadow-sm"><div className="flex items-center justify-between flex-wrap gap-3"><div><h1 className="text-2xl font-bold text-gray-900">{t("dashboard_title")}</h1><p className="text-sm text-gray-500">{new Date().toLocaleDateString("en-US", { timeZone: COLOMBO_TZ, dateStyle: "full" })}</p></div><div className="flex items-center gap-3"><div className="flex gap-1 bg-gray-100 p-1 rounded-xl">{(["today", "week", "month"] as const).map(r => <button key={r} onClick={() => setDateRange(r)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${dateRange === r ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>{t(`dashboard_${r}`)}</button>)}</div><div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${sc.bg}`}><span className={`w-2 h-2 rounded-full ${sc.dot}`} /><span className={`text-xs font-semibold ${sc.text}`}>{sc.label}</span></div></div></div></div>
      <div className="px-6 py-5 max-w-7xl mx-auto space-y-5">
        {depositInfo && depositInfo.amount > 0 && <div className="bg-gray-900 text-white rounded-2xl px-6 py-4 flex items-center justify-between flex-wrap gap-3"><div><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{t("dashboard_deposit_required")}</p><p className="font-bold">{depositInfo.driverName} {t("dashboard_deposit_banner")} — <span className="text-green-400">LKR {depositInfo.amount.toFixed(2)}</span></p></div><div className="flex gap-4 text-sm"><div><p className="text-gray-400 text-xs">{t("dashboard_collected_label")}</p><p className="font-bold">LKR {depositInfo.collected.toFixed(2)}</p></div><div><p className="text-gray-400 text-xs">{t("dashboard_expenses_label")}</p><p className="font-bold">− LKR {depositInfo.expenses.toFixed(2)}</p></div></div></div>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[{ label: t("dashboard_revenue"), value: `LKR ${todayStats.revenue.toFixed(2)}`, sub: `${todayStats.shopsServed} ${t("dashboard_shops_served")}` }, { label: t("dashboard_collected"), value: `LKR ${todayStats.collected.toFixed(2)}`, sub: `LKR ${todayStats.outstanding.toFixed(2)} ${t("dashboard_outstanding_label")}` }, { label: t("dashboard_net_deposit"), value: `LKR ${todayStats.netDeposit.toFixed(2)}`, sub: `${t("dashboard_expenses_label")}: LKR ${todayStats.expenses.toFixed(2)}` }, { label: t("dashboard_units_sold"), value: String(todayStats.unitsSold), sub: `${todayStats.unitsLoaded} ${t("dashboard_loaded")} · ${todayStats.unitsReturned} ${t("dashboard_returned")}` }].map(card => <div key={card.label} className="rounded-2xl border p-5 bg-white"><p className="text-xs text-gray-500 font-medium mb-2">{card.label}</p><p className="text-xl font-bold text-gray-900">{card.value}</p><p className="text-xs text-gray-400 mt-1">{card.sub}</p></div>)}</div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4"><div className="lg:col-span-2 bg-white rounded-2xl border p-5"><div className="flex items-center justify-between mb-4"><h2 className="font-semibold text-gray-900">{t("dashboard_revenue_trend")}</h2><span className="text-xs text-gray-400">{t("dashboard_last_7_days")}</span></div>{weeklyData.length === 0 ? <div className="h-32 flex items-center justify-center text-gray-400 text-sm">{t("dashboard_no_data")}</div> : <div className="flex items-end gap-2 h-36">{weeklyData.map((day, i) => { const height = Math.max(4, (Number(day.revenue || 0) / maxRevenue) * 100); return <div key={i} className="flex-1 flex flex-col items-center gap-1"><span className="text-xs text-gray-400" style={{ fontSize: "9px" }}>{day.revenue > 0 ? `${(day.revenue / 1000).toFixed(1)}k` : ""}</span><div className={`w-full rounded-t-lg ${day.day === today ? "bg-gray-900" : "bg-gray-200"}`} style={{ height: `${height}%` }} /><span className="text-xs text-gray-400" style={{ fontSize: "9px" }}>{new Date(`${day.day}T00:00:00+05:30`).toLocaleDateString("en-US", { weekday: "short", timeZone: COLOMBO_TZ })}</span></div> })}</div>}</div><div className="bg-white rounded-2xl border p-5"><h2 className="font-semibold text-gray-900 mb-4">Stock by Category</h2>{categoryBreakdown.length === 0 ? <p className="text-sm text-gray-400">{t("dashboard_no_data")}</p> : categoryBreakdown.map(c => <div key={c.name} className="mb-4"><div className="flex justify-between text-sm"><span className="font-medium">{c.name}</span><span className="text-gray-500">{c.loaded - c.sold - c.returned} remaining</span></div><div className="text-xs text-gray-400 mt-1">Loaded {c.loaded} · Sold {c.sold} · Returned {c.returned}</div></div>)}</div></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4"><div className="bg-white rounded-2xl border p-5"><h2 className="font-semibold mb-4">{t("dashboard_top_products")}</h2>{topProducts.map(p => <div key={p.name} className="flex justify-between py-2 border-b last:border-0"><span>{p.name}</span><span className="font-semibold">LKR {p.revenue.toFixed(2)}</span></div>)}</div><div className="bg-white rounded-2xl border p-5"><h2 className="font-semibold mb-4">{t("dashboard_outstanding_balances")}</h2>{outstandingShops.length === 0 ? <p className="text-sm text-gray-400">{t("dashboard_no_data")}</p> : outstandingShops.map((s, i) => <div key={i} className="flex justify-between py-2 border-b last:border-0"><span>{s.shop_name}</span><span className="font-semibold">LKR {Number(s.outstanding_amount).toFixed(2)}</span></div>)}</div></div>
      </div>
    </div>
  );
}
