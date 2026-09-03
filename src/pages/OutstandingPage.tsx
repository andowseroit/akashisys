import { useEffect, useState } from "react";
import { supabase } from "../db/supabase";

type OutstandingRow = { shop_id: string; shop_name: string; owner_name?: string | null; phone?: string | null; address?: string | null; is_active?: boolean; session_active?: boolean; route_order?: number; total_sold: number; total_returns: number; total_paid: number; total_settled: number; outstanding_amount: number; total_transactions: number; last_sale_at: string | null };
type TimelineEntry = { type: "sale" | "payment" | "settlement" | "return"; date: string; amount: number; detail: string };

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

  useEffect(() => { void loadData(); }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const { data: shops, error: shopsError } = await supabase.from("shops").select("id, name, owner_name, phone, address, is_active, session_active, route_order").order("name");
      if (shopsError) throw shopsError;
      const [{ data: sales, error: salesError }, { data: payments, error: paymentsError }, { data: settlements, error: settlementsError }, { data: returns, error: returnsError }] = await Promise.all([
        supabase.from("sales").select("shop_id, total_amount, quantity, unit_price, sold_at"),
        supabase.from("payments").select("shop_id, amount, paid_at, payment_type, notes"),
        supabase.from("outstanding_settlements").select("shop_id, settled_amount, settled_by, notes, settled_at"),
        supabase.from("returns").select("shop_id, quantity, unit_price, returned_at"),
      ]);
      if (salesError) throw salesError; if (paymentsError) throw paymentsError; if (settlementsError) throw settlementsError; if (returnsError) throw returnsError;
      const salesByShop = new Map<string, { totalSold: number; totalTransactions: number; lastSaleAt: string | null }>();
      const returnsByShop = new Map<string, number>(); const paymentsByShop = new Map<string, number>(); const settlementsByShop = new Map<string, number>();
      for (const sale of sales || []) { const c = salesByShop.get(sale.shop_id) || { totalSold: 0, totalTransactions: 0, lastSaleAt: null }; c.totalSold += Number(sale.total_amount ?? Number(sale.quantity || 0) * Number(sale.unit_price || 0)); c.totalTransactions++; if (!c.lastSaleAt || new Date(sale.sold_at).getTime() > new Date(c.lastSaleAt).getTime()) c.lastSaleAt = sale.sold_at; salesByShop.set(sale.shop_id, c); }
      for (const p of payments || []) paymentsByShop.set(p.shop_id, (paymentsByShop.get(p.shop_id) || 0) + Number(p.amount || 0));
      for (const r of returns || []) returnsByShop.set(r.shop_id, (returnsByShop.get(r.shop_id) || 0) + Number(r.quantity || 0) * Number(r.unit_price || 0));
      for (const s of settlements || []) settlementsByShop.set(s.shop_id, (settlementsByShop.get(s.shop_id) || 0) + Number(s.settled_amount || 0));
      const rows = (shops || []).map((shop: any): OutstandingRow => { const st = salesByShop.get(shop.id) || { totalSold: 0, totalTransactions: 0, lastSaleAt: null }; const ret = returnsByShop.get(shop.id) || 0; const paid = paymentsByShop.get(shop.id) || 0; const settled = settlementsByShop.get(shop.id) || 0; return { shop_id: shop.id, shop_name: shop.name, owner_name: shop.owner_name, phone: shop.phone, address: shop.address, is_active: shop.is_active, session_active: shop.session_active, route_order: shop.route_order, total_sold: st.totalSold, total_returns: ret, total_paid: paid, total_settled: settled, outstanding_amount: Math.max(0, st.totalSold - ret - paid), total_transactions: st.totalTransactions, last_sale_at: st.lastSaleAt }; });
      setOutstanding(rows.sort((a, b) => b.outstanding_amount - a.outstanding_amount)); setLastRefreshedAt(new Date().toISOString());
    } catch (err) { console.error("Failed to load outstanding:", err); } finally { setIsLoading(false); }
  }

  async function loadShopHistory(shopId: string) {
    setHistoryLoading(true);
    try {
      const [{ data: sales }, { data: payments }, { data: settlements }, { data: returns }] = await Promise.all([
        supabase.from("sales").select("*, products(name, size_kg)").eq("shop_id", shopId).order("sold_at", { ascending: false }).limit(50),
        supabase.from("payments").select("*").eq("shop_id", shopId).order("paid_at", { ascending: false }),
        supabase.from("outstanding_settlements").select("*").eq("shop_id", shopId).order("settled_at", { ascending: false }),
        supabase.from("returns").select("*, products(name)").eq("shop_id", shopId).order("returned_at", { ascending: false }),
      ]);
      const timeline: TimelineEntry[] = [
        ...(sales || []).map((s: any) => ({ type: "sale" as const, date: s.sold_at, amount: Number(s.total_amount || 0), detail: `${s.quantity}x ${s.products?.name || "Product"}` })),
        ...(payments || []).map((p: any) => ({ type: "payment" as const, date: p.paid_at, amount: Number(p.amount || 0), detail: `${p.payment_type || "payment"}${p.notes ? ` - ${p.notes}` : ""}` })),
        ...(settlements || []).map((s: any) => ({ type: "settlement" as const, date: s.settled_at, amount: Number(s.settled_amount || 0), detail: `Settlement${s.notes ? ` - ${s.notes}` : ""}` })),
        ...(returns || []).map((r: any) => ({ type: "return" as const, date: r.returned_at, amount: -Number((r.quantity || 0) * (r.unit_price || 0)), detail: `${r.quantity}x ${r.products?.name || "Product"} (${r.reason || "Return"})` })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setShopHistory({ timeline, settlements: settlements || [] });
    } finally { setHistoryLoading(false); }
  }

  async function handleSettle() {
    if (!selectedShop) return; const amount = Number(settlementAmount); if (!Number.isFinite(amount) || amount <= 0) return;
    setSettling(true);
    try {
      const { error } = await supabase.rpc("settle_outstanding", { p_shop_id: selectedShop.shop_id, p_amount: amount, p_note: settlementNote.trim() || null });
      if (error) throw error;
      setSettlementAmount(""); setSettlementNote(""); await loadData(); await loadShopHistory(selectedShop.shop_id);
      setSelectedShop(current => { const fresh = outstanding.find(s => s.shop_id === current?.shop_id); return fresh ? { ...fresh } : current; });
    } catch (err) { console.error("Settlement failed:", err); } finally { setSettling(false); }
  }

  function openShop(shop: OutstandingRow) { setSelectedShop(shop); setShopHistory(null); setSettlementAmount(shop.outstanding_amount.toFixed(2)); void loadShopHistory(shop.shop_id); }
  const filtered = outstanding.filter(s => (s.shop_name?.toLowerCase().includes(search.toLowerCase()) || s.owner_name?.toLowerCase().includes(search.toLowerCase())) && (filter === "all" || (filter === "outstanding" ? s.outstanding_amount > 0 : s.outstanding_amount <= 0)));
  const totalOutstanding = outstanding.reduce((sum, s) => sum + Math.max(0, s.outstanding_amount), 0); const totalShopsWithDebt = outstanding.filter(s => s.outstanding_amount > 0).length;

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><p className="text-slate-500">Loading...</p></div>;
  if (selectedShop) return <div className="min-h-screen bg-slate-50"><div className="bg-white border-b px-6 py-4 shadow-sm sticky top-0 z-10"><button onClick={() => setSelectedShop(null)} className="text-slate-500 hover:text-slate-900 text-sm mb-2">Back to all shops</button><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><h1 className="text-2xl font-bold text-slate-900">{selectedShop.shop_name}</h1><div className="flex flex-wrap gap-3 mt-1 text-sm text-slate-500">{selectedShop.owner_name && <span>{selectedShop.owner_name}</span>}{selectedShop.phone && <span>{selectedShop.phone}</span>}{selectedShop.address && <span>{selectedShop.address}</span>}</div></div><div className="text-right"><p className="text-xs text-slate-500">Current outstanding</p><p className={`text-2xl font-bold ${selectedShop.outstanding_amount > 0 ? "text-rose-700" : "text-emerald-600"}`}>LKR {selectedShop.outstanding_amount.toFixed(2)}</p></div></div></div><div className="px-6 py-4 max-w-5xl mx-auto space-y-4"><div className="grid grid-cols-1 md:grid-cols-5 gap-3">{[{label:"Net Sold",value:`LKR ${selectedShop.total_sold.toFixed(2)}`},{label:"Returns",value:`LKR ${selectedShop.total_returns.toFixed(2)}`},{label:"Total Paid",value:`LKR ${selectedShop.total_paid.toFixed(2)}`},{label:"Outstanding",value:`LKR ${selectedShop.outstanding_amount.toFixed(2)}`},{label:"Last Sale",value:selectedShop.last_sale_at ? new Date(selectedShop.last_sale_at).toLocaleDateString() : "Never"}].map(c=><div key={c.label} className="bg-white rounded-xl border p-4 shadow-sm"><p className="text-xs text-slate-500 mb-1">{c.label}</p><p className="font-bold text-sm text-slate-900">{c.value}</p></div>)}</div>{selectedShop.outstanding_amount > 0 && <div className="bg-white rounded-xl border p-4 shadow-sm"><h3 className="font-semibold text-slate-900 mb-3">Record Settlement</h3><div className="grid gap-3 sm:grid-cols-4"><input type="number" min="0.01" step="0.01" max={selectedShop.outstanding_amount} className="w-full h-10 px-3 border rounded-lg text-sm" value={settlementAmount} onChange={e=>setSettlementAmount(e.target.value)}/><input type="text" maxLength={500} className="w-full h-10 px-3 border rounded-lg text-sm" value={settlementNote} onChange={e=>setSettlementNote(e.target.value)} placeholder="Notes (optional)"/><button onClick={handleSettle} disabled={settling || !settlementAmount} className="h-10 rounded-lg bg-rose-600 px-4 text-sm font-medium text-white disabled:opacity-50">{settling ? "Saving..." : "Record Settlement"}</button><button onClick={()=>setSettlementAmount(selectedShop.outstanding_amount.toFixed(2))} className="h-10 rounded-lg border px-4 text-sm font-medium">Full amount</button></div></div>}<div className="bg-white rounded-xl border overflow-hidden shadow-sm"><div className="px-4 py-3 border-b bg-slate-50"><h2 className="font-semibold text-slate-900">Full Transaction History</h2></div>{historyLoading?<div className="p-8 text-center text-slate-500 text-sm">Loading history...</div>:!shopHistory?.timeline.length?<div className="p-8 text-center text-slate-500 text-sm">No transactions yet</div>:<div className="divide-y max-h-[60vh] overflow-y-auto">{shopHistory.timeline.map((e,i)=><div key={`${e.type}-${e.date}-${i}`} className="px-4 py-3 flex justify-between"><div><span className="text-xs font-medium uppercase">{e.type}</span><p className="text-sm text-slate-800">{e.detail}</p><p className="text-xs text-slate-400">{new Date(e.date).toLocaleString()}</p></div><span className="font-semibold text-sm">{e.type === "sale" ? "+" : "-"} LKR {Math.abs(e.amount).toFixed(2)}</span></div>)}</div>}</div></div></div>;

  return <div className="min-h-screen bg-slate-50"><div className="bg-white border-b px-6 py-6 shadow-sm"><h1 className="text-3xl font-bold text-slate-900">Outstanding Balances</h1><div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-500"><span>Total outstanding: <b className="text-rose-600">LKR {totalOutstanding.toFixed(2)}</b></span><span>·</span><span>Shops with debt: <b>{totalShopsWithDebt}</b></span><span>·</span><span>{lastRefreshedAt ? `Refreshed ${new Date(lastRefreshedAt).toLocaleString()}` : "Refreshes on load"}</span></div></div><div className="px-6 py-6 max-w-6xl mx-auto space-y-4"><div className="flex flex-col gap-3 sm:flex-row"><input type="text" placeholder="Search shop or owner..." className="flex-1 h-12 rounded-3xl border bg-white px-4 text-sm" value={search} onChange={e=>setSearch(e.target.value)}/><div className="flex gap-2">{(["all","outstanding","settled"] as const).map(f=><button key={f} onClick={()=>setFilter(f)} className={`h-12 rounded-3xl px-5 text-sm font-semibold capitalize ${filter===f?"bg-slate-900 text-white":"bg-white border text-slate-700"}`}>{f}</button>)}</div></div><div className="bg-white rounded-xl border overflow-hidden shadow-sm"><div className="divide-y">{filtered.map(s=><button key={s.shop_id} onClick={()=>openShop(s)} className="w-full text-left px-4 py-4 flex items-center justify-between hover:bg-slate-50"><div><p className="font-semibold text-slate-900">{s.shop_name}</p><p className="text-xs text-slate-500">{s.owner_name || ""} · {s.total_transactions} transactions</p></div><div className="text-right"><p className={`font-bold ${s.outstanding_amount>0?"text-rose-700":"text-emerald-600"}`}>LKR {s.outstanding_amount.toFixed(2)}</p><p className="text-xs text-slate-400">{s.outstanding_amount>0?"Outstanding":"Settled"}</p></div></button>)}{filtered.length===0&&<div className="p-10 text-center text-slate-500 text-sm">No matching shops.</div>}</div></div></div></div>;
}
