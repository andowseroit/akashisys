import { useState, useEffect } from "react";
import { supabase } from "../db/supabase";
import { useLang } from "../i18n/LanguageContext";

export default function AdminDashboard() {
  const { t } = useLang();
  const [todayStats, setTodayStats] = useState({
    revenue: 0, collected: 0, outstanding: 0,
    expenses: 0, netDeposit: 0, shopsServed: 0,
    unitsLoaded: 0, unitsSold: 0, unitsReturned: 0,
  });
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<any[]>([]);
  const [outstandingShops, setOutstandingShops] = useState<any[]>([]);
  const [depositInfo, setDepositInfo] = useState<any>(null);
  const [sessionStatus, setSessionStatus] = useState<string>("pending");
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState<"today" | "week" | "month">("today");

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => { loadDashboard(); }, [dateRange]);

  async function loadDashboard() {
    setIsLoading(true);
    try {
      const rangeStart = dateRange === "today" ? today
        : dateRange === "week"
          ? new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0]
          : new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

      const [
        { data: sales },
        { data: payments },
        { data: expenses },
        { data: returns },
        { data: balances },
        { data: sessionCtrl },
        { data: truckLoad },
        { data: drivers },
      ] = await Promise.all([
        supabase.from("sales").select("total_amount, quantity, shop_id, product_id, sold_at").gte("sold_at", rangeStart),
        supabase.from("payments").select("amount, paid_at").gte("paid_at", rangeStart),
        supabase.from("expenses").select("amount").gte("spent_at", rangeStart),
        supabase.from("returns").select("quantity, total_loss, product_id").gte("returned_at", rangeStart),
        supabase.from("outstanding_balances").select("shop_name, outstanding_amount").gt("outstanding_amount", 0).order("outstanding_amount", { ascending: false }).limit(5),
        supabase.from("session_control").select("status, started_at").eq("session_date", today).maybeSingle(),
        supabase.from("truck_loads").select("quantity_loaded, quantity_returned, product_id, products(name, price_per_unit)").eq("session_date", today),
        supabase.from("driver_accounts").select("full_name").eq("is_active", true).limit(1),
      ]);

      const revenue = sales?.reduce((s, r) => s + (r.total_amount || 0), 0) || 0;
      const collected = payments?.reduce((s, r) => s + (r.amount || 0), 0) || 0;
      const totalExpenses = expenses?.reduce((s, r) => s + (r.amount || 0), 0) || 0;
      const netDeposit = collected - totalExpenses;
      const unitsLoaded = truckLoad?.reduce((s, r) => s + (r.quantity_loaded || 0), 0) || 0;
      const unitsSold = sales?.reduce((s, r) => s + (r.quantity || 0), 0) || 0;
      const unitsReturned = returns?.reduce((s, r) => s + (r.quantity || 0), 0) || 0;
      const uniqueShops = new Set(sales?.map(s => s.shop_id) || []).size;
      const totalOutstanding = balances?.reduce((s, r) => s + (r.outstanding_amount || 0), 0) || 0;

      setTodayStats({
        revenue, collected, outstanding: totalOutstanding,
        expenses: totalExpenses, netDeposit,
        shopsServed: uniqueShops, unitsLoaded, unitsSold, unitsReturned,
      });

      setSessionStatus(sessionCtrl?.status || "pending");
      setOutstandingShops(balances || []);

      // Deposit info
      const driverName = drivers?.[0]?.full_name || "Driver";
      setDepositInfo({ driverName, amount: netDeposit, collected, expenses: totalExpenses });

      // Top products
      const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
      sales?.forEach(s => {
        const key = s.product_id;
        if (!productMap[key]) productMap[key] = { name: key, qty: 0, revenue: 0 };
        productMap[key].qty += s.quantity || 0;
        productMap[key].revenue += s.total_amount || 0;
      });

      // Get product names
      const productIds = Object.keys(productMap);
      if (productIds.length > 0) {
        const { data: prods } = await supabase
          .from("products")
          .select("id, name, product_categories!products_category_id_fkey(name)")
          .in("id", productIds);
        prods?.forEach(p => {
          if (productMap[p.id]) {
            productMap[p.id].name = p.name;
          }
        });
      }

      const sortedProducts = Object.values(productMap)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 6);
      setTopProducts(sortedProducts);

      // Weekly trend (last 7 days)
      const { data: weekly } = await supabase
        .from("daily_analytics")
        .select("*")
        .gte("day", new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0])
        .order("day", { ascending: true });
      setWeeklyData(weekly || []);

      // Category breakdown from truck loads
      if (truckLoad && truckLoad.length > 0) {
        const catMap: Record<string, { loaded: number; sold: number; returned: number }> = {};
        truckLoad.forEach((tl: any) => {
          const soldForProduct = sales?.filter(s => s.product_id === tl.product_id)
            .reduce((s, r) => s + (r.quantity || 0), 0) || 0;
          const name = (tl.products as any)?.name || "Unknown";
          catMap[name] = {
            loaded: tl.quantity_loaded || 0,
            sold: soldForProduct,
            returned: tl.quantity_returned || 0,
          };
        });
        setCategoryBreakdown(Object.entries(catMap).map(([name, vals]) => ({ name, ...vals })));
      }

    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setIsLoading(false);
    }
  }

  const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
    pending:   { label: "Not Started", bg: "bg-gray-100",   text: "text-gray-600",  dot: "bg-gray-400" },
    active:    { label: "Active",      bg: "bg-green-100",  text: "text-green-700", dot: "bg-green-500" },
    paused:    { label: "Paused",      bg: "bg-yellow-100", text: "text-yellow-700",dot: "bg-yellow-400" },
    completed: { label: "Completed",   bg: "bg-blue-100",   text: "text-blue-700",  dot: "bg-blue-500" },
  };
  const sc = statusConfig[sessionStatus] || statusConfig.pending;

  const maxRevenue = Math.max(...weeklyData.map(d => d.revenue || 0), 1);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">{t("common_loading")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("dashboard_title")}</h1>
            <p className="text-sm text-gray-500">
              {new Date().toLocaleDateString("en-US", { dateStyle: "full" })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Date range toggle */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              {(["today", "week", "month"] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                    dateRange === r ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >{t(`dashboard_${r}`)}</button>
              ))}
            </div>
            {/* Session status */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${sc.bg}`}>
              <span className={`w-2 h-2 rounded-full ${sc.dot}`} />
              <span className={`text-xs font-semibold ${sc.text}`}>{sc.label}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 max-w-7xl mx-auto space-y-5">

        {/* ── BANK DEPOSIT BANNER ── */}
        {depositInfo && depositInfo.amount > 0 && (
          <div className="bg-gray-900 text-white rounded-2xl px-6 py-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl">🏦</div>
              <div>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{t("dashboard_deposit_required")}</p>
                <p className="font-bold text-white">
                  {depositInfo.driverName} {t("dashboard_deposit_banner")} —{" "}
                  <span className="text-green-400">LKR {depositInfo.amount.toFixed(2)}</span>
                </p>
              </div>
            </div>
            <div className="flex gap-4 text-sm">
              <div className="text-center">
                <p className="text-gray-400 text-xs">{t("dashboard_collected_label")}</p>
                <p className="font-bold text-white">LKR {depositInfo.collected.toFixed(2)}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-400 text-xs">{t("dashboard_expenses_label")}</p>
                <p className="font-bold text-red-400">− LKR {depositInfo.expenses.toFixed(2)}</p>
              </div>
              <div className="text-center border-l border-white/20 pl-4">
                <p className="text-gray-400 text-xs">{t("dashboard_net_deposit_label")}</p>
                <p className="font-bold text-green-400">LKR {depositInfo.amount.toFixed(2)}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── KPI CARDS ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: t("dashboard_revenue"),   value: `LKR ${todayStats.revenue.toFixed(2)}`,    sub: `${todayStats.shopsServed} ${t("dashboard_shops_served")}`,    color: "text-blue-600",   bg: "bg-blue-50"   },
            { label: t("dashboard_collected"),    value: `LKR ${todayStats.collected.toFixed(2)}`,  sub: `LKR ${todayStats.outstanding.toFixed(2)} ${t("dashboard_outstanding_label")}`, color: "text-green-600",  bg: "bg-green-50"  },
            { label: t("dashboard_net_deposit"),       value: `LKR ${todayStats.netDeposit.toFixed(2)}`, sub: `${t("dashboard_expenses_label")}: LKR ${todayStats.expenses.toFixed(2)}`, color: "text-purple-600", bg: "bg-purple-50" },
            { label: t("dashboard_units_sold"),        value: String(todayStats.unitsSold),              sub: `${todayStats.unitsLoaded} ${t("dashboard_loaded")} · ${todayStats.unitsReturned} ${t("dashboard_returned")}`, color: "text-orange-600", bg: "bg-orange-50" },
          ].map(card => (
            <div key={card.label} className={`rounded-2xl border p-5 ${card.bg}`}>
              <p className="text-xs text-gray-500 font-medium mb-2">{card.label}</p>
              <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
              <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* ── WEEKLY TREND + RECONCILIATION ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Weekly bar chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl border p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">{t("dashboard_revenue_trend")}</h2>
              <span className="text-xs text-gray-400">{t("dashboard_last_7_days")}</span>
            </div>
            {weeklyData.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-gray-400 text-sm">{t("dashboard_no_data")}</div>
            ) : (
              <div className="flex items-end gap-2 h-36">
                {weeklyData.map((day, i) => {
                  const height = Math.max(4, ((day.revenue || 0) / maxRevenue) * 100);
                  const isToday = day.day === today;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs text-gray-400" style={{ fontSize: "9px" }}>
                        {day.revenue > 0 ? `${(day.revenue / 1000).toFixed(1)}k` : ""}
                      </span>
                      <div
                        className={`w-full rounded-t-lg transition-all ${isToday ? "bg-gray-900" : "bg-gray-200"}`}
                        style={{ height: `${height}%` }}
                      />
                      <span className="text-xs text-gray-400" style={{ fontSize: "9px" }}>
                        {new Date(day.day).toLocaleDateString("en-US", { weekday: "short" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Weekly summary row */}
            {weeklyData.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t">
                {[
                  { label: t("dashboard_weekly_total"), value: `LKR ${weeklyData.reduce((s, d) => s + (d.revenue || 0), 0).toFixed(0)}` },
                  { label: t("dashboard_weekly_collected"), value: `LKR ${weeklyData.reduce((s, d) => s + (d.collected || 0), 0).toFixed(0)}` },
                  { label: t("dashboard_weekly_avg"), value: `LKR ${(weeklyData.reduce((s, d) => s + (d.revenue || 0), 0) / Math.max(weeklyData.length, 1)).toFixed(0)}` },
                ].map(item => (
                  <div key={item.label} className="text-center">
                    <p className="text-xs text-gray-400">{item.label}</p>
                    <p className="font-bold text-gray-900 text-sm">{item.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reconciliation slip */}
          <div className="bg-white rounded-2xl border p-5 flex flex-col gap-3">
            <div>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">{t("dashboard_reconciliation")}</p>
              <p className="text-xs text-gray-400">{new Date().toLocaleDateString("en-US", { dateStyle: "medium" })}</p>
            </div>
            <div className="space-y-2 flex-1">
              {[
                { label: t("dashboard_total_sales"), value: `LKR ${todayStats.revenue.toFixed(2)}`, type: "neutral" },
                { label: t("dashboard_cash_collected"), value: `LKR ${todayStats.collected.toFixed(2)}`, type: "green" },
                { label: t("dashboard_outstanding_label"), value: `LKR ${todayStats.outstanding.toFixed(2)}`, type: "red" },
                { label: t("dashboard_route_expenses"), value: `− LKR ${todayStats.expenses.toFixed(2)}`, type: "red" },
              ].map(line => (
                <div key={line.label} className="flex justify-between items-center py-1.5 border-b border-gray-50">
                  <span className="text-sm text-gray-500">{line.label}</span>
                  <span className={`text-sm font-semibold ${
                    line.type === "green" ? "text-green-600" :
                    line.type === "red" ? "text-red-600" : "text-gray-900"
                  }`}>{line.value}</span>
                </div>
              ))}
            </div>
            <div className="bg-gray-900 rounded-xl px-4 py-3 flex justify-between items-center">
              <span className="text-white text-sm font-semibold">{t("dashboard_net_deposit_label")}</span>
              <span className="text-green-400 font-bold">LKR {todayStats.netDeposit.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* ── PRODUCT BREAKDOWN + OUTSTANDING ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Top products */}
          <div className="bg-white rounded-2xl border p-5">
            <h2 className="font-semibold text-gray-900 mb-4">{t("dashboard_top_products")}</h2>
            {topProducts.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">{t("dashboard_no_sales")}</p>
            ) : (
              <div className="space-y-3">
                {topProducts.map((p, i) => {
                  const pct = Math.round((p.revenue / Math.max(todayStats.revenue, 1)) * 100);
                  return (
                    <div key={i}>
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium text-gray-900 truncate">{p.name}</span>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-xs text-gray-400">{p.qty} {t("dashboard_units")}</span>
                          <span className="text-sm font-bold text-gray-900">LKR {p.revenue.toFixed(0)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gray-900 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Outstanding balances */}
          <div className="bg-white rounded-2xl border p-5">
            <h2 className="font-semibold text-gray-900 mb-4">{t("dashboard_outstanding_balances")}</h2>
            {outstandingShops.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6">
                <span className="text-3xl mb-2">✓</span>
                <p className="text-green-600 font-semibold text-sm">{t("dashboard_all_settled")}</p>
                <p className="text-gray-400 text-xs mt-1">{t("dashboard_no_outstanding")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {outstandingShops.map((shop, i) => (
                  <div key={i} className="flex justify-between items-center py-2 border-b border-gray-50">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-xs font-bold text-red-600">
                        {shop.shop_name?.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{shop.shop_name}</span>
                    </div>
                    <span className="font-bold text-red-600 text-sm">LKR {shop.outstanding_amount.toFixed(2)}</span>
                  </div>
                ))}
                <div className="pt-2 flex justify-between">
                  <span className="text-xs text-gray-400">{t("dashboard_total_outstanding")}</span>
                  <span className="text-sm font-bold text-red-600">
                    LKR {outstandingShops.reduce((s, r) => s + r.outstanding_amount, 0).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── TRUCK LOAD BREAKDOWN ── */}
        {categoryBreakdown.length > 0 && (
          <div className="bg-white rounded-2xl border p-5">
            <h2 className="font-semibold text-gray-900 mb-4">{t("dashboard_truck_breakdown")}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 font-semibold uppercase">
                    <th className="text-left pb-3">{t("dashboard_product")}</th>
                    <th className="text-center pb-3">{t("dashboard_loaded")}</th>
                    <th className="text-center pb-3">{t("dashboard_sold")}</th>
                    <th className="text-center pb-3">{t("dashboard_returned")}</th>
                    <th className="text-center pb-3">{t("dashboard_remaining")}</th>
                    <th className="text-right pb-3">{t("dashboard_sold_pct")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {categoryBreakdown.map((item, i) => {
                    const remaining = item.loaded - item.sold - item.returned;
                    const soldPct = item.loaded > 0 ? Math.round((item.sold / item.loaded) * 100) : 0;
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="py-2.5 font-medium text-gray-900">{item.name}</td>
                        <td className="py-2.5 text-center">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-bold">{item.loaded}</span>
                        </td>
                        <td className="py-2.5 text-center">
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-bold">{item.sold}</span>
                        </td>
                        <td className="py-2.5 text-center">
                          <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-bold">{item.returned}</span>
                        </td>
                        <td className="py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                            remaining > 0 ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"
                          }`}>{Math.max(0, remaining)}</span>
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${soldPct}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-gray-600 w-8">{soldPct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}