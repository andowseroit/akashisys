import { useState, useEffect } from "react";
import { supabase } from "../db/supabase";
import { useLang } from "../i18n/LanguageContext";

const EMPTY_SHOP = {
  name: "", owner_name: "", phone: "",
  address: "", email: "", notes: "",
  route_order: 1, credit_limit: 0,
  is_active: true, session_active: true,
};

export default function ShopsPage() {
  const { t } = useLang();
  const [shops, setShops] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingShop, setEditingShop] = useState<any>(null);
  const [form, setForm] = useState(EMPTY_SHOP);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");

  useEffect(() => { loadShops(); }, []);

  const isMissingColumnError = (error: any) => {
    const raw = error?.message || error?.msg || error?.details || error?.hint || error;
    const message = String(raw || "").toLowerCase();
    return (
      (message.includes("column") && message.includes("does not exist")) ||
      (message.includes("could not find") && message.includes("schema cache")) ||
      /could not find.*column/.test(message) ||
      /column .* does not exist/.test(message)
    );
  };

  const withoutUnsupportedShopColumns = (payload: typeof EMPTY_SHOP, error: any) => {
    const compatiblePayload: any = { ...payload };
    const message = String(error?.message || "").toLowerCase();

    for (const column of ["email", "notes", "credit_limit"]) {
      if (message.includes(column)) delete compatiblePayload[column];
    }

    return compatiblePayload;
  };

  async function loadShops() {
    setIsLoading(true);
    const { data } = await supabase
      .from("shops")
      .select("*")
      .order("route_order");
    setShops(data || []);
    setIsLoading(false);
  }

  function openAdd() {
    setEditingShop(null);
    const maxOrder = shops.reduce((m, s) => Math.max(m, s.route_order || 0), 0);
    setForm({ ...EMPTY_SHOP, route_order: maxOrder + 1 });
    setShowForm(true);
  }

  function openEdit(shop: any) {
    setEditingShop(shop);
    setForm({
      name: shop.name || "",
      owner_name: shop.owner_name || "",
      phone: shop.phone || "",
      address: shop.address || "",
      email: shop.email || "",
      notes: shop.notes || "",
      route_order: shop.route_order || 1,
      credit_limit: shop.credit_limit || 0,
      is_active: shop.is_active,
      session_active: shop.session_active ?? true,
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setMessage("Shop name is required."); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        route_order: Math.max(1, Number(form.route_order) || 1),
        credit_limit: Math.max(0, Number(form.credit_limit) || 0),
        session_active: form.is_active ? form.session_active : false,
      };

      if (editingShop) {
        let { error } = await supabase.from("shops").update(payload).eq("id", editingShop.id);
        if (error && isMissingColumnError(error)) {
          const retry = await supabase
            .from("shops")
            .update(withoutUnsupportedShopColumns(payload, error))
            .eq("id", editingShop.id);
          error = retry.error;
        }
        if (error) throw error;
        setMessage("Shop updated.");
      } else {
        let { error } = await supabase.from("shops").insert(payload);
        if (error && isMissingColumnError(error)) {
          const retry = await supabase
            .from("shops")
            .insert(withoutUnsupportedShopColumns(payload, error));
          error = retry.error;
        }
        if (error) throw error;
        setMessage("Shop added.");
      }
      setShowForm(false);
      setEditingShop(null);
      await loadShops();
    } catch (err: any) {
      setMessage("Error: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(shop: any) {
    const nextActive = !shop.is_active;
    const { error } = await supabase.from("shops")
      .update({
        is_active: nextActive,
        session_active: nextActive ? (shop.session_active ?? true) : false,
      })
      .eq("id", shop.id);

    if (error) {
      setMessage("Error: " + error.message);
      return;
    }

    setMessage(`${shop.name} ${nextActive ? "activated" : "deactivated"}.`);
    await loadShops();
  }

  async function toggleSessionActive(shop: any) {
    if (!shop.is_active) {
      setMessage("Activate the shop before including it in today's route.");
      return;
    }

    const nextSessionActive = !(shop.session_active ?? true);
    const { error } = await supabase.from("shops")
      .update({ session_active: nextSessionActive })
      .eq("id", shop.id);

    if (error) {
      setMessage("Error: " + error.message);
      return;
    }

    setMessage(`${shop.name} ${nextSessionActive ? "included in" : "excluded from"} today's route.`);
    await loadShops();
  }

  async function handleDelete(shop: any) {
    if (!confirm(`Permanently delete "${shop.name}"? This cannot be undone and will affect historical records.`)) return;
    const { error } = await supabase.from("shops").delete().eq("id", shop.id);
    if (error) {
      setMessage("Cannot delete — shop has sales records. Deactivate it instead.");
    } else {
      setMessage("Shop deleted.");
      await loadShops();
    }
  }

  const filtered = shops.filter(s => {
    const matchSearch = s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.owner_name?.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === "all" ? true :
      filter === "active" ? s.is_active :
      !s.is_active;
    return matchSearch && matchFilter;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("shops_title")}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {shops.filter(s => s.is_active).length} {t("shops_active")} ·{" "}
              {shops.filter(s => s.is_active && (s.session_active ?? true)).length} {t("shops_in_route")}
            </p>
          </div>
          <button
            onClick={openAdd}
            className="px-4 py-2 bg-black text-white rounded-xl text-sm font-semibold hover:bg-gray-800"
          >
            {t("shops_add")}
          </button>
        </div>
      </div>

      <div className="px-6 py-4 max-w-5xl mx-auto space-y-4">
        {message && (
          <div className={`p-3 rounded-lg text-sm font-medium ${
            message.startsWith("Error") || message.startsWith("Cannot")
              ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
          }`}>
            {message}
            <button onClick={() => setMessage("")} className="ml-2 font-bold">×</button>
          </div>
        )}

        {/* Search and filter */}
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            placeholder={t("shops_search")}
            className="flex-1 min-w-48 h-10 px-3 border rounded-lg text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="flex gap-1">
            {(["all", "active", "inactive"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 h-10 rounded-lg text-sm font-medium capitalize border ${
                  filter === f ? "bg-black text-white border-black" : "bg-white hover:bg-gray-50"
                }`}
              >{f === "all" ? t("shops_all") : f === "active" ? t("shops_active_filter") : t("shops_inactive_filter")}</button>
            ))}
          </div>
        </div>

        {/* Add/Edit form */}
        {showForm && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">
                {editingShop ? `${t("shops_edit_title")}: ${editingShop.name}` : t("shops_add")}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-gray-500 hover:text-gray-900 text-xl">×</button>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: "name",       label: t("shops_name"),    type: "text" },
                { key: "owner_name", label: t("shops_owner"),     type: "text" },
                { key: "phone",      label: t("shops_phone"),          type: "text" },
                { key: "email",      label: t("shops_email"),          type: "email" },
                { key: "address",    label: t("shops_address"),        type: "text" },
                { key: "route_order",label: t("shops_route_order"),    type: "number" },
                { key: "credit_limit",label:t("shops_credit_limit"), type: "number" },
              ].map(field => (
                <div key={field.key}>
                  <label className="text-xs text-gray-500 block mb-1">{field.label}</label>
                  <input
                    type={field.type}
                    className="w-full h-10 px-3 border rounded-lg text-sm"
                    value={(form as any)[field.key]}
                    onChange={e => setForm(f => ({ ...f, [field.key]: field.type === "number" ? parseFloat(e.target.value) || 0 : e.target.value }))}
                  />
                </div>
              ))}
              <div className="md:col-span-2">
                <label className="text-xs text-gray-500 block mb-1">{t("shops_notes")}</label>
                <textarea
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={e => setForm(f => ({
                      ...f,
                      is_active: e.target.checked,
                      session_active: e.target.checked ? f.session_active : false,
                    }))}
                    className="w-4 h-4"
                  />
                  {t("shops_active_check")}
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.session_active}
                    disabled={!form.is_active}
                    onChange={e => setForm(f => ({ ...f, session_active: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  {t("shops_session_check")}
                </label>
              </div>
            </div>
            <div className="px-5 py-4 border-t bg-gray-50 flex gap-3 justify-end">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-100"
              >{t("shops_cancel")}</button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-black text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {saving ? t("shops_saving") : editingShop ? t("shops_save") : t("shops_add_save")}
              </button>
            </div>
          </div>
        )}

        {/* Shops list */}
        {isLoading ? (
          <div className="text-center py-8 text-gray-500 text-sm">{t("common_loading")}</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((shop, idx) => (
              <div
                key={shop.id}
                className={`bg-white rounded-xl border p-4 flex items-center justify-between gap-3 ${
                  !shop.is_active ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600 flex-shrink-0">
                    {shop.route_order || idx + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900">{shop.name}</p>
                      {!shop.is_active && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">{t("shops_inactive_badge")}</span>
                      )}
                      {shop.is_active && !(shop.session_active ?? true) && (
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-xs rounded-full">{t("shops_skipped_badge")}</span>
                      )}
                      {shop.is_active && (shop.session_active ?? true) && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">{t("shops_in_route_badge")}</span>
                      )}
                    </div>
                    <div className="flex gap-3 text-xs text-gray-500 mt-0.5 flex-wrap">
                      {shop.owner_name && <span>{shop.owner_name}</span>}
                      {shop.phone && <span>{shop.phone}</span>}
                      {shop.address && <span>{shop.address}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                  <button
                    onClick={() => toggleSessionActive(shop)}
                    disabled={!shop.is_active}
                    className={`px-3 py-1.5 text-xs rounded-lg border font-medium ${
                      !shop.is_active
                        ? "text-gray-400 border-gray-200 cursor-not-allowed"
                        : shop.session_active ?? true
                        ? "text-orange-600 border-orange-200 hover:bg-orange-50"
                        : "text-green-600 border-green-200 hover:bg-green-50"
                    }`}
                  >
                    {shop.session_active ?? true ? t("shops_skip_today") : t("shops_include_today")}
                  </button>
                  <button
                    onClick={() => openEdit(shop)}
                    className="px-3 py-1.5 text-xs rounded-lg border hover:bg-gray-50"
                  >{t("shops_edit")}</button>
                  <button
                    onClick={() => toggleActive(shop)}
                    className={`px-3 py-1.5 text-xs rounded-lg border font-medium ${
                      shop.is_active
                        ? "text-red-600 border-red-200 hover:bg-red-50"
                        : "text-green-600 border-green-200 hover:bg-green-50"
                    }`}
                  >
                    {shop.is_active ? t("shops_deactivate") : t("shops_activate")}
                  </button>
                  <button
                    onClick={() => handleDelete(shop)}
                    className="px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                  >{t("shops_delete")}</button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="bg-white rounded-xl border p-8 text-center text-gray-500 text-sm">
                {t("shops_no_shops")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}