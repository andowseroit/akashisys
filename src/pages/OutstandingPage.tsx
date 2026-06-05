import { useEffect, useState } from "react";
import { supabase } from "../db/supabase";

type OutstandingRow = {
  shop_id: string;
  shop_name: string;
  owner_name?: string | null;
  phone?: string | null;
  address?: string | null;
  is_active?: boolean;
  session_active?: boolean;
  route_order?: number;
  total_sold: number;
  total_returns: number;
  total_paid: number;
  total_settled: number;
  outstanding_amount: number;
  total_transactions: number;
  last_sale_at: string | null;
};

type TimelineEntry = {
  type: "sale" | "payment" | "settlement" | "return";
  date: string;
  amount: number;
  detail: string;
};

export default function OutstandingPage() {
  const [outstanding, setOutstanding] = useState<OutstandingRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [selectedShop, setSelectedShop] = useState<OutstandingRow | null>(null);
  const [shopHistory, setShopHistory] = useState<{ timeline: TimelineEntry[]; settlements: any[] } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "outstanding" | "settled">("all");
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementNote, setSettlementNote] = useState("");
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const { data: shops, error: shopsError } = await supabase
        .from("shops")
        .select("id, name, owner_name, phone, address, is_active, session_active, route_order")
        .order("name");
      if (shopsError) throw shopsError;

      const [
        { data: sales, error: salesError },
        { data: payments, error: paymentsError },
        { data: settlements, error: settlementsError },
        { data: returns, error: returnsError },
      ] = await Promise.all([
        supabase.from("sales").select("shop_id, total_amount, quantity, unit_price, sold_at"),
        supabase.from("payments").select("shop_id, amount, paid_at, payment_type, notes"),
        supabase.from("outstanding_settlements").select("shop_id, settled_amount, settled_by, notes, settled_at"),
        supabase.from("returns").select("shop_id, quantity, unit_price, returned_at"),
      ]);

      if (salesError) throw salesError;
      if (paymentsError) throw paymentsError;
      if (settlementsError) throw settlementsError;
      if (returnsError) throw returnsError;

      const salesByShop = new Map<string, { totalSold: number; totalTransactions: number; lastSaleAt: string | null }>();
      const returnsByShop = new Map<string, { totalReturns: number }>();
      const paymentsByShop = new Map<string, { totalPaid: number }>();
      const settlementsByShop = new Map<string, { totalSettled: number }>();

      for (const sale of sales || []) {
        const key = sale.shop_id;
        const current = salesByShop.get(key) || { totalSold: 0, totalTransactions: 0, lastSaleAt: null };
        current.totalSold += Number(sale.total_amount ?? Number(sale.quantity || 0) * Number(sale.unit_price || 0));
        current.totalTransactions += 1;
        if (!current.lastSaleAt || new Date(sale.sold_at).getTime() > new Date(current.lastSaleAt).getTime()) {
          current.lastSaleAt = sale.sold_at;
        }
        salesByShop.set(key, current);
      }

      for (const payment of payments || []) {
        const key = payment.shop_id;
        const current = paymentsByShop.get(key) || { totalPaid: 0 };
        current.totalPaid += Number(payment.amount || 0);
        paymentsByShop.set(key, current);
      }

      for (const returned of returns || []) {
        const key = returned.shop_id;
        const current = returnsByShop.get(key) || { totalReturns: 0 };
        current.totalReturns += Number(returned.quantity || 0) * Number(returned.unit_price || 0);
        returnsByShop.set(key, current);
      }

      for (const settlement of settlements || []) {
        const key = settlement.shop_id;
        const current = settlementsByShop.get(key) || { totalSettled: 0 };
        current.totalSettled += Number(settlement.settled_amount || 0);
        settlementsByShop.set(key, current);
      }

      const rows: OutstandingRow[] = (shops || []).map((shop: any) => {
        const salesTotals = salesByShop.get(shop.id) || { totalSold: 0, totalTransactions: 0, lastSaleAt: null };
        const returnTotals = returnsByShop.get(shop.id) || { totalReturns: 0 };
        const paymentTotals = paymentsByShop.get(shop.id) || { totalPaid: 0 };
        const settlementTotals = settlementsByShop.get(shop.id) || { totalSettled: 0 };
        const netSold = Math.max(0, salesTotals.totalSold - returnTotals.totalReturns);
        const outstandingAmount = Math.max(0, netSold - paymentTotals.totalPaid);

        return {
          shop_id: shop.id,
          shop_name: shop.name,
          owner_name: shop.owner_name,
          phone: shop.phone,
          address: shop.address,
          is_active: shop.is_active,
          session_active: shop.session_active,
          route_order: shop.route_order,
          total_sold: netSold,
          total_returns: returnTotals.totalReturns,
          total_paid: paymentTotals.totalPaid,
          total_settled: settlementTotals.totalSettled,
          outstanding_amount: outstandingAmount,
          total_transactions: salesTotals.totalTransactions,
          last_sale_at: salesTotals.lastSaleAt,
        };
      });

      setOutstanding(rows.sort((a, b) => b.outstanding_amount - a.outstanding_amount));
      setLastRefreshedAt(new Date().toISOString());
    } catch (err) {
      console.error("Failed to load outstanding:", err);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadShopHistory(shopId: string) {
    setHistoryLoading(true);
    try {
      const [
        { data: sales },
        { data: payments },
        { data: settlements },
        { data: returns },
      ] = await Promise.all([
        supabase
          .from("sales")
          .select("*, products(name, size_kg)")
          .eq("shop_id", shopId)
          .order("sold_at", { ascending: false })
          .limit(50),
        supabase
          .from("payments")
          .select("*")
          .eq("shop_id", shopId)
          .order("paid_at", { ascending: false }),
        supabase
          .from("outstanding_settlements")
          .select("*")
          .eq("shop_id", shopId)
          .order("settled_at", { ascending: false }),
        supabase
          .from("returns")
          .select("*, products(name)")
          .eq("shop_id", shopId)
          .order("returned_at", { ascending: false }),
      ]);

      const timeline: TimelineEntry[] = [
        ...(sales || []).map((s: any) => ({
          type: "sale" as const,
          date: s.sold_at,
          amount: Number(s.total_amount || 0),
          detail: `${s.quantity}x ${s.products?.name || "Product"}`,
        })),
        ...(payments || []).map((p: any) => ({
          type: "payment" as const,
          date: p.paid_at,
          amount: Number(p.amount || 0),
          detail: `${p.payment_type || "payment"}${p.notes ? ` - ${p.notes}` : ""}`,
        })),
        ...(settlements || []).map((st: any) => ({
          type: "settlement" as const,
          date: st.settled_at,
          amount: Number(st.settled_amount || 0),
          detail: `Settled by ${st.settled_by}${st.notes ? ` - ${st.notes}` : ""}`,
        })),
        ...(returns || []).map((r: any) => ({
          type: "return" as const,
          date: r.returned_at,
          amount: -Number((r.quantity || 0) * (r.unit_price || 0)),
          detail: `${r.quantity}x ${r.products?.name || "Product"} (${r.reason})`,
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setShopHistory({ timeline, settlements: settlements || [] });
    } catch (err) {
      console.error("Failed to load shop history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleSettle() {
    if (!selectedShop || !settlementAmount || parseFloat(settlementAmount) <= 0) return;

    setSettling(true);
    try {
      const amount = parseFloat(settlementAmount);

      await supabase.from("outstanding_settlements").insert({
        shop_id: selectedShop.shop_id,
        settled_amount: amount,
        settled_by: "admin",
        notes: settlementNote || null,
        settled_at: new Date().toISOString(),
      });

      await supabase.from("payments").insert({
        shop_id: selectedShop.shop_id,
        amount,
        payment_type: "outstanding",
        notes: `Settlement: ${settlementNote || "Manual settlement by admin"}`,
        paid_at: new Date().toISOString(),
        synced: true,
      });

      setSettlementAmount("");
      setSettlementNote("");
      await loadData();
      await loadShopHistory(selectedShop.shop_id);
      setSelectedShop((current) => {
        if (!current) return current;
        return {
          ...current,
          outstanding_amount: Math.max(0, current.outstanding_amount - amount),
        };
      });
    } catch (err) {
      console.error("Settlement failed:", err);
    } finally {
      setSettling(false);
    }
  }

  function openShop(shop: OutstandingRow) {
    setSelectedShop(shop);
    setShopHistory(null);
    setSettlementAmount(Math.max(0, shop.outstanding_amount || 0).toFixed(2));
    loadShopHistory(shop.shop_id);
  }

  const filtered = outstanding.filter((s) => {
    const matchSearch =
      s.shop_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.owner_name?.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === "all" ? true : filter === "outstanding" ? s.outstanding_amount > 0 : s.outstanding_amount <= 0;
    return matchSearch && matchFilter;
  });

  const totalOutstanding = outstanding.reduce((sum, s) => sum + Math.max(0, s.outstanding_amount), 0);
  const totalShopsWithDebt = outstanding.filter((s) => s.outstanding_amount > 0).length;

  const typeConfig: Record<string, { label: string; bg: string; text: string; sign: string }> = {
    sale: { label: "Sale", bg: "bg-blue-100", text: "text-blue-700", sign: "+" },
    payment: { label: "Payment", bg: "bg-green-100", text: "text-green-700", sign: "-" },
    settlement: { label: "Settled", bg: "bg-purple-100", text: "text-purple-700", sign: "-" },
    return: { label: "Return", bg: "bg-orange-100", text: "text-orange-700", sign: "-" },
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500">Loading...</p>
      </div>
    );
  }

  if (selectedShop) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="bg-white border-b px-6 py-4 shadow-sm sticky top-0 z-10">
          <button
            onClick={() => setSelectedShop(null)}
            className="text-slate-500 hover:text-slate-900 text-sm mb-2 flex items-center gap-1"
          >
            Back to all shops
          </button>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{selectedShop.shop_name}</h1>
              <div className="flex flex-wrap gap-3 mt-1 text-sm text-slate-500">
                {selectedShop.owner_name && <span>{selectedShop.owner_name}</span>}
                {selectedShop.phone && <span>{selectedShop.phone}</span>}
                {selectedShop.address && <span>{selectedShop.address}</span>}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">Current outstanding</p>
              <p className={`text-2xl font-bold ${selectedShop.outstanding_amount > 0 ? "text-rose-700" : "text-emerald-600"}`}>
                LKR {selectedShop.outstanding_amount.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 max-w-5xl mx-auto space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {[
              { label: "Net Sold", value: `LKR ${selectedShop.total_sold.toFixed(2)}`, color: "text-slate-900" },
              { label: "Returns", value: `LKR ${(selectedShop.total_returns || 0).toFixed(2)}`, color: "text-orange-600" },
              { label: "Total Paid", value: `LKR ${selectedShop.total_paid.toFixed(2)}`, color: "text-slate-900" },
              {
                label: "Outstanding",
                value: `LKR ${selectedShop.outstanding_amount.toFixed(2)}`,
                color: selectedShop.outstanding_amount > 0 ? "text-rose-700" : "text-emerald-600",
              },
              {
                label: "Last Sale",
                value: selectedShop.last_sale_at ? new Date(selectedShop.last_sale_at).toLocaleDateString() : "Never",
                color: "text-slate-700",
              },
            ].map((card) => (
              <div key={card.label} className="bg-white rounded-xl border p-4 shadow-sm">
                <p className="text-xs text-slate-500 mb-1">{card.label}</p>
                <p className={`font-bold text-sm ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>

          {selectedShop.outstanding_amount > 0 && (
            <div className="bg-white rounded-xl border p-4 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-3">Record Settlement</h3>
              <div className="grid gap-3 sm:grid-cols-4">
                <input
                  type="number"
                  placeholder="Amount (LKR)"
                  className="w-full min-w-0 h-10 px-3 border rounded-lg text-sm"
                  value={settlementAmount}
                  onChange={(e) => setSettlementAmount(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Notes (optional)"
                  className="w-full min-w-0 h-10 px-3 border rounded-lg text-sm"
                  value={settlementNote}
                  onChange={(e) => setSettlementNote(e.target.value)}
                />
                <button
                  onClick={handleSettle}
                  disabled={settling || !settlementAmount}
                  className="h-10 rounded-lg bg-rose-600 px-4 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {settling ? "Saving..." : "Record Settlement"}
                </button>
                <button
                  onClick={() => setSettlementAmount(selectedShop.outstanding_amount.toFixed(2))}
                  className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Full amount
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b bg-slate-50">
              <h2 className="font-semibold text-slate-900">Full Transaction History</h2>
            </div>
            {historyLoading ? (
              <div className="p-8 text-center text-slate-500 text-sm">Loading history...</div>
            ) : !shopHistory?.timeline?.length ? (
              <div className="p-8 text-center text-slate-500 text-sm">No transactions yet</div>
            ) : (
              <div className="divide-y max-h-[60vh] overflow-y-auto">
                {shopHistory.timeline.map((entry, idx) => {
                  const cfg = typeConfig[entry.type];
                  return (
                    <div key={idx} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                          {cfg.label}
                        </span>
                        <div>
                          <p className="text-sm text-slate-800">{entry.detail}</p>
                          <p className="text-xs text-slate-400">
                            {new Date(entry.date).toLocaleString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span
                          className={`font-semibold text-sm ${
                            entry.type === "sale" ? "text-rose-600" : entry.type === "return" ? "text-orange-600" : "text-emerald-600"
                          }`}
                        >
                          {cfg.sign} LKR {Math.abs(entry.amount || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {shopHistory && shopHistory.settlements.length > 0 && (
            <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b bg-slate-50">
                <h2 className="font-semibold text-slate-900">Settlement Records</h2>
              </div>
              <div className="divide-y">
                {shopHistory.settlements.map((s: any) => (
                  <div key={s.id} className="px-4 py-3 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        Settled - LKR {Number(s.settled_amount || 0).toFixed(2)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(s.settled_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                        {s.notes && ` - ${s.notes}`}
                      </p>
                    </div>
                    <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
                      by {s.settled_by}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b px-6 py-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Outstanding Balances</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full bg-slate-900 px-2.5 py-1 font-semibold text-white">Cloud view</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
                {lastRefreshedAt ? `Refreshed ${new Date(lastRefreshedAt).toLocaleString()}` : "Refreshes on load"}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-slate-500">
          <span>
            Total outstanding: <span className="font-semibold text-rose-600">LKR {totalOutstanding.toFixed(2)}</span>
          </span>
          <span>
            Shops with debt: <span className="font-semibold text-slate-900">{totalShopsWithDebt}</span>
          </span>
        </div>
      </div>

      <div className="px-6 py-6 max-w-6xl mx-auto space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="text"
            placeholder="Search shop or owner..."
            className="w-full min-w-0 h-12 rounded-3xl border border-slate-300 bg-white px-4 text-sm text-slate-700 shadow-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex gap-2 flex-wrap">
            {(["all", "outstanding", "settled"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`h-12 rounded-3xl px-5 text-sm font-semibold capitalize transition ${
                  filter === f ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-300 hover:bg-slate-100"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {filtered.map((shop) => {
            const balance = Math.max(0, shop.outstanding_amount || 0);
            const isDebt = balance > 0;
            return (
              <div
                key={shop.shop_id}
                className={`rounded-3xl border p-5 bg-white shadow-sm ${isDebt ? "border-rose-100" : "border-slate-200"}`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex h-10 min-w-[40px] items-center justify-center rounded-full text-sm font-semibold ${
                          isDebt ? "bg-rose-100 text-rose-700" : "bg-slate-900 text-white"
                        }`}
                      >
                        {isDebt ? "!!" : "OK"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-lg font-semibold text-slate-900 truncate">{shop.shop_name || "Unnamed shop"}</p>
                        <p className="mt-1 text-sm text-slate-500 truncate">
                          {shop.owner_name || "Owner unavailable"} - {shop.address || "Location unavailable"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>{shop.total_transactions || 0} transactions</span>
                      {shop.last_sale_at && <span>Last sale: {new Date(shop.last_sale_at).toLocaleDateString()}</span>}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 items-start sm:items-end text-right">
                    <div>
                      <p className={`text-2xl font-bold ${isDebt ? "text-rose-700" : "text-slate-900"}`}>
                        LKR {balance.toFixed(2)}
                      </p>
                      <p className="text-xs text-slate-400">Sold: LKR {shop.total_sold.toFixed(2)}</p>
                    </div>
                    <button
                      onClick={() => openShop(shop)}
                      className={`rounded-3xl px-5 py-3 text-sm font-semibold text-white ${
                        isDebt ? "bg-rose-700 hover:bg-rose-800" : "bg-slate-900 hover:bg-slate-800"
                      }`}
                    >
                      Record Collection
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              No shops found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
