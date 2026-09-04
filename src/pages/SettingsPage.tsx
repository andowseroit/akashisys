import { useState, useEffect } from "react";
import { supabase } from "../db/supabase";
import { useLang } from "../i18n/LanguageContext";

async function invokeAdminFunction(functionName: string, body: Record<string, unknown>) {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw refreshError;
    session = refreshedSession;
  }
  if (!session?.access_token) throw new Error("Your login session has expired. Please sign in again.");
  // Keep the Functions client synchronized with the current user token immediately before the call.
  supabase.functions.setAuth(session.access_token);
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

async function invokeAdminDrivers(body: Record<string, unknown>) {
  return invokeAdminFunction("admin-drivers", body);
}

export default function SettingsPage() {
  const { t } = useLang();
  const [drivers, setDrivers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingDriver, setEditingDriver] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", password: "" });

  useEffect(() => { loadDrivers(); }, []);

  async function loadDrivers() {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from("driver_accounts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setDrivers(data || []);
    } catch (err: any) {
      console.error("Failed to load drivers:", err);
      setMessage("Error loading drivers: " + (err?.message || "Unknown error"));
    } finally {
      setIsLoading(false);
    }
  }

  async function clearTodayData() {
    setClearing(true);
    setMessage("");
    try {
      const data = await invokeAdminFunction("admin-clear-today", {});
      if (!data?.success) throw new Error(data?.error || "Failed to clear today's data.");
      setMessage("Today's data has been cleared successfully.");
      setShowClearConfirm(false);
    } catch (error: any) {
      console.error("Failed to clear today's data:", error);
      const status = error?.context?.status;
      if (status === 409) {
        setMessage("Cannot clear today's data because a route session has already started or completed.");
      } else {
        setMessage("Error: " + (error?.message || "Failed to clear today's data."));
      }
    } finally {
      setClearing(false);
    }
  }

  function openAdd() {
    setEditingDriver(null);
    setForm({ full_name: "", email: "", phone: "", password: "" });
    setShowForm(true);
    setMessage("");
  }

  function openEdit(driver: any) {
    setEditingDriver(driver);
    setForm({ full_name: driver.full_name, email: driver.email, phone: driver.phone || "", password: "" });
    setShowForm(true);
    setMessage("");
  }

  async function handleSave() {
    const fullName = form.full_name.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();
    const password = form.password;
    if (!fullName) return setMessage("Name is required.");
    if (!email) return setMessage("Email is required.");
    if (!editingDriver && !password) return setMessage("Password is required for a new driver.");
    if (password && password.length < 8) return setMessage("Password must be at least 8 characters.");
    setSaving(true);
    setMessage("");
    try {
      if (editingDriver) {
        const { error: driverUpdateError } = await supabase.from("driver_accounts").update({ full_name: fullName, email, phone: phone || null }).eq("id", editingDriver.id);
        if (driverUpdateError) throw driverUpdateError;
        if (password) await invokeAdminDrivers({ action: "reset_password", user_id: editingDriver.user_id, password });
        setMessage("Driver updated successfully.");
        setShowForm(false);
        await loadDrivers();
        return;
      }
      await invokeAdminDrivers({ action: "create", full_name: fullName, email, phone: phone || null, password });
      setMessage("Driver created successfully.");
      setShowForm(false);
      await loadDrivers();
    } catch (error: any) {
      console.error("Failed to save driver:", error);
      setMessage("Error: " + (error?.message || "Failed to save driver."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(driver: any) {
    if (!window.confirm(`Delete driver ${driver.full_name}? This will disable their driver account.`)) return;
    try {
      await invokeAdminDrivers({ action: "disable", user_id: driver.user_id });
      setMessage("Driver disabled successfully.");
      await loadDrivers();
    } catch (error: any) {
      console.error("Failed to disable driver:", error);
      setMessage("Error: " + (error?.message || "Failed to disable driver."));
    }
  }

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-500">{t("common_loading")}</p></div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b px-6 py-5 shadow-sm"><div className="max-w-6xl mx-auto flex items-center justify-between"><div><h1 className="text-2xl font-bold text-gray-900">Settings</h1><p className="text-sm text-gray-500 mt-1">Manage drivers and administrative operations.</p></div><button onClick={openAdd} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800">Add Driver</button></div></div>
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {message && <div className="rounded-lg border bg-white px-4 py-3 text-sm text-gray-700">{message}</div>}
        <section className="bg-white rounded-xl border overflow-hidden"><div className="px-5 py-4 border-b"><h2 className="font-semibold text-gray-900">Drivers</h2></div>{drivers.length === 0 ? <p className="p-6 text-center text-sm text-gray-400">No drivers found.</p> : <div className="divide-y">{drivers.map((driver) => <div key={driver.id} className="px-5 py-4 flex items-center justify-between gap-4"><div><p className="font-medium text-gray-900">{driver.full_name}</p><p className="text-sm text-gray-500">{driver.email}{driver.phone ? ` · ${driver.phone}` : ""}</p></div><div className="flex items-center gap-2"><button onClick={() => openEdit(driver)} className="px-3 py-2 rounded-lg border text-sm hover:bg-gray-50">Edit</button><button onClick={() => handleDelete(driver)} className="px-3 py-2 rounded-lg border border-red-200 text-red-700 text-sm hover:bg-red-50">Disable</button></div></div>)}</div>}</section>
        <section className="bg-white rounded-xl border p-5"><div className="flex items-center justify-between gap-4"><div><h2 className="font-semibold text-gray-900">Clear Today's Data</h2><p className="text-sm text-gray-500 mt-1">Voids today's transactions and removes pending truck loads. This operation is blocked once a route has started or completed.</p></div><button onClick={() => setShowClearConfirm(true)} className="px-4 py-2 rounded-lg border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50">Clear Today</button></div></section>
      </div>
      {showForm && <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50"><div className="bg-white rounded-xl border shadow-xl w-full max-w-lg p-6"><div className="flex items-center justify-between mb-5"><h2 className="text-lg font-semibold text-gray-900">{editingDriver ? "Edit Driver" : "Add Driver"}</h2><button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-700">×</button></div><div className="space-y-4"><label className="block"><span className="text-sm text-gray-700">Full name</span><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="block"><span className="text-sm text-gray-700">Email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="block"><span className="text-sm text-gray-700">Phone</span><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><label className="block"><span className="text-sm text-gray-700">{editingDriver ? "New password (optional)" : "Password"}</span><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2" /></label></div><div className="flex justify-end gap-2 mt-6"><button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border text-sm hover:bg-gray-50">Cancel</button><button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50">{saving ? "Saving..." : "Save"}</button></div></div></div>}
      {showClearConfirm && <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50"><div className="bg-white rounded-xl border shadow-xl w-full max-w-md p-6"><h2 className="text-lg font-semibold text-gray-900">Clear today's data?</h2><p className="text-sm text-gray-500 mt-2">Existing transactions will be voided and pending truck loads will be removed. This cannot run after the route has started or completed.</p><div className="flex justify-end gap-2 mt-6"><button onClick={() => setShowClearConfirm(false)} disabled={clearing} className="px-4 py-2 rounded-lg border text-sm hover:bg-gray-50 disabled:opacity-50">Cancel</button><button onClick={clearTodayData} disabled={clearing} className="px-4 py-2 rounded-lg bg-red-700 text-white text-sm font-medium disabled:opacity-50">{clearing ? "Clearing..." : "Yes, Clear Today"}</button></div></div></div>}
    </div>
  );
}
