import { useState, useEffect, useRef } from "react";
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
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionDetails, setSessionDetails] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showReassignConfirm, setShowReassignConfirm] = useState(false);
  const [reassignmentSession, setReassignmentSession] = useState<any>(null);
  const [reassignmentTargetDriverId, setReassignmentTargetDriverId] = useState("");
  const [reassignmentReason, setReassignmentReason] = useState("");
  const [isReassigning, setIsReassigning] = useState(false);
  const [shops, setShops] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  // Truck load state
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [truckLoads, setTruckLoads] = useState<Record<string, number>>({});
  const [savedTruckLoads, setSavedTruckLoads] = useState<Record<string, number>>({});
  const [truckLoadCorrectionReason, setTruckLoadCorrectionReason] = useState("");
  const [savingTruckLoad, setSavingTruckLoad] = useState(false);
  const loadRequestId = useRef(0);

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

  async function getSessionPayload(status: string, driverId: string) {
    return {
      id: crypto.randomUUID(),
      session_date: today,
      driver_id: driverId,
      status,
    };
  }

  const isMissingRelationError = (error: any) => {
    const raw = error?.message || error?.msg || error?.details || error?.hint || error;
    const message = String(raw || "").toLowerCase();
    return message.includes("relation") || message.includes("not found") || (error as any)?.status === 404;
  };

  async function fetchSessionForDate(date: string, driverId: string) {
    const { data, error } = await supabase
      .from("route_sessions")
      .select("*")
      .eq("session_date", date)
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;
    return data?.[0] || null;
  }

  async function fetchSessionById(sessionId: string, driverId: string) {
    const { data, error } = await supabase
      .from("route_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("driver_id", driverId)
      .single();

    if (error) throw error;
    return data;
  }

  async function insertSession(status: string, driverId: string) {
    const basePayload = await getSessionPayload(status, driverId);
    const existing = await fetchSessionForDate(today, driverId);
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
      const existingAfterConflict = await fetchSessionForDate(today, driverId);
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

  function resetDriverSessionState() {
    loadRequestId.current += 1;
    setTodaySession(null);
    setSelectedDate(null);
    setSelectedSessionId(null);
    setSessionDetails(null);
    setTruckLoads({});
    setSavedTruckLoads({});
    setTruckLoadCorrectionReason("");
    setSavingTruckLoad(false);
    setIsUpdating(false);
    setMessage("");
  }

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
        if (recDay === today && selectedDriverId && (!newRec.driver_id || newRec.driver_id === selectedDriverId)) {
          loadData(selectedDriverId).catch(() => {});
          if (selectedSessionId) loadSessionDetails(selectedSessionId).catch(() => {});
        }

        // If the currently selected detail date matches the record date, refresh details
        if (selectedSessionId && recDay === selectedDate) {
          loadSessionDetails(selectedSessionId).catch(() => {});
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
  }, [selectedDate, selectedSessionId, selectedDriverId]);

  async function loadData(driverIdOverride?: string | null) {
    const requestId = ++loadRequestId.current;
    const isCurrentRequest = () => requestId === loadRequestId.current;
    setIsLoading(true);
    try {
      const { data: driverData, error: driverError } = await supabase
        .from("driver_accounts")
        .select("id, full_name, auth_user_id, is_active")
        .eq("is_active", true)
        .not("auth_user_id", "is", null)
        .order("full_name");
      if (driverError) throw driverError;
      if (!isCurrentRequest()) return;

      const availableDrivers = driverData || [];
      setDrivers(availableDrivers);
      const driverId = driverIdOverride !== undefined
        ? driverIdOverride
        : selectedDriverId && availableDrivers.some((driver) => driver.auth_user_id === selectedDriverId)
          ? selectedDriverId
          : availableDrivers.length === 1
            ? availableDrivers[0].auth_user_id
            : null;
      setSelectedDriverId(driverId);

      // Load today's session from route_sessions table
      const existing = driverId ? await fetchSessionForDate(today, driverId) : null;
      const sessionForToday = driverId ? existing || await insertSession("pending", driverId) : null;
      if (!isCurrentRequest()) return;
      setTodaySession(sessionForToday);

      // Load all past sessions
      const sessions = await fetchAllSessions();
      if (!isCurrentRequest()) return;
      setAllSessions(sessions);

      // Load shops for route coverage
      const { data: shopsData, error: shopsError } = await supabase
        .from("shops")
        .select("id, name, is_active, session_active")
        .eq("is_active", true)
        .order("route_order");
      if (shopsError && !isMissingRelationError(shopsError)) throw shopsError;
      if (!isCurrentRequest()) return;
      setShops(shopsData || []);

      // Load products and categories for truck load
      try {
        const [{ data: cats }, { data: prods }] = await Promise.all([
          supabase.from("product_categories").select("*").eq("is_active", true).order("sort_order"),
          supabase.from("products").select("*").eq("is_active", true).order("name"),
        ]);
        if (!isCurrentRequest()) return;
        setCategories(cats || []);
        setProducts(prods || []);
      } catch (e) {
        console.warn("Failed to load products/categories for truck load:", e);
      }

      // Load truck loads through the session identity, never by date alone.
      if (!isCurrentRequest()) return;
      setTruckLoads({});
      try {
        const { data: existingTruckLoads } = sessionForToday
          ? await supabase
            .from("truck_loads")
            .select("*")
            .eq("session_id", sessionForToday.id)
          : { data: [] };
        if (!isCurrentRequest()) return;
        const loads: Record<string, number> = {};
        (existingTruckLoads || []).forEach((tl: any) => {
          loads[tl.product_id] = tl.quantity_loaded || 0;
        });
        setTruckLoads(loads);
        setSavedTruckLoads(loads);
      } catch (e) {
        // truck_loads table may not exist yet
        console.warn("Failed to load truck loads:", e);
      }

    } catch (err: any) {
      if (!isCurrentRequest()) return;
      console.error("Failed to load sessions:", err);
      const message = err?.message || err?.msg || err?.details || JSON.stringify(err) || String(err);
      setMessage("Error loading sessions: " + message);
    } finally {
      if (isCurrentRequest()) setIsLoading(false);
    }
  }

  async function saveTruckLoads() {
  if (!todaySession?.id) {
    setMessage("Error: No active session found.");
    return false;
  }
  if (savingTruckLoad) return false;
  if (status === "completed") {
    setMessage("Error: Completed session truck loads are locked.");
    return false;
  }

  setSavingTruckLoad(true);
    try {
      if (status !== "pending") {
        const reason = truckLoadCorrectionReason.trim();
        if (!reason) {
          setMessage("Error: Enter a correction reason before changing a started route load.");
          return false;
        }

        const changedEntries = Object.entries(truckLoads)
          .filter(([productId, qty]) => qty !== (savedTruckLoads[productId] || 0));

        if (changedEntries.length === 0) {
          setMessage("No truck load changes to save.");
          return true;
        }

        for (const [productId, qty] of changedEntries) {
          if (!(productId in savedTruckLoads)) {
            throw new Error("New products cannot be added after the route starts.");
          }
          if (!Number.isInteger(qty) || qty <= 0) {
            throw new Error("Started-route load corrections must keep a positive whole-number quantity.");
          }
        }

        for (const [productId, qty] of changedEntries) {
          const { error } = await supabase.rpc("admin_correct_truck_load", {
            p_session_id: todaySession.id,
            p_product_id: productId,
            p_quantity_loaded: qty,
            p_reason: reason,
          });
          if (error) throw error;
        }

        setSavedTruckLoads({ ...truckLoads });
        setTruckLoadCorrectionReason("");
        setMessage("Truck load correction saved and audited.");
        return true;
      }

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

      const nextLoads = Object.fromEntries(entries.map((entry) => [entry.product_id, entry.quantity_loaded]));
      setTruckLoads(nextLoads);
      setSavedTruckLoads(nextLoads);
      setMessage("Truck load saved. You can now start the route.");
      return true;
    } catch (err: any) {
      console.error("Save truck loads error:", err);
      setMessage("Error saving truck load: " + (err.message || JSON.stringify(err)));
      return false;
    } finally {
      setSavingTruckLoad(false);
    }
  }

  async function updateStatus(newStatus: string) {
    if (!todaySession || !selectedDriverId) {
      setMessage("Error: Select a driver and load that driver's route session first.");
      return;
    }

    const selectedSessionId = todaySession.id;
    if (!selectedSessionId) {
      setMessage("Error: The selected driver's route session has no ID.");
      return;
    }

    let authoritativeSession: any;
    try {
      authoritativeSession = await fetchSessionById(selectedSessionId, selectedDriverId);
    } catch (error: any) {
      setMessage("Error: The selected driver's route session could not be reloaded: " + (error?.message || String(error)));
      return;
    }

    if (authoritativeSession.id !== selectedSessionId || authoritativeSession.driver_id !== selectedDriverId) {
      setMessage("Error: The selected route session no longer belongs to the selected driver.");
      return;
    }

    const currentStatus = authoritativeSession.status;
    if (String(newStatus) === "pending") {
      setMessage("Reset to pending is not supported from this page.");
      return;
    }

    const isReopen = currentStatus === "completed" && newStatus === "active";
    const isNormalTransition =
      (currentStatus === "pending" && newStatus === "active") ||
      (currentStatus === "active" && (newStatus === "paused" || newStatus === "completed")) ||
      (currentStatus === "paused" && newStatus === "active");

    if (!isReopen && !isNormalTransition) {
      setMessage("This session transition is not allowed.");
      return;
    }

    // If starting the route, require truck loads to be saved first
    if (!isReopen && newStatus === "active" && !hasTruckLoad()) {
      setMessage("Please record at least one product loaded into the truck before starting.");
      return;
    }

    setIsUpdating(true);
    try {
      // Save truck loads before starting
      if (currentStatus === "pending" && newStatus === "active") {
        await saveTruckLoadsOnStart();
      }

      const sessionDate = normalizeSessionDate(authoritativeSession) || today;
      const id = authoritativeSession.id;
      const now = new Date().toISOString();

      if (isReopen) {
        let { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          const { data: { session: refreshedSession }, error: refreshError } =
            await supabase.auth.refreshSession();
          if (refreshError) throw refreshError;
          session = refreshedSession;
        }
        if (!session?.access_token) {
          throw new Error("Your login session has expired. Please sign in again.");
        }
        supabase.functions.setAuth(session.access_token);
        const { error } = await supabase.functions.invoke("admin-reopen-session", {
          body: { session_id: id },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (error) throw error;

        if (!selectedDriverId) throw new Error("Select a driver before reopening a route session.");
        const reopened = await fetchSessionById(id, selectedDriverId);
        if (reopened.id !== id || reopened.driver_id !== selectedDriverId || reopened.status !== "active") {
          throw new Error("The reopened session did not remain assigned to the selected driver.");
        }
        setTodaySession(reopened);
        setAllSessions(await fetchAllSessions());
        setMessage("Session reopened.");
        return;
      }

      if (newStatus === "completed") {
        const { error: completionError } = await supabase.rpc("admin_complete_route_session", {
          p_session_id: id,
          p_driver_id: selectedDriverId,
        });
        if (completionError) throw completionError;
      }

      let result: { data: any; error: any };
      if (newStatus === "completed") {
        result = { data: await fetchSessionById(id, selectedDriverId), error: null };
      } else {
        const updates: any = { status: newStatus };
        const adminId = await getCurrentUserId();
        if (newStatus === "active" && !authoritativeSession.started_at) {
          updates.started_at = now;
          updates.started_by = adminId;
        }
        result = await supabase
          .from("route_sessions")
          .update(updates)
          .eq("id", id)
          .eq("driver_id", selectedDriverId)
          .select()
          .single();
      }

      const data = Array.isArray(result.data)
        ? [...result.data].sort((a, b) => String(b.id).localeCompare(String(a.id)))[0]
        : result.data;
      const error = result.error;

      if (error) throw error;
      if (!data || data.id !== id || data.driver_id !== selectedDriverId || data.status !== newStatus || (newStatus === "completed" && !data.completed_at)) {
        throw new Error("The route session transition response did not match the selected session.");
      }

      const refreshed = await fetchSessionById(id, selectedDriverId);
      if (refreshed.id !== id || refreshed.driver_id !== selectedDriverId || refreshed.status !== newStatus || (newStatus === "completed" && !refreshed.completed_at)) {
        throw new Error("The route session could not be verified after the transition.");
      }
      setTodaySession(refreshed);

      // Refresh history
      setAllSessions(await fetchAllSessions());

      setMessage(`Session ${newStatus === "active" ? "started/resumed" : newStatus}`);
    } catch (err: any) {
      setMessage("Error: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  }

  async function reassignSession() {
    if (!reassignmentSession || !reassignmentTargetDriverId || !reassignmentReason.trim()) {
      setMessage("Error: Select an active driver and provide a reason for the reassignment.");
      return;
    }

    setIsReassigning(true);
    try {
      const { error } = await supabase.rpc("admin_reassign_route_session", {
        p_session_id: reassignmentSession.id,
        p_target_driver_id: reassignmentTargetDriverId,
        p_reason: reassignmentReason.trim(),
      });
      if (error) throw error;

      setShowReassignConfirm(false);
      setReassignmentSession(null);
      setReassignmentTargetDriverId("");
      setReassignmentReason("");
      await loadData(selectedDriverId);
      setMessage("Route session reassigned and audited successfully.");
    } catch (err: any) {
      setMessage("Error reassigning route session: " + (err?.message || String(err)));
    } finally {
      setIsReassigning(false);
    }
  }

  async function saveTruckLoadsOnStart() {
    // Save truck loads silently when starting (already validated)
    if (Object.values(truckLoads).some(q => q > 0)) {
      const saved = await saveTruckLoads();
      if (!saved) throw new Error("Truck load could not be saved, so the route was not started.");
    }
  }

  function hasTruckLoad() {
    return Object.values(truckLoads).some(q => q > 0);
  }

  const status = todaySession?.status || "pending";
  const totalLoaded = Object.values(truckLoads).reduce((sum, q) => sum + q, 0);
  const truckLoadChanged = Object.keys({ ...truckLoads, ...savedTruckLoads })
    .some((productId) => (truckLoads[productId] || 0) !== (savedTruckLoads[productId] || 0));
  const canEditTruckLoad = status === "pending" || status === "active" || status === "paused";

  // Group products by category for truck load display
  const groupedProducts = categories.length > 0
    ? categories.map(cat => ({
        ...cat,
        products: products.filter(p => p.category_id === cat.id),
      })).filter(cat => cat.products.length > 0)
    : [{ id: "all", name: "All Products", products }];

  async function loadSessionDetails(sessionId: string) {
    if (!sessionId) return;
    setDetailsLoading(true);
    setSelectedSessionId(sessionId);
    try {
      const { data: session, error: sessionError } = await supabase
        .from("route_sessions")
        .select("id, session_date")
        .eq("id", sessionId)
        .single();
      if (sessionError) throw sessionError;
      const date = session.session_date;
      setSelectedDate(date);

      const [{ data: sales, error: salesError }, { data: payments, error: paymentsError }, { data: expenses, error: expensesError }, { data: returns, error: returnsError }] =
        await Promise.all([
          supabase.from("sales").select("*, products(name, size_kg), shops(name)").eq("session_id", sessionId).is("voided_at", null).order("sold_at", { ascending: false }),
          supabase.from("payments").select("*, shops(name)").eq("session_id", sessionId).is("voided_at", null).order("paid_at", { ascending: false }),
          supabase.from("expenses").select("*").eq("session_id", sessionId).is("voided_at", null).order("spent_at", { ascending: false }),
          supabase.from("returns").select("*, products(name), shops(name)").eq("session_id", sessionId).is("voided_at", null).order("returned_at", { ascending: false }),
        ]);
      const error = salesError || paymentsError || expensesError || returnsError;
      if (error) throw error;
      setSessionDetails({ date, sales: sales || [], payments: payments || [], expenses: expenses || [], returns: returns || [] });
    } catch (err: any) {
      setMessage("Error loading details: " + err.message);
    } finally {
      setDetailsLoading(false);
    }
  }

  const includedShops = shops.filter(s => s.session_active !== false).length;

  const statusConfig: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    pending:   { bg: "bg-gray-100",   text: "text-gray-700",  dot: "bg-gray-400",  label: "Not Started" },
    active:    { bg: "bg-green-100",  text: "text-green-800", dot: "bg-green-500", label: "Active" },
    paused:    { bg: "bg-yellow-100", text: "text-yellow-800",dot: "bg-yellow-500",label: "Paused" },
    completed: { bg: "bg-blue-100",   text: "text-blue-800",  dot: "bg-blue-500",  label: "Completed" },
  };
  const sc = statusConfig[status] || statusConfig.pending;
  const headerStatusLabel = selectedDriverId ? `Today: ${sc.label}` : "Today: Select driver";

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
            onClick={() => { setSelectedDate(null); setSelectedSessionId(null); setSessionDetails(null); }}
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
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <span>Driver</span>
              <select
                value={selectedDriverId || ""}
                onChange={(event) => {
                  const driverId = event.target.value || null;
                  resetDriverSessionState();
                  setSelectedDriverId(driverId);
                  loadData(driverId).catch((error) => {
                    setMessage("Error loading driver session: " + (error?.message || String(error)));
                  });
                }}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select driver</option>
                {drivers.map((driver) => (
                  <option key={driver.auth_user_id} value={driver.auth_user_id}>
                    {driver.full_name}
                  </option>
                ))}
              </select>
            </label>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${sc.bg}`}>
              <span className={`w-2 h-2 rounded-full ${sc.dot}`} />
              <span className={`text-sm font-semibold ${sc.text}`}>{headerStatusLabel}</span>
            </div>
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
              {todaySession && (status === "pending") && (
                <button
                  onClick={() => updateStatus("active")}
                  disabled={isUpdating || (status === "pending" && !hasTruckLoad())}
                  className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  {isUpdating ? "..." : status === "completed" ? t("sessions_reopen") : t("sessions_start")}
                </button>
              )}

              {todaySession && status === "completed" && (
                <button
                  onClick={() => updateStatus("active")}
                  disabled={isUpdating || !hasTruckLoad()}
                  className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  {isUpdating ? "..." : t("sessions_reopen")}
                </button>
              )}

              {todaySession && status === "active" && (
                <button
                  onClick={() => updateStatus("paused")}
                  disabled={isUpdating}
                  className="px-6 py-2.5 bg-yellow-500 text-white rounded-xl font-semibold text-sm hover:bg-yellow-600 disabled:opacity-50"
                >
                  {isUpdating ? "..." : t("sessions_pause")}
                </button>
              )}

              {todaySession && status === "paused" && (
                <button
                  onClick={() => updateStatus("active")}
                  disabled={isUpdating}
                  className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  {isUpdating ? "..." : t("sessions_resume")}
                </button>
              )}

              {todaySession && (status === "active" || status === "paused") && (
                <button
                  onClick={() => setShowEndConfirm(true)}
                  disabled={isUpdating}
                  className="px-6 py-2.5 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700 disabled:opacity-50"
                >
                  {t("sessions_end")}
                </button>
              )}

              {false && (
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
            {!selectedDriverId ? (
              <div className="rounded-xl bg-blue-50 border border-blue-200 px-4 py-3">
                <p className="text-sm font-medium text-blue-800">Select a driver</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Choose the driver who will execute this route before creating or managing today&apos;s session.
                </p>
              </div>
            ) : status === "pending" && !hasTruckLoad() && (
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
            {selectedDriverId && canEditTruckLoad && (
              <button
                onClick={saveTruckLoads}
                disabled={savingTruckLoad || (status !== "pending" && (!truckLoadChanged || !truckLoadCorrectionReason.trim()))}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {savingTruckLoad ? "Saving..." : status === "pending" ? "Save Load" : "Save Correction"}
              </button>
            )}
          </div>

          <div className="px-6 py-4 space-y-4">
            {selectedDriverId && todaySession && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
                <span className="font-semibold text-gray-800">Session:</span>{" "}
                {todaySession.session_date} · {drivers.find((driver) => driver.auth_user_id === selectedDriverId)?.full_name || selectedDriverId}
                {status !== "pending" && status !== "completed" && (
                  <span className="block mt-1">
                    Existing products can be corrected while the route is {status}. New products and zero quantities require a pending route.
                  </span>
                )}
                {status === "completed" && (
                  <span className="block mt-1">Completed route loads are locked.</span>
                )}
              </div>
            )}
            {selectedDriverId && status !== "pending" && status !== "completed" && (
              <label className="block rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <span className="block text-sm font-medium text-amber-900">Correction reason</span>
                <input
                  value={truckLoadCorrectionReason}
                  onChange={(event) => setTruckLoadCorrectionReason(event.target.value)}
                  maxLength={500}
                  placeholder="Example: corrected Rice Flour 1KG from 10 to 8"
                  className="mt-2 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </label>
            )}
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
                      const savedQty = savedTruckLoads[product.id] || 0;
                      const changed = qty !== savedQty;
                      const sizeLabel = product.size_kg >= 1
                        ? `${product.size_kg}KG`
                        : `${Math.round(product.size_kg * 1000)}g`;

                      return (
                        <div
                          key={product.id}
                          className={`rounded-xl border p-3 flex items-center justify-between ${
                            changed ? "border-amber-300 bg-amber-50" : qty > 0 ? "border-green-200 bg-green-50" : "border-gray-200 bg-white"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs font-bold rounded">
                                {sizeLabel}
                              </span>
                              <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                            </div>
                            {(qty > 0 || savedQty > 0) && (
                              <p className={`text-xs font-bold mt-0.5 ${changed ? "text-amber-700" : "text-green-700"}`}>
                                Saved {savedQty} · Editing {qty}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                            <button
                              onClick={() => setTruckLoads(prev => ({
                                ...prev,
                                [product.id]: Math.max(0, (prev[product.id] || 0) - 1)
                              }))}
                              disabled={!canEditTruckLoad || (status !== "pending" && !(product.id in savedTruckLoads))}
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
                              disabled={!canEditTruckLoad || (status !== "pending" && !(product.id in savedTruckLoads))}
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
                    <th className="text-left px-6 py-3 text-gray-500 font-semibold">Driver</th>
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
                        <td className="px-6 py-3 text-gray-600">
                          {drivers.find((driver) => driver.auth_user_id === s.driver_id)?.full_name || s.driver_id}
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
                          <div className="flex justify-end items-center gap-3">
                            <button
                              onClick={() => loadSessionDetails(s.id)}
                              className="text-sm font-medium text-gray-900 hover:text-gray-600"
                            >
                              {t("sessions_view")}
                            </button>
                            <button
                              onClick={() => {
                                setReassignmentSession(s);
                                setReassignmentTargetDriverId("");
                                setReassignmentReason("");
                                setShowReassignConfirm(true);
                              }}
                              className="text-sm font-medium text-amber-700 hover:text-amber-900"
                            >
                              Reassign driver
                            </button>
                          </div>
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

      {showReassignConfirm && reassignmentSession && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Reassign driver</h3>
            <p className="text-sm text-gray-600 mb-4">
              This changes ownership of the selected route session. Financial and operational records remain attached to the same session.
            </p>
            <div className="space-y-3">
              <div className="text-sm">
                <span className="font-semibold text-gray-700">Current driver: </span>
                {drivers.find((driver) => driver.auth_user_id === reassignmentSession.driver_id)?.full_name || reassignmentSession.driver_id}
              </div>
              <label className="block text-sm font-medium text-gray-700">
                Target active driver
                <select
                  value={reassignmentTargetDriverId}
                  onChange={(event) => setReassignmentTargetDriverId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
                >
                  <option value="">Select driver</option>
                  {drivers
                    .filter((driver) => driver.auth_user_id !== reassignmentSession.driver_id)
                    .map((driver) => (
                      <option key={driver.auth_user_id} value={driver.auth_user_id}>
                        {driver.full_name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-gray-700">
                Reason
                <textarea
                  value={reassignmentReason}
                  onChange={(event) => setReassignmentReason(event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Explain why ownership must change"
                />
              </label>
              <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                Explicit confirmation is required. The reassignment is recorded in the corrections audit table.
              </p>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button
                onClick={() => setShowReassignConfirm(false)}
                disabled={isReassigning}
                className="px-4 py-2 border rounded-xl text-sm hover:bg-gray-50 disabled:opacity-50"
              >Cancel</button>
              <button
                onClick={reassignSession}
                disabled={isReassigning || !reassignmentTargetDriverId || !reassignmentReason.trim()}
                className="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 disabled:opacity-50"
              >{isReassigning ? "Reassigning..." : "Confirm reassignment"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
