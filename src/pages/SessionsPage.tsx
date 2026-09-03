import { useState, useEffect } from "react";
import { supabase } from "../db/supabase";
import { useLang } from "../i18n/LanguageContext";

export default function SessionsPage() {
  const { t } = useLang();
  const [todaySession, setTodaySession] = useState<any>(null);
  const [allSessions, setAllSessions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sessionDetails, setSessionDetails] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [shops, setShops] = useState<any[]>([]);

  // Truck load state
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [truckLoads, setTruckLoads] = useState<Record<string, number>>({});
  const [savingTruckLoad, setSavingTruckLoad] = useState(false);

  // POS business date is Colombo time, not UTC.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const normalizeSessionDate = (session: any) => session?.session_date;

  async function getCurrentUserId() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!data.user?.id) throw new Error("You must be signed in to manage a route session.");
    return data.user.id;
  }

  async function getSessionPayload(status: string) {
    return {
      id: crypto.randomUUID(),
      session_date: today,
      driver_id: await getCurrentUserId(),
      status,
    };
  }

  const isMissingRelationError = (error: any) => {
    const raw = error?.message || error?.msg || error?.details || error?.hint || error;
    const message = String(raw || "").toLowerCase();
    return message.includes("relation") || message.includes("not found") || (error as any)?.status === 404;
  };

  async function fetchSessionForDate(date: string) {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from("route_sessions")
      .select("*")
      .eq("session_date", date)
      .eq("driver_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;
    return data?.[0] || null;
  }

  async function insertSession(status: string) {
    const basePayload = await getSessionPayload(status);
    const existing = await fetchSessionForDate(today);
    if (existing) return existing;

    const { data, error } = await supabase
      .from("route_sessions")
      .insert(basePayload)
      .select()
      .single();

    if (!error) return data;

    const message = String(error?.message || "").toLowerCase();
    const isDuplicate = (error as any)?.code === "23505" || message.includes("duplicate key");
    if (isDuplicate) {
      const existingAfterConflict = await fetchSessionForDate(today);
      if (existingAfterConflict) return existingAfterConflict;
    }

    throw error;
  }

  async function fetchAllSessions() {
  const { data, error } = await supabase
    .from("route_sessions")
    .select("*")
    .order("session_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

useEffect(() => { loadData(); }, []);

  // Realtime subscriptions: refresh when new records arrive
  useEffect(() => {
    const tables = ["sales", "payments", "returns", "expenses", "outstanding_settlements", "route_sessions"];
    const subs: any[] = [];

    const handlePayload = (payload: any) => {
      try {
        const newRec = payload?.new;
        if (!newRec) return;
        const recDate = (newRec.sold_at || newRec.paid_at || newRec.returned_at || newRec.spent_at || newRec.settled_at || newRec.date || newRec.session_date);
        const recDay = recDate ? recDate.split?.("T")?.[0] || new Date(recDate).toISOString().split("T")[0] : null;

        // If the record is for today, refresh today's session and history
        if (recDay === today) {
          loadData().catch(() => {});
          if (selectedDate === today) loadSessionDetails(today).catch(() => {});
        }

        // If the currently selected detail date matches the record date, refresh details
        if (selectedDate && recDay === selectedDate) {
          loadSessionDetails(selectedDate).catch(() => {});
        }
      } catch (e) {
        // ignore
      }
    };

    for (const t of tables) {
      try {
        const ch = supabase
          .channel(`public:${t}`)
          .on("postgres_changes", { event: "*", schema: "public", table: t }, handlePayload)
          .subscribe();
        subs.push(ch);
      } catch (e) {
        // ignore subscription errors
      }
    }

    return () => {
      try {
        subs.forEach((s) => s.unsubscribe && s.unsubscribe());
      } catch (e) {}
    };
  }, [selectedDate]);

  async function loadData() {
    setIsLoading(true);
    try {
      // Load today's session from route_sessions table
  const existing = await fetchSessionForDate(today);
  const sessionForToday = existing || await insertSession("pending");
  setTodaySession(sessionForToday);

      // Load all past sessions
      setAllSessions(await fetchAllSessions());

      // Load shops for route coverage
      const { data: shopsData, error: shopsError } = await supabase
        .from("shops")
        .select("id, name, is_active, session_active")
        .eq("is_active", true)
        .order("route_order");
      if (shopsError && !isMissingRelationError(shopsError)) throw shopsError;
      setShops(shopsData || []);

      // Load products and categories for truck load
      try {
        const [{ data: cats }, { data: prods }] = await Promise.all([
          supabase.from("product_categories").select("*").eq("is_active", true).order("sort_order"),
          supabase.from("products").select("*").eq("is_active", true).order("name"),
        ]);
        setCategories(cats || []);
        setProducts(prods || []);
      } catch (e) {
        console.warn("Failed to load products/categories for truck load:", e);
      }

      // Load truck loads through the session identity, never by date alone.
      try {
        const { data: existingTruckLoads } = await supabase
          .from("truck_loads")
          .select("*")
          .eq("session_id", sessionForToday.id);
        if (existingTruckLoads) {
          const loads: Record<string, number> = {};
          existingTruckLoads.forEach((tl: any) => {
            loads[tl.product_id] = tl.quantity_loaded || 0;
          });
          setTruckLoads(loads);
        }
      } catch (e) {
        // truck_loads table may not exist yet
        console.warn("Failed to load truck loads:", e);
      }

    } catch (err: any) {
      console.error("Failed to load sessions:", err);
      const message = err?.message || err?.msg || err?.details || JSON.stringify(err) || String(err);
      setMessage("Error loading sessions: " + message);
    } finally {
      setIsLoading(false);
    }
  }

  async function saveTruckLoads() {
  if (!todaySession?.id) {
    setMessage("Error: No active session found.");
    return;
  }

  setSavingTruckLoad(true);
    try {
      const entries = Object.entries(truckLoads)
        .filter(([, qty]) => qty > 0)
        .map(([productId, qty]) => ({
  session_id: todaySession.id,
  session_date: today,
  product_id: productId,
  quantity_loaded: qty,
  quantity_returned: 0,
}));

      // Replace only this session's loads. Never delete another session's stock.
      const { data: existing } = await supabase
        .from("truck_loads")
        .select("product_id")
        .eq("session_id", todaySession.id);

      const nextProductIds = new Set(entries.map((entry) => entry.product_id));
      const removedProductIds = (existing || [])
        .map((row) => row.product_id)
        .filter((productId) => !nextProductIds.has(productId));

      if (removedProductIds.length > 0) {
        const { error } = await supabase
          .from("truck_loads")
          .delete()
          .eq("session_id", todaySession.id)
          .in("product_id", removedProductIds);
        if (error) throw error;
      }

      if (entries.length > 0) {
        const { error } = await supabase
          .from("truck_loads")
          .upsert(entries, { onConflict: "session_id,product_id" });
        if (error) throw error;
      }

      setMessage("Truck load saved. You can now start the route.");
    } catch (err: any) {
      console.error("Save truck loads error:", err);
      setMessage("Error saving truck load: " + (err.message || JSON.stringify(err)));
    } finally {
      setSavingTruckLoad(false);
    }
  }

  async function updateStatus(newStatus: string) {
    if (!todaySession) return;

    // If starting the route, require truck loads to be saved first
    if (newStatus === "active" && !hasTruckLoad()) {
      setMessage("Please record at least one product loaded into the truck before starting.");
      return;
    }

    setIsUpdating(true);
    try {
      // Save truck loads before starting
      if (newStatus === "active") {
        await saveTruckLoadsOnStart();
      }

      const sessionDate = normalizeSessionDate(todaySession) || today;
      const id = todaySession.id;
      const now = new Date().toISOString();
      const updates: any = { status: newStatus };
      if (newStatus === "active" && !todaySession.started_at) {
        updates.started_at = now;
      }
      if (newStatus === "completed") {
        updates.completed_at = now;
      }
      if (newStatus === "pending") {
        updates.started_at = null;
        updates.completed_at = null;
      }

      const result = await supabase
        .from("route_sessions")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      const data = Array.isArray(result.data)
        ? [...result.data].sort((a, b) => String(b.id).localeCompare(String(a.id)))[0]
        : result.data;
      const error = result.error;

      if (error) throw error;
      setTodaySession(data);

      // Refresh history
      setAllSessions(await fetchAllSessions());

      setMessage(`Session ${newStatus === "active" ? "started/resumed" : newStatus}`);
    } catch (err: any) {
      setMessage("Error: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  }

  async function saveTruckLoadsOnStart() {
    // Save truck loads silently when starting (already validated)
    if (Object.values(truckLoads).some(q => q > 0)) {
      await saveTruckLoads();
    }
  }

  function hasTruckLoad() {
    return Object.values(truckLoads).some(q => q > 0);
  }

  const totalLoaded = Object.values(truckLoads).reduce((sum, q) => sum + q, 0);

  // Group products by category for truck load display
  const groupedProducts = categories.length > 0
    ? categories.map(cat => ({
        ...cat,
        products: products.filter(p => p.category_id === cat.id),
      })).filter(cat => cat.products.length > 0)
    : [{ id: "all", name: "All Products", products }];

  async function loadSessionDetails(date: string) {
    if (!date) return;
    setDetailsLoading(true);
    setSelectedDate(date);
    try {
      const start = `${date}T00:00:00`;
      const end = `${date}T23:59:59`;

      const [{ data: sales }, { data: payments }, { data: expenses }, { data: returns }] =
        await Promise.all([
          supabase.from("sales")
            .select("*, products(name, size_kg), shops(name)")
            .gte("sold_at", start).lte("sold_at", end)
            .order("sold_at", { ascending: false }),
          supabase.from("payments")
            .select("*, shops(name)")
            .gte("paid_at", start).lte("paid_at", end)
            .order("paid_at", { ascending: false }),
          supabase.from("expenses")
            .select("*")
            .gte("spent_at", start).lte("spent_at", end),
          supabase.from("returns")
            .select("*, products(name), shops(name)")
            .gte("returned_at", start).lte("returned_at", end),
        ]);

      setSessionDetails({ date, sales: sales || [], payments: payments || [], expenses: expenses || [], returns: returns || [] });
    } catch (err: any) {
      setMessage("Error loading details: " + err.message);
    } finally {
      setDetailsLoading(false);
    }
  }

  const status = todaySession?.status || "pending";
  const includedShops = shops.filter(s => s.session_active !== false).length;

  const statusConfig: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    pending:   { bg: "bg-gray-100",   text: "text-gray-700",  dot: "bg-gray-400",  label: "Not Started" },
    active:    { bg: "bg-green-100",  text: "text-green-800", dot: "bg-green-500", label: "Active" },
    paused:    { bg: "bg-yellow-100", text: "text-yellow-800",dot: "bg-yellow-500",label: "Paused" },
    completed: { bg: "bg-blue-100",   text: "text-blue-800",  dot: "bg-blue-500",  label: "Completed" },
  };
  const sc = statusConfig[status] || statusConfig.pending;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">{t("common_loading")}</p>
      </div>
    );
  }

  // Detail view
  if (selectedDate && sessionDetails) {
    const totalRevenue = sessionDetails.sales.reduce((s: number, r: any) => s + (r.total_amount || 0), 0);
    const totalPayments = sessionDetails.payments.reduce((s: number, r: any) => s + (r.amount || 0), 0);
    const totalExpenses = sessionDetails.expenses.reduce((s: number, r: any) => s + (r.amount || 0), 0);
    const totalLosses = sessionDetails.returns.reduce((s: number, r: any) => s + (r.total_loss || 0), 0);
    const uniqueShops = new Set(sessionDetails.sales.map((s: any) => s.shop_id)).size;

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b px-6 py-4 shadow-sm sticky top-0 z-10">
          <button
            onClick={() => { setSelectedDate(null); setSessionDetails(null); }}
            className="text-gray-500 hover:text-gray-900 text-sm mb-2 flex items-center gap-1"
          >
            ← {t("common_back")}
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            Session Report — {new Date(selectedDate).toLocaleDateString("en-US", {
              weekday: "long", year: "numeric", month: "long", day: "numeric"
            })}
          </h1>
        </div>

        <div className="px-6 py-4 max-w-5xl mx-auto space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: t("dashboard_revenue"),    value: `LKR ${totalRevenue.toFixed(2)}`,  color: "text-blue-600" },
              { label: t("dashboard_collected"),  value: `LKR ${totalPayments.toFixed(2)}`, color: "text-green-600" },
              { label: t("dashboard_expenses_label"),   value: `LKR ${totalExpenses.toFixed(2)}`, color: "text-orange-600" },
              { label: t("dashboard_net_deposit_label"),value: `LKR ${(totalPayments - totalExpenses).toFixed(2)}`, color: "text-purple-600" },
              { label: t("dashboard_shops_served"),      value: String(uniqueShops),               color: "text-gray-900" },
            ].map(card => (
              <div key={card.label} className="bg-white rounded-xl border p-3">
                <p className="text-xs text-gray-500 mb-1">{card.label}</p>
                <p className={`font-bold text-sm ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* Sales */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h2 className="font-semibold text-gray-900">{t("dashboard_sold")} ({sessionDetails.sales.length})</h2>
            </div>
            {sessionDetails.sales.length === 0 ? (
              <p className="p-6 text-center text-gray-400 text-sm">No sales recorded</p>
            ) : (
              <div className="divide-y max-h-80 overflow-y-auto">
                {sessionDetails.sales.map((sale: any, i: number) => (
                  <div key={i} className="px-4 py-3 flex justify-between items-center hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{sale.shops?.name}</p>
                      <p className="text-xs text-gray-500">
                        {sale.products?.name} × {sale.quantity} ·{" "}
                        {new Date(sale.sold_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <p className="font-semibold text-sm text-blue-600">
                      LKR {(sale.total_amount || 0).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payments */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h2 className="font-semibold text-gray-900">{t("dashboard_cash_collected")} ({sessionDetails.payments.length})</h2>
            </div>
            {sessionDetails.payments.length === 0 ? (
              <p className="p-6 text-center text-gray-400 text-sm">No payments recorded</p>
            ) : (
              <div className="divide-y max-h-80 overflow-y-auto">
                {sessionDetails.payments.map((p: any, i: number) => (
                  <div key={i} className="px-4 py-3 flex justify-between items-center hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.shops?.name}</p>
                      <p className="text-xs text-gray-500 capitalize">
                        {p.payment_type} ·{" "}
                        {new Date(p.paid_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <p className="font-semibold text-sm text-green-600">
                      LKR {(p.amount || 0).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Expenses */}
          {sessionDetails.expenses.length > 0 && (
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50">
                <h2 className="font-semibold text-gray-900">{t("dashboard_expenses_label")} ({sessionDetails.expenses.length})</h2>
              </div>
              <div className="divide-y">
                {sessionDetails.expenses.map((e: any, i: number) => (
                  <div key={i} className="px-4 py-3 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium capitalize text-gray-900">{e.category}</p>
                      {e.description && <p className="text-xs text-gray-500">{e.description}</p>}
                    </div>
                    <p className="font-semibold text-sm text-orange-600">
                      LKR {(e.amount || 0).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Main sessions page
  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("sessions_title")}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {new Date().toLocaleDateString("en-US", { dateStyle: "full" })}
            </p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${sc.bg}`}>
            <span className={`w-2 h-2 rounded-full ${sc.dot}`} />
            <span className={`text-sm font-semibold ${sc.text}`}>Today: {sc.label}</span>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 max-w-5xl mx-auto space-y-5">

        {message && (
          <div className={`p-3 rounded-lg text-sm font-medium ${
            message.startsWith("Error") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
          }`}>
            {message}
            <button onClick={() => setMessage("")} className="ml-2 font-bold">×</button>
          </div>
        )}

        {/* Today's control panel */}
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h2 className="font-semibold text-gray-900">{t("sessions_today")}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {includedShops} {t("sessions_shops_included")}
            </p>
          </div>

          <div className="px-6 py-5 space-y-3">
            {/* Status info */}
            <div className={`rounded-xl px-4 py-3 ${sc.bg}`}>
              <p className={`text-sm font-medium ${sc.text}`}>
                {status === "pending"   && `○ ${t("sessions_not_started")}`}
                {status === "active"    && `● ${t("sessions_active")}`}
                {status === "paused"    && `⏸ ${t("sessions_paused")}`}
                {status === "completed" && `✓ ${t("sessions_completed")}`}
              </p>
              {todaySession?.started_at && (
                <p className={`text-xs mt-1 ${sc.text} opacity-70`}>
                  {t("sessions_started")}: {new Date(todaySession.started_at).toLocaleTimeString()}
                  {todaySession.completed_at && ` · ${t("sessions_ended")}: ${new Date(todaySession.completed_at).toLocaleTimeString()}`}
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3">
              {(status === "pending" || status === "completed") && (
                <button
                  onClick={() => updateStatus("active")}
                  disabled={isUpdating || (status === "pending" && !hasTruckLoad())}
                  className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  {isUpdating ? "..." : status === "completed" ? t("sessions_reopen") : t("sessions_start")}
                </button>
              )}

              {status === "active" && (
                <button
                  onClick={() => updateStatus("paused")}
                  disabled={isUpdating}
                  className="px-6 py-2.5 bg-yellow-500 text-white rounded-xl font-semibold text-sm hover:bg-yellow-600 disabled:opacity-50"
                >
                  {isUpdating ? "..." : t("sessions_pause")}
                </button>
              )}

              {status === "paused" && (
                <button
                  onClick={() => updateStatus("active")}
                  disabled={isUpdating}
                  className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  {isUpdating ? "..." : t("sessions_resume")}
                </button>
              )}

              {(status === "active" || status === "paused") && (
                <button
                  onClick={() => setShowEndConfirm(true)}
                  disabled={isUpdating}
                  className="px-6 py-2.5 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700 disabled:opacity-50"
                >
                  {t("sessions_end")}
                </button>
              )}

              {status !== "pending" && (
                <button
                  onClick={() => setShowResetConfirm(true)}
                  disabled={isUpdating}
                  className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-xl text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  {t("sessions_reset")}
                </button>
              )}
            </div>

            {/* Truck load hint when pending */}
            {status === "pending" && !hasTruckLoad() && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                <p className="text-sm font-medium text-amber-800">Truck Load Required</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Record the products loaded into the truck below before starting the route.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* TRUCK LOAD SECTION */}
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">Truck Load — {today}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {totalLoaded > 0
                  ? `${totalLoaded} units loaded across ${Object.values(truckLoads).filter(q => q > 0).length} products`
                  : "No products recorded yet"}
              </p>
            </div>
            {status === "pending" && (
              <button
                onClick={saveTruckLoads}
                disabled={savingTruckLoad}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {savingTruckLoad ? "Saving..." : "Save Load"}
              </button>
            )}
          </div>

          <div className="px-6 py-4 space-y-4">
            {products.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-4">
                No active products found. Add products in the Products page first.
              </p>
            ) : (
              groupedProducts.map(cat => (
                <div key={cat.id}>
                  <div className="flex items-center gap-2 mb-2 mt-3 first:mt-0">
                    <span className="text-sm font-bold text-gray-700">{cat.name}</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {cat.products.map((product: any) => {
                      const qty = truckLoads[product.id] || 0;
                      const sizeLabel = product.size_kg >= 1
                        ? `${product.size_kg}KG`
                        : `${Math.round(product.size_kg * 1000)}g`;

                      return (
                        <div
                          key={product.id}
                          className={`rounded-xl border p-3 flex items-center justify-between ${
                            qty > 0 ? "border-green-200 bg-green-50" : "border-gray-200 bg-white"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs font-bold rounded">
                                {sizeLabel}
                              </span>
                              <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                            </div>
                            {qty > 0 && (
                              <p className="text-xs text-green-700 font-bold mt-0.5">
                                {qty} loaded
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                            <button
                              onClick={() => setTruckLoads(prev => ({
                                ...prev,
                                [product.id]: Math.max(0, (prev[product.id] || 0) - 1)
                              }))}
                              disabled={status !== "pending"}
                              className="w-8 h-8 rounded-lg bg-white border border-gray-300 text-gray-600 text-sm hover:bg-gray-100 disabled:opacity-40"
                            >−</button>
                            <span className="w-8 text-center text-sm font-bold text-gray-900">
                              {qty}
                            </span>
                            <button
                              onClick={() => setTruckLoads(prev => ({
                                ...prev,
                                [product.id]: (prev[product.id] || 0) + 1
                              }))}
                              disabled={status !== "pending"}
                              className="w-8 h-8 rounded-lg bg-gray-900 text-white text-sm hover:bg-gray-800 disabled:opacity-40"
                            >+</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sessions history */}
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h2 className="font-semibold text-gray-900">{t("sessions_history")}</h2>
          </div>
          {allSessions.length === 0 ? (
            <p className="p-8 text-center text-gray-400 text-sm">{t("sessions_no_sessions")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-6 py-3 text-gray-500 font-semibold">{t("sessions_date")}</th>
                    <th className="text-left px-6 py-3 text-gray-500 font-semibold">{t("sessions_status")}</th>
                    <th className="text-left px-6 py-3 text-gray-500 font-semibold">{t("sessions_started")}</th>
                    <th className="text-left px-6 py-3 text-gray-500 font-semibold">{t("sessions_ended")}</th>
                    <th className="text-right px-6 py-3 text-gray-500 font-semibold">{t("sessions_action")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {allSessions.map((s: any) => {
                    const cfg = statusConfig[s.status] || statusConfig.pending;
                    const sessionDate = normalizeSessionDate(s);
                    const isToday = sessionDate === today;
                    return (
                      <tr key={s.id} className={`hover:bg-gray-50 ${isToday ? "bg-green-50" : ""}`}>
                        <td className="px-6 py-3 font-medium text-gray-900">
                          {new Date(sessionDate).toLocaleDateString("en-US", {
                            weekday: "short", month: "short", day: "numeric", year: "numeric"
                          })}
                          {isToday && <span className="ml-2 text-xs text-green-600 font-medium">{t("common_today_badge")}</span>}
                        </td>
                        <td className="px-6 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-gray-500 text-xs">
                          {s.started_at ? new Date(s.started_at).toLocaleTimeString() : "—"}
                        </td>
                        <td className="px-6 py-3 text-gray-500 text-xs">
                          {s.completed_at ? new Date(s.completed_at).toLocaleTimeString() : "—"}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <button
                            onClick={() => loadSessionDetails(sessionDate)}
                            className="text-sm font-medium text-gray-900 hover:text-gray-600"
                          >
                            {t("sessions_view")}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* End confirmation modal */}
      {showEndConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 mb-2">{t("sessions_end_confirm_title")}</h3>
            <p className="text-sm text-gray-500 mb-5">
              {t("sessions_end_confirm_body")}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="px-4 py-2 border rounded-xl text-sm hover:bg-gray-50"
              >{t("sessions_cancel")}</button>
              <button
                onClick={() => { setShowEndConfirm(false); updateStatus("completed"); }}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700"
              >{t("sessions_end")}</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset confirmation modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 mb-2">{t("sessions_reset_confirm_title")}</h3>
            <p className="text-sm text-gray-500 mb-5">
              {t("sessions_reset_confirm_body")}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 border rounded-xl text-sm hover:bg-gray-50"
              >{t("sessions_cancel")}</button>
              <button
                onClick={() => { setShowResetConfirm(false); updateStatus("pending"); }}
                className="px-4 py-2 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900"
              >{t("sessions_reset")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}