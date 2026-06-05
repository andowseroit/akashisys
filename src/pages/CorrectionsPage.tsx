import { useState, useEffect } from "react";
import { supabase } from "../db/supabase";

export default function CorrectionsPage() {
  const [shops, setShops] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedShop, setSelectedShop] = useState("");
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split("T")[0]);
  const [records, setRecords] = useState<{ sales: any[]; payments: any[]; returns: any[] }>({
    sales: [], payments: [], returns: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editValues, setEditValues] = useState<any>({});
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => { loadShopsAndProducts(); }, []);

  async function loadShopsAndProducts() {
    const [{ data: s }, { data: p }] = await Promise.all([
      supabase.from("shops").select("id, name").eq("is_active", true).order("name"),
      supabase.from("products").select("id, name, price_per_unit").eq("is_active", true),
    ]);
    setShops(s || []);
    setProducts(p || []);
  }

  async function loadRecords() {
    if (!selectedShop) return;
    setIsLoading(true);
    try {
      const start = `${dateFilter}T00:00:00`;
      const end = `${dateFilter}T23:59:59`;

      const [{ data: sales }, { data: payments }, { data: returns }] = await Promise.all([
        supabase.from("sales").select("*, products(name, size_kg)")
          .eq("shop_id", selectedShop).gte("sold_at", start).lte("sold_at", end),
        supabase.from("payments").select("*")
          .eq("shop_id", selectedShop).gte("paid_at", start).lte("paid_at", end),
        supabase.from("returns").select("*, products(name)")
          .eq("shop_id", selectedShop).gte("returned_at", start).lte("returned_at", end),
      ]);

      setRecords({ sales: sales || [], payments: payments || [], returns: returns || [] });
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(table: string, record: any) {
    if (!reason.trim()) { setMessage("Please enter a reason before deleting."); return; }
    if (!confirm(`Delete this ${table} record? This will affect balances.`)) return;

    try {
      // Log correction
      await supabase.from("corrections").insert({
        table_name: table,
        record_id: record.id,
        action: "delete",
        old_values: record,
        corrected_by: "admin",
        reason,
      });
      // Delete record
      await supabase.from(table).delete().eq("id", record.id);
      setMessage(`Deleted successfully and logged.`);
      setReason("");
      await loadRecords();
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    }
  }

  async function handleEdit(table: string, record: any) {
    if (!reason.trim()) { setMessage("Please enter a reason before editing."); return; }
    try {
      // Log correction
      await supabase.from("corrections").insert({
        table_name: table,
        record_id: record.id,
        action: "edit",
        old_values: record,
        new_values: editValues,
        corrected_by: "admin",
        reason,
      });
      // Update record
      await supabase.from(table).update(editValues).eq("id", record.id);
      setMessage("Updated successfully and logged.");
      setEditingRecord(null);
      setEditValues({});
      setReason("");
      await loadRecords();
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    }
  }

  async function handleAddSale() {
    if (!selectedShop || !reason.trim()) {
      setMessage("Select a shop and enter a reason first.");
      return;
    }
    const productId = editValues.product_id;
    const quantity = parseInt(editValues.quantity);
    const product = products.find(p => p.id === productId);
    if (!product || !quantity) { setMessage("Select product and quantity."); return; }

    try {
      const { data: newSale } = await supabase.from("sales").insert({
        shop_id: selectedShop,
        product_id: productId,
        quantity,
        unit_price: product.price_per_unit,
        sold_at: `${dateFilter}T12:00:00`,
        synced: true,
      }).select().single();

      await supabase.from("corrections").insert({
        table_name: "sales",
        record_id: newSale?.id,
        action: "add",
        new_values: newSale,
        corrected_by: "admin",
        reason,
      });
      setMessage("Sale added and logged.");
      setEditValues({});
      setReason("");
      await loadRecords();
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    }
  }

  async function handleAddPayment() {
    if (!selectedShop || !reason.trim()) {
      setMessage("Select a shop and enter a reason first.");
      return;
    }
    const amount = parseFloat(editValues.amount);
    if (!amount) { setMessage("Enter a valid amount."); return; }

    try {
      const { data: newPayment } = await supabase.from("payments").insert({
        shop_id: selectedShop,
        amount,
        payment_type: editValues.payment_type || "partial",
        notes: reason,
        paid_at: `${dateFilter}T12:00:00`,
        synced: true,
      }).select().single();

      await supabase.from("corrections").insert({
        table_name: "payments",
        record_id: newPayment?.id,
        action: "add",
        new_values: newPayment,
        corrected_by: "admin",
        reason,
      });
      setMessage("Payment added and logged.");
      setEditValues({});
      setReason("");
      await loadRecords();
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-5 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Corrections & Adjustments</h1>
        <p className="text-sm text-gray-500 mt-1">Edit or delete driver entries. All changes are logged.</p>
      </div>

      <div className="px-6 py-4 max-w-5xl mx-auto space-y-4">
        {message && (
          <div className={`p-3 rounded-lg text-sm font-medium ${
            message.startsWith("Error") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
          }`}>
            {message}
            <button onClick={() => setMessage("")} className="ml-2 font-bold">×</button>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
          <div className="flex-1 min-w-40">
            <label className="text-xs text-gray-500 block mb-1">Shop</label>
            <select
              className="w-full h-10 px-3 border rounded-lg text-sm"
              value={selectedShop}
              onChange={e => setSelectedShop(e.target.value)}
            >
              <option value="">Select shop...</option>
              {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Date</label>
            <input
              type="date"
              className="h-10 px-3 border rounded-lg text-sm"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={loadRecords}
              disabled={!selectedShop}
              className="h-10 px-5 bg-black text-white rounded-lg text-sm font-medium disabled:opacity-40"
            >
              Load Records
            </button>
          </div>
        </div>

        {/* Reason input — required for all actions */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <label className="text-sm font-medium text-yellow-800 block mb-1">
            Reason for correction (required for all actions)
          </label>
          <input
            type="text"
            placeholder="e.g. Driver entered wrong quantity, duplicate entry..."
            className="w-full h-10 px-3 border border-yellow-300 rounded-lg text-sm"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>

        {isLoading && <p className="text-center text-gray-500 text-sm py-4">Loading...</p>}

        {/* Sales records */}
        {records.sales.length > 0 && (
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-blue-50">
              <h2 className="font-semibold text-blue-800">Sales ({records.sales.length})</h2>
            </div>
            <div className="divide-y">
              {records.sales.map(sale => (
                <div key={sale.id} className="px-4 py-3">
                  {editingRecord?.id === sale.id ? (
                    <div className="space-y-2">
                      <div className="flex gap-2 flex-wrap">
                        <div>
                          <label className="text-xs text-gray-500">Quantity</label>
                          <input
                            type="number"
                            defaultValue={sale.quantity}
                            className="block h-9 w-24 px-2 border rounded text-sm"
                            onChange={e => setEditValues((v: any) => ({ ...v, quantity: parseInt(e.target.value) }))}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Unit Price</label>
                          <input
                            type="number"
                            defaultValue={sale.unit_price}
                            className="block h-9 w-28 px-2 border rounded text-sm"
                            onChange={e => setEditValues((v: any) => ({ ...v, unit_price: parseFloat(e.target.value) }))}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleEdit("sales", sale)} className="px-3 py-1.5 bg-black text-white text-xs rounded-lg">Save</button>
                        <button onClick={() => setEditingRecord(null)} className="px-3 py-1.5 border text-xs rounded-lg">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{sale.products?.name} × {sale.quantity}</p>
                        <p className="text-xs text-gray-400">
                          LKR {sale.total_amount?.toFixed(2)} · {new Date(sale.sold_at).toLocaleTimeString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setEditingRecord(sale); setEditValues({ quantity: sale.quantity, unit_price: sale.unit_price }); }}
                          className="px-3 py-1.5 border text-xs rounded-lg hover:bg-gray-50"
                        >Edit</button>
                        <button
                          onClick={() => handleDelete("sales", sale)}
                          className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-xs rounded-lg hover:bg-red-100"
                        >Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment records */}
        {records.payments.length > 0 && (
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-green-50">
              <h2 className="font-semibold text-green-800">Payments ({records.payments.length})</h2>
            </div>
            <div className="divide-y">
              {records.payments.map(payment => (
                <div key={payment.id} className="px-4 py-3">
                  {editingRecord?.id === payment.id ? (
                    <div className="space-y-2">
                      <div className="flex gap-2 flex-wrap">
                        <div>
                          <label className="text-xs text-gray-500">Amount</label>
                          <input
                            type="number"
                            defaultValue={payment.amount}
                            className="block h-9 w-32 px-2 border rounded text-sm"
                            onChange={e => setEditValues((v: any) => ({ ...v, amount: parseFloat(e.target.value) }))}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Type</label>
                          <select
                            defaultValue={payment.payment_type}
                            className="block h-9 px-2 border rounded text-sm"
                            onChange={e => setEditValues((v: any) => ({ ...v, payment_type: e.target.value }))}
                          >
                            <option value="full">Full</option>
                            <option value="partial">Partial</option>
                            <option value="outstanding">Outstanding</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleEdit("payments", payment)} className="px-3 py-1.5 bg-black text-white text-xs rounded-lg">Save</button>
                        <button onClick={() => setEditingRecord(null)} className="px-3 py-1.5 border text-xs rounded-lg">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">LKR {payment.amount?.toFixed(2)} — {payment.payment_type}</p>
                        <p className="text-xs text-gray-400">{new Date(payment.paid_at).toLocaleTimeString()}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setEditingRecord(payment); setEditValues({ amount: payment.amount, payment_type: payment.payment_type }); }}
                          className="px-3 py-1.5 border text-xs rounded-lg hover:bg-gray-50"
                        >Edit</button>
                        <button
                          onClick={() => handleDelete("payments", payment)}
                          className="px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-xs rounded-lg hover:bg-red-100"
                        >Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add missing records */}
        {selectedShop && !isLoading && (
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h2 className="font-semibold text-gray-800">Add Missing Record</h2>
            </div>
            <div className="p-4 space-y-4">
              {/* Add sale */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Add missed sale</p>
                <div className="flex gap-2 flex-wrap">
                  <select
                    className="flex-1 min-w-36 h-10 px-3 border rounded-lg text-sm"
                    onChange={e => setEditValues((v: any) => ({ ...v, product_id: e.target.value }))}
                  >
                    <option value="">Select product...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input
                    type="number"
                    placeholder="Quantity"
                    className="w-24 h-10 px-3 border rounded-lg text-sm"
                    onChange={e => setEditValues((v: any) => ({ ...v, quantity: e.target.value }))}
                  />
                  <button onClick={handleAddSale} className="px-4 h-10 bg-blue-600 text-white text-sm rounded-lg font-medium">
                    Add Sale
                  </button>
                </div>
              </div>

              {/* Add payment */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Add missed payment</p>
                <div className="flex gap-2 flex-wrap">
                  <input
                    type="number"
                    placeholder="Amount (LKR)"
                    className="flex-1 min-w-32 h-10 px-3 border rounded-lg text-sm"
                    onChange={e => setEditValues((v: any) => ({ ...v, amount: e.target.value }))}
                  />
                  <select
                    className="h-10 px-3 border rounded-lg text-sm"
                    onChange={e => setEditValues((v: any) => ({ ...v, payment_type: e.target.value }))}
                  >
                    <option value="partial">Partial</option>
                    <option value="full">Full</option>
                    <option value="outstanding">Outstanding</option>
                  </select>
                  <button onClick={handleAddPayment} className="px-4 h-10 bg-green-600 text-white text-sm rounded-lg font-medium">
                    Add Payment
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedShop && !isLoading && records.sales.length === 0 && records.payments.length === 0 && records.returns.length === 0 && (
          <div className="bg-white rounded-xl border p-8 text-center text-gray-500 text-sm">
            No records found for this shop on this date.
          </div>
        )}
      </div>
    </div>
  );
}