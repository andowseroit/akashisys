import { useState, useEffect } from "react";
import { supabase, supabaseAdmin } from "../db/supabase";
import { useLang } from "../i18n/LanguageContext";

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
  const [form, setForm] = useState({
    full_name: "", email: "", phone: "", password: ""
  });

  useEffect(() => { loadDrivers(); }, []);

  async function loadDrivers() {
    setIsLoading(true);
    const { data } = await supabase
      .from("driver_accounts")
      .select("*")
      .order("created_at", { ascending: false });
    setDrivers(data || []);
    setIsLoading(false);
  }

  async function clearTodayData() {
    setClearing(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const start = `${today}T00:00:00`;
      const end = `${today}T23:59:59`;

      await Promise.all([
        supabase.from("sales").delete().gte("sold_at", start).lte("sold_at", end),
        supabase.from("payments").delete().gte("paid_at", start).lte("paid_at", end),
        supabase.from("returns").delete().gte("returned_at", start).lte("returned_at", end),
        supabase.from("expenses").delete().gte("spent_at", start).lte("spent_at", end),
        supabase.from("outstanding_settlements").delete().gte("settled_at", start).lte("settled_at", end),
        supabase.from("truck_loads").delete().eq("session_date", today),
      ]);

      // Reset today's session back to pending
      const { data: sessions } = await supabase
        .from("route_sessions")
        .select("id")
        .or(`date.eq.${today},session_date.eq.${today}`);

      if (sessions && sessions.length > 0) {
        await supabase
          .from("route_sessions")
          .update({ status: "pending", started_at: null, completed_at: null })
          .eq("id", sessions[0].id);
      }

      setMessage("✅ Today's data cleared successfully. Session reset to pending.");
      setShowClearConfirm(false);
    } catch (err: any) {
      setMessage("Error clearing today's data: " + (err?.message || err));
    } finally {
      setClearing(false);
    }
  }

  function openAdd() {
    setEditingDriver(null);
    setForm({ full_name: "", email: "", phone: "", password: "" });
    setShowForm(true);
  }

  function openEdit(driver: any) {
    setEditingDriver(driver);
    setForm({ full_name: driver.full_name, email: driver.email, phone: driver.phone || "", password: "" });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.full_name.trim()) { setMessage("Name is required."); return; }
    if (!form.email.trim()) { setMessage("Email is required."); return; }
    if (!editingDriver && !form.password) { setMessage("Password is required for new driver."); return; }
    if (!supabaseAdmin) { setMessage("Error: VITE_SUPABASE_SERVICE_KEY is not set in .env.local — admin operations require the service role key."); return; }

    setSaving(true);
    try {
      if (editingDriver) {
        // Update profile
        await supabase.from("driver_accounts").update({
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          updated_at: new Date().toISOString(),
        }).eq("id", editingDriver.id);

        if (form.password) {
          if (editingDriver.auth_user_id) {
            // Existing Auth user — update password and email
            await supabaseAdmin.auth.admin.updateUserById(editingDriver.auth_user_id, {
              password: form.password,
              email: form.email.trim(),
            });
          } else {
            // No Auth user exists — create one (fixes broken accounts)
            const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
              email: form.email.trim(),
              password: form.password,
              email_confirm: true,
            });
            if (createError) throw createError;

            if (authData?.user) {
              await supabase.from("driver_accounts").update({
                auth_user_id: authData.user.id,
                updated_at: new Date().toISOString(),
              }).eq("id", editingDriver.id);
            }
          }
        }
        setMessage("Driver updated successfully.");
      } else {
        // Create auth user
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: form.email.trim(),
          password: form.password,
          email_confirm: true,
        });
        if (authError) throw authError;

        // Create driver profile
        await supabase.from("driver_accounts").insert({
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          auth_user_id: authData.user?.id,
          is_active: true,
        });
        setMessage("Driver account created successfully.");
      }
      setShowForm(false);
      await loadDrivers();
    } catch (err: any) {
      setMessage("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleDriver(driver: any) {
    await supabase.from("driver_accounts")
      .update({ is_active: !driver.is_active })
      .eq("id", driver.id);

    // Disable auth account too
    if (driver.auth_user_id && supabaseAdmin) {
      await supabaseAdmin.auth.admin.updateUserById(driver.auth_user_id, {
        ban_duration: driver.is_active ? "87600h" : "none",
      });
    }
    await loadDrivers();
  }

  async function deleteDriver(driver: any) {
    if (!confirm(`Permanently delete "${driver.full_name}"? Their sales history will be kept.`)) return;
    try {
      if (driver.auth_user_id && supabaseAdmin) {
        await supabaseAdmin.auth.admin.deleteUser(driver.auth_user_id);
      }
      await supabase.from("driver_accounts").delete().eq("id", driver.id);
      setMessage("Driver deleted.");
      await loadDrivers();
    } catch (err: any) {
      setMessage("Error: " + err.message);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("settings_title")}</h1>
            <p className="text-sm text-gray-500 mt-1">{t("settings_manage_drivers")}</p>
          </div>
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-black text-white rounded-xl text-sm font-semibold hover:bg-gray-800"
          >{t("settings_new_driver")}</button>
        </div>
      </div>

      <div className="px-6 py-5 max-w-3xl mx-auto space-y-4">
        {message && (
          <div className={`p-3 rounded-xl text-sm font-medium ${
            message.startsWith("Error") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
          }`}>
            {message}
            <button onClick={() => setMessage("")} className="ml-2 font-bold">×</button>
          </div>
        )}

        {/* Driver form */}
        {showForm && (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                {editingDriver ? `${t("settings_edit_driver_title")}: ${editingDriver.full_name}` : t("settings_new_driver_title")}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: "full_name", label: t("settings_full_name"), type: "text", placeholder: t("settings_name_placeholder") },
                { key: "email", label: t("settings_email"), type: "email", placeholder: t("settings_email_placeholder") },
                { key: "phone", label: t("settings_phone"), type: "text", placeholder: t("settings_phone_placeholder") },
                { key: "password", label: editingDriver ? t("settings_password_edit") : t("settings_password"), type: "password", placeholder: t("settings_password_placeholder") },
              ].map(field => (
                <div key={field.key}>
                  <label className="text-xs text-gray-500 font-medium block mb-1">{field.label}</label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    className="w-full h-10 px-3 border rounded-xl text-sm"
                    value={(form as any)[field.key]}
                    onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t bg-gray-50 flex gap-3 justify-end">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-xl text-sm hover:bg-gray-100">{t("settings_cancel")}</button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-black text-white rounded-xl text-sm font-semibold disabled:opacity-50"
              >{saving ? t("settings_saving") : editingDriver ? t("settings_update") : t("settings_create")}</button>
            </div>
          </div>
        )}

        {/* Clear Today's Data Section */}
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Clear Today's Data</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Delete all sales, payments, returns, expenses, truck loads, and settlements for today
              </p>
            </div>
            <button
              onClick={() => setShowClearConfirm(true)}
              disabled={clearing}
              className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
            >
              {clearing ? "Clearing..." : "Clear Today's Data"}
            </button>
          </div>
        </div>

        {/* Driver list */}
        {isLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">{t("common_loading")}</div>
        ) : drivers.length === 0 ? (
          <div className="bg-white rounded-2xl border p-8 text-center text-gray-400 text-sm">
            {t("settings_no_drivers")}
          </div>
        ) : (
          <div className="space-y-2">
            {drivers.map(driver => (
              <div key={driver.id} className={`bg-white rounded-2xl border p-4 flex items-center justify-between gap-3 ${!driver.is_active ? "opacity-60" : ""}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {driver.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">{driver.full_name}</p>
                      {!driver.is_active && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full font-medium">{t("settings_inactive")}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{driver.email}</p>
                    {driver.phone && <p className="text-xs text-gray-400">{driver.phone}</p>}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => openEdit(driver)} className="px-3 py-1.5 text-xs border rounded-xl hover:bg-gray-50">{t("settings_edit")}</button>
                  <button
                    onClick={() => toggleDriver(driver)}
                    className={`px-3 py-1.5 text-xs border rounded-xl font-medium ${
                      driver.isActive ? "text-orange-600 border-orange-200 hover:bg-orange-50" : "text-green-600 border-green-200 hover:bg-green-50"
                    }`}
                  >{driver.is_active ? t("settings_deactivate") : t("settings_activate")}</button>
                  <button onClick={() => deleteDriver(driver)} className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-xl hover:bg-red-50">{t("settings_delete")}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Clear confirmation modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Clear all of today's data?</h3>
            <p className="text-sm text-gray-500 mb-2">
              This will permanently delete all of today's:
            </p>
            <ul className="text-sm text-gray-600 mb-5 list-disc list-inside space-y-1">
              <li>Sales records</li>
              <li>Payment records</li>
              <li>Returns records</li>
              <li>Expense records</li>
              <li>Outstanding settlements</li>
              <li>Truck load data</li>
            </ul>
            <p className="text-sm font-semibold text-red-600 mb-5">
              The session will also be reset to "Pending". This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 border rounded-xl text-sm hover:bg-gray-50"
              >{t("common_cancel")}</button>
              <button
                onClick={clearTodayData}
                disabled={clearing}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >{clearing ? "Clearing..." : "Yes, Clear Everything"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}