import { useEffect, useState } from "react";
import { supabase } from "../db/supabase";

const COLOMBO_OFFSET = "+05:30";
const todayInColombo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const rangeFor = (date: string) => ({ start: `${date}T00:00:00${COLOMBO_OFFSET}`, end: `${date}T23:59:59.999${COLOMBO_OFFSET}` });

type Shop = { id: string; name: string };
type Product = { id: string; name: string; price_per_unit: number };
type Row = Record<string, any>;

export default function CorrectionsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [shopId, setShopId] = useState("");
  const [date, setDate] = useState(todayInColombo());
  const [reason, setReason] = useState("");
  const [saleProduct, setSaleProduct] = useState("");
  const [saleQty, setSaleQty] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentType, setPaymentType] = useState("partial");
  const [records, setRecords] = useState<{ sales: Row[]; payments: Row[]; returns: Row[] }>({ sales: [], payments: [], returns: [] });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { void loadMasterData(); }, []);

  async function loadMasterData() {
    const [{ data: shopsData, error: shopsError }, { data: productsData, error: productsError }] = await Promise.all([
      supabase.from("shops").select("id,name").eq("is_active", true).order("name"),
      supabase.from("products").select("id,name,price_per_unit").eq("is_active", true).order("name"),
    ]);
    const error = shopsError || productsError;
    if (error) { setMessage(`Error: ${error.message}`); return; }
    setShops((shopsData || []) as Shop[]);
    setProducts((productsData || []) as Product[]);
  }

  async function loadRecords() {
    if (!shopId) return;
    setLoading(true);
    try {
      const { start, end } = rangeFor(date);
      const [{ data: sales, error: salesError }, { data: payments, error: paymentsError }, { data: returns, error: returnsError }] = await Promise.all([
        supabase.from("sales").select("*,products(name,size_kg)").eq("shop_id", shopId).gte("sold_at", start).lte("sold_at", end).order("sold_at", { ascending: false }),
        supabase.from("payments").select("*").eq("shop_id", shopId).gte("paid_at", start).lte("paid_at", end).order("paid_at", { ascending: false }),
        supabase.from("returns").select("*,products(name)").eq("shop_id", shopId).gte("returned_at", start).lte("returned_at", end).order("returned_at", { ascending: false }),
      ]);
      const error = salesError || paymentsError || returnsError;
      if (error) throw error;
      setRecords({ sales: sales || [], payments: payments || [], returns: returns || [] });
    } catch (error: any) { setMessage(`Error: ${error.message}`); }
    finally { setLoading(false); }
  }

  async function voidRecord(kind: "sales" | "payments" | "returns", id: string) {
    if (!reason.trim()) { setMessage("Enter a correction reason first."); return; }
    if (!confirm(`Void this ${kind.slice(0, -1)}? The correction will be audited.`)) return;
    const rpc = kind === "sales" ? "admin_void_sale" : kind === "payments" ? "admin_void_payment" : "admin_void_return";
    const args = kind === "sales" ? { p_sale_id: id, p_reason: reason.trim() } : kind === "payments" ? { p_payment_id: id, p_reason: reason.trim() } : { p_return_id: id, p_reason: reason.trim() };
    const { error } = await supabase.rpc(rpc, args);
    if (error) { setMessage(`Error: ${error.message}`); return; }
    setReason(""); setMessage(`${kind} record voided and audited.`); await loadRecords();
  }

  async function addSale() {
    const quantity = Number.parseInt(saleQty, 10);
    if (!shopId || !saleProduct || !Number.isInteger(quantity) || quantity <= 0 || !reason.trim()) { setMessage("Select product, enter a positive quantity, and provide a reason."); return; }
    const { data, error } = await supabase.rpc("admin_add_sale_correction", { p_shop_id: shopId, p_product_id: saleProduct, p_quantity: quantity, p_sold_at: new Date(`${date}T12:00:00${COLOMBO_OFFSET}`).toISOString(), p_reason: reason.trim() });
    if (error) { setMessage(`Error: ${error.message}`); return; }
    setSaleProduct(""); setSaleQty(""); setReason(""); setMessage(`Missing sale added and audited (${data}).`); await loadRecords();
  }

  async function addPayment() {
    const amount = Number.parseFloat(paymentAmount);
    if (!shopId || !Number.isFinite(amount) || amount <= 0 || !reason.trim()) { setMessage("Enter a positive payment amount and provide a reason."); return; }
    const { data, error } = await supabase.rpc("admin_add_payment_correction", { p_shop_id: shopId, p_amount: amount, p_payment_type: paymentType, p_paid_at: new Date(`${date}T12:00:00${COLOMBO_OFFSET}`).toISOString(), p_reason: reason.trim() });
    if (error) { setMessage(`Error: ${error.message}`); return; }
    setPaymentAmount(""); setReason(""); setMessage(`Missing payment added and audited (${data}).`); await loadRecords();
  }

  const RecordList = ({ title, kind, rows }: { title: string; kind: "sales" | "payments" | "returns"; rows: Row[] }) => (
    <section className="bg-white rounded-xl border overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50"><h2 className="font-semibold">{title} ({rows.length})</h2></div>
      {rows.length === 0 ? <p className="p-4 text-sm text-gray-500">No records for this shop/date.</p> : rows.map(row => (
        <div key={row.id} className="px-4 py-3 border-b last:border-b-0 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{kind === "payments" ? `LKR ${Number(row.amount).toFixed(2)} — ${row.payment_type || "partial"}` : `${row.products?.name || "Product"} × ${row.quantity}`}</p>
            <p className="text-xs text-gray-400">{kind === "sales" ? `LKR ${Number(row.total_amount ?? row.quantity * row.unit_price).toFixed(2)}` : kind === "returns" ? `Loss LKR ${Number(row.total_loss ?? row.quantity * row.unit_price).toFixed(2)}` : new Date(row.paid_at).toLocaleTimeString()}</p>
          </div>
          <button onClick={() => void voidRecord(kind, row.id)} className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-xs rounded-lg">Void</button>
        </div>
      ))}
    </section>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-5 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Corrections & Adjustments</h1>
        <p className="text-sm text-gray-500 mt-1">Existing financial records are voided instead of directly edited. Every correction is audited.</p>
      </div>
      <div className="px-6 py-4 max-w-5xl mx-auto space-y-4">
        {message && <div className="p-3 rounded-lg text-sm bg-white border">{message}<button onClick={() => setMessage("")} className="ml-3 font-bold">×</button></div>}
        <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
          <div className="flex-1 min-w-48"><label className="text-xs text-gray-500 block mb-1">Shop</label><select className="w-full h-10 px-3 border rounded-lg text-sm" value={shopId} onChange={e => setShopId(e.target.value)}><option value="">Select shop...</option>{shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label className="text-xs text-gray-500 block mb-1">Business date</label><input type="date" className="h-10 px-3 border rounded-lg text-sm" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div className="flex items-end"><button onClick={() => void loadRecords()} disabled={!shopId || loading} className="h-10 px-5 bg-black text-white rounded-lg text-sm disabled:opacity-40">{loading ? "Loading..." : "Load Records"}</button></div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4"><label className="text-sm font-medium text-yellow-800 block mb-1">Correction reason (required)</label><input value={reason} onChange={e => setReason(e.target.value)} placeholder="Driver entered wrong quantity, duplicate entry..." className="w-full h-10 px-3 border border-yellow-300 rounded-lg text-sm" /></div>
        <RecordList title="Sales" kind="sales" rows={records.sales} />
        <RecordList title="Payments" kind="payments" rows={records.payments} />
        <RecordList title="Returns" kind="returns" rows={records.returns} />
        {shopId && <section className="bg-white rounded-xl border p-4 space-y-5">
          <h2 className="font-semibold">Add Missing Record</h2>
          <div><p className="text-sm font-medium mb-2">Missed sale</p><div className="flex gap-2 flex-wrap"><select value={saleProduct} onChange={e => setSaleProduct(e.target.value)} className="flex-1 min-w-48 h-10 px-3 border rounded-lg text-sm"><option value="">Select product...</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} — LKR {Number(p.price_per_unit).toFixed(2)}</option>)}</select><input value={saleQty} onChange={e => setSaleQty(e.target.value)} type="number" min="1" step="1" placeholder="Qty" className="h-10 w-24 px-3 border rounded-lg text-sm" /><button onClick={() => void addSale()} className="h-10 px-4 bg-black text-white rounded-lg text-sm">Add Sale</button></div></div>
          <div><p className="text-sm font-medium mb-2">Missed payment</p><div className="flex gap-2 flex-wrap"><input value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} type="number" min="0.01" step="0.01" placeholder="Amount" className="h-10 w-36 px-3 border rounded-lg text-sm" /><select value={paymentType} onChange={e => setPaymentType(e.target.value)} className="h-10 px-3 border rounded-lg text-sm"><option value="partial">Partial</option><option value="full">Full</option><option value="outstanding">Outstanding</option></select><button onClick={() => void addPayment()} className="h-10 px-4 bg-black text-white rounded-lg text-sm">Add Payment</button></div></div>
        </section>}
      </div>
    </div>
  );
}
