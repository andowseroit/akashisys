import { useState, useEffect } from "react";
import { supabase } from "../db/supabase";
import { useLang } from "../i18n/LanguageContext";

const EMPTY_CATEGORY = { name: "" };
const EMPTY_PRODUCT = { name: "", category_id: "", size_kg: "", price_per_unit: "" };

export default function ProductsPage() {
  const { t } = useLang();
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"products" | "categories">("products");

  // Category form
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [categoryForm, setCategoryForm] = useState(EMPTY_CATEGORY);
  const [savingCategory, setSavingCategory] = useState(false);

  // Product form
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT);
  const [savingProduct, setSavingProduct] = useState(false);

  // Filter
  const [filterCategory, setFilterCategory] = useState<string>("all");

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setIsLoading(true);
    try {
      const [{ data: cats }, { data: prods }] = await Promise.all([
        supabase.from("product_categories").select("*").order("sort_order").order("name"),
        supabase.from("products").select("*, product_categories!products_category_id_fkey(name)").order("name"),
      ]);
      setCategories(cats || []);
      setProducts(prods || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  // ── CATEGORY ACTIONS ──
  function openAddCategory() {
    setEditingCategory(null);
    setCategoryForm(EMPTY_CATEGORY);
    setShowCategoryForm(true);
    setActiveTab("categories");
  }

  function openEditCategory(cat: any) {
    setEditingCategory(cat);
    setCategoryForm({ name: cat.name });
    setShowCategoryForm(true);
  }

  async function handleSaveCategory() {
    if (!categoryForm.name.trim()) { setMessage("Category name is required."); return; }
    setSavingCategory(true);
    try {
      if (editingCategory) {
        await supabase.from("product_categories")
          .update({ name: categoryForm.name.trim() })
          .eq("id", editingCategory.id);
        setMessage("Category updated.");
      } else {
        await supabase.from("product_categories")
          .insert({ name: categoryForm.name.trim(), sort_order: categories.length + 1 });
        setMessage("Category added.");
      }
      setShowCategoryForm(false);
      await loadAll();
    } catch (err: any) {
      console.error("Save category error:", err);
      setMessage("Error: " + (err.message || JSON.stringify(err)));
    } finally {
      setSavingCategory(false);
    }
  }

  async function toggleCategory(cat: any) {
    await supabase.from("product_categories")
      .update({ is_active: !cat.is_active })
      .eq("id", cat.id);
    await loadAll();
  }

  // ── PRODUCT ACTIONS ──
  function openAddProduct(categoryId?: string) {
    setEditingProduct(null);
    setProductForm({ ...EMPTY_PRODUCT, category_id: categoryId || "" });
    setShowProductForm(true);
  }

  function openEditProduct(product: any) {
    setEditingProduct(product);
    setProductForm({
      name: product.name || "",
      category_id: product.category_id || "",
      size_kg: product.size_kg?.toString() || "",
      price_per_unit: product.price_per_unit?.toString() || "",
    });
    setShowProductForm(true);
  }

  async function handleSaveProduct() {
    if (!productForm.category_id) { setMessage("Select a category."); return; }
    if (!productForm.size_kg) { setMessage("Enter size."); return; }
    if (!productForm.price_per_unit) { setMessage("Enter price."); return; }

    // Auto-generate name from category + size if not set
    const cat = categories.find(c => c.id === productForm.category_id);
    const sizeLabel = parseFloat(productForm.size_kg) >= 1
      ? `${parseFloat(productForm.size_kg)}KG`
      : `${Math.round(parseFloat(productForm.size_kg) * 1000)}g`;
    const autoName = productForm.name.trim() || `${cat?.name} ${sizeLabel}`;

    setSavingProduct(true);
    try {
      const payload = {
        name: autoName,
        category_id: productForm.category_id,
        size_kg: parseFloat(productForm.size_kg),
        price_per_unit: parseFloat(productForm.price_per_unit),
        is_active: true,
      };

      if (editingProduct) {
        await supabase.from("products").update(payload).eq("id", editingProduct.id);
        setMessage("Product updated.");
      } else {
        await supabase.from("products").insert(payload);
        setMessage("Product added.");
      }
      setShowProductForm(false);
      await loadAll();
    } catch (err: any) {
      console.error("Save product error:", err);
      setMessage("Error: " + (err.message || JSON.stringify(err)));
    } finally {
      setSavingProduct(false);
    }
  }

  async function toggleProduct(product: any) {
    await supabase.from("products")
      .update({ is_active: !product.is_active })
      .eq("id", product.id);
    await loadAll();
  }

  async function deleteProduct(product: any) {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("products").delete().eq("id", product.id);
    if (error) {
      setMessage("Cannot delete — product has sales records. Deactivate instead.");
    } else {
      setMessage("Product deleted.");
      await loadAll();
    }
  }

  // Group products by category
  const grouped = categories.map(cat => ({
    ...cat,
    products: products.filter(p =>
      p.category_id === cat.id &&
      (filterCategory === "all" || filterCategory === cat.id)
    ),
  })).filter(cat =>
    filterCategory === "all" || filterCategory === cat.id
  );

  const activeProductCount = products.filter(p => p.is_active).length;
  const activeCategoryCount = categories.filter(c => c.is_active).length;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">{t("common_loading")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("products_title")}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {activeCategoryCount} {t("products_categories")} · {activeProductCount} {t("products_active")}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={openAddCategory}
              className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium hover:bg-gray-50"
            >
              {t("products_add_category")}
            </button>
            <button
              onClick={() => openAddProduct()}
              className="px-4 py-2 bg-black text-white rounded-xl text-sm font-semibold hover:bg-gray-800"
            >
              {t("products_add_product")}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {(["products", "categories"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >{tab === "products" ? t("products_tab_products") : t("products_tab_categories")}</button>
          ))}
        </div>
      </div>

      <div className="px-6 py-5 max-w-5xl mx-auto space-y-4">

        {message && (
          <div className={`p-3 rounded-lg text-sm font-medium ${
            message.startsWith("Error") || message.startsWith("Cannot")
              ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
          }`}>
            {message}
            <button onClick={() => setMessage("")} className="ml-2 font-bold">×</button>
          </div>
        )}

        {/* ── CATEGORIES TAB ── */}
        {activeTab === "categories" && (
          <div className="space-y-2">
            {showCategoryForm && (
              <div className="bg-white rounded-xl border shadow-sm p-4">
                <h3 className="font-semibold text-gray-900 mb-3">
                  {editingCategory ? t("products_edit_category") : t("products_new_category")}
                </h3>
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder={t("products_category_placeholder")}
                    className="flex-1 h-10 px-3 border rounded-lg text-sm"
                    value={categoryForm.name}
                    onChange={e => setCategoryForm({ name: e.target.value })}
                    onKeyDown={e => { if (e.key === "Enter") handleSaveCategory(); }}
                    autoFocus
                  />
                  <button
                    onClick={handleSaveCategory}
                    disabled={savingCategory}
                    className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {savingCategory ? t("products_saving") : editingCategory ? t("products_update_btn") : t("products_add_btn")}
                  </button>
                  <button
                    onClick={() => setShowCategoryForm(false)}
                    className="px-3 py-2 border rounded-lg text-sm"
                  >{t("products_cancel")}</button>
                </div>
              </div>
            )}

            {categories.length === 0 ? (
              <div className="bg-white rounded-xl border p-8 text-center text-gray-400 text-sm">
                {t("products_no_categories")}
              </div>
            ) : (
              categories.map(cat => (
                <div
                  key={cat.id}
                  className={`bg-white rounded-xl border p-4 flex items-center justify-between ${
                    !cat.is_active ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600">
                      {cat.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{cat.name}</p>
                      <p className="text-xs text-gray-500">
                        {products.filter(p => p.category_id === cat.id).length} {t("products_category_products")}
                      </p>
                    </div>
                    {!cat.is_active && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">{t("products_inactive_badge")}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { openEditCategory(cat); }}
                      className="px-3 py-1.5 text-xs border rounded-lg hover:bg-gray-50"
                    >{t("common_edit")}</button>
                    <button
                      onClick={() => toggleCategory(cat)}
                      className={`px-3 py-1.5 text-xs border rounded-lg font-medium ${
                        cat.is_active
                          ? "text-red-600 border-red-200 hover:bg-red-50"
                          : "text-green-600 border-green-200 hover:bg-green-50"
                      }`}
                    >
                      {cat.is_active ? t("products_disable") : t("products_enable")}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── PRODUCTS TAB ── */}
        {activeTab === "products" && (
          <>
            {/* Category filter */}
            {categories.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setFilterCategory("all")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                    filterCategory === "all" ? "bg-black text-white border-black" : "bg-white hover:bg-gray-50"
                  }`}
                >{t("products_all")}</button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setFilterCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                      filterCategory === cat.id ? "bg-black text-white border-black" : "bg-white hover:bg-gray-50"
                    }`}
                  >{cat.name}</button>
                ))}
              </div>
            )}

            {/* Product form */}
            {showProductForm && (
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">
                    {editingProduct ? t("products_edit_product") : t("products_new_product")}
                  </h3>
                  <button onClick={() => setShowProductForm(false)} className="text-gray-400 text-xl">×</button>
                </div>
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Category selector */}
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-500 font-medium block mb-1">
                      {t("products_category_label")}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {categories.map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => {
                            setProductForm(f => ({ ...f, category_id: cat.id }));
                          }}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                            productForm.category_id === cat.id
                              ? "bg-black text-white border-black"
                              : "bg-white border-gray-200 hover:border-gray-400"
                          }`}
                        >{cat.name}</button>
                      ))}
                    </div>
                  </div>

                  {/* Size */}
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">
                      {t("products_size_label")}
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      placeholder="e.g. 0.5"
                      className="w-full h-10 px-3 border rounded-lg text-sm"
                      value={productForm.size_kg}
                      onChange={e => setProductForm(f => ({ ...f, size_kg: e.target.value }))}
                    />
                    {productForm.size_kg && (
                      <p className="text-xs text-gray-400 mt-1">
                        = {parseFloat(productForm.size_kg) >= 1
                          ? `${parseFloat(productForm.size_kg)}KG`
                          : `${Math.round(parseFloat(productForm.size_kg) * 1000)}g`}
                      </p>
                    )}
                  </div>

                  {/* Price */}
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">
                      {t("products_price_label")}
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 220"
                      className="w-full h-10 px-3 border rounded-lg text-sm"
                      value={productForm.price_per_unit}
                      onChange={e => setProductForm(f => ({ ...f, price_per_unit: e.target.value }))}
                    />
                  </div>

                  {/* Custom name (optional) */}
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-500 font-medium block mb-1">
                      {t("products_name_label")}
                    </label>
                    <input
                      type="text"
                      placeholder={
                        productForm.category_id && productForm.size_kg
                          ? `Auto: ${categories.find(c => c.id === productForm.category_id)?.name || ""} ${
                              parseFloat(productForm.size_kg) >= 1
                                ? parseFloat(productForm.size_kg) + "KG"
                                : Math.round(parseFloat(productForm.size_kg) * 1000) + "g"
                            }`
                          : "e.g. Rice Flour 1KG"
                      }
                      className="w-full h-10 px-3 border rounded-lg text-sm"
                      value={productForm.name}
                      onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="px-5 py-4 border-t bg-gray-50 flex gap-3 justify-end">
                  <button
                    onClick={() => setShowProductForm(false)}
                    className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-100"
                  >{t("products_cancel")}</button>
                  <button
                    onClick={handleSaveProduct}
                    disabled={savingProduct}
                    className="px-5 py-2 bg-black text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {savingProduct ? t("products_saving") : editingProduct ? t("products_update_product") : t("products_save_product")}
                  </button>
                </div>
              </div>
            )}

            {/* Products grouped by category */}
            {grouped.map(cat => (
              cat.products.length > 0 || filterCategory === "all" ? (
                <div key={cat.id} className="bg-white rounded-xl border overflow-hidden">
                  {/* Category header */}
                  <div className="px-5 py-3 bg-gray-50 border-b flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{cat.name}</span>
                      <span className="text-xs text-gray-400">
                        {cat.products.filter((p: any) => p.is_active).length} {t("products_active_badge")}
                      </span>
                      {!cat.is_active && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full">{t("products_category_inactive")}</span>
                      )}
                    </div>
                    <button
                      onClick={() => openAddProduct(cat.id)}
                      className="text-xs text-gray-500 hover:text-gray-900 border rounded-lg px-2 py-1"
                    >
                      {t("products_add_size")}
                    </button>
                  </div>

                  {/* Products in this category */}
                  {cat.products.length === 0 ? (
                    <div className="px-5 py-4 text-sm text-gray-400">
                      {t("products_no_products_in_cat")}
                      <button
                        onClick={() => openAddProduct(cat.id)}
                        className="ml-1 text-gray-900 underline"
                      >{t("products_add_one")}</button>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {cat.products.map((product: any) => {
                        const sizeLabel = product.size_kg >= 1
                          ? `${product.size_kg}KG`
                          : `${Math.round(product.size_kg * 1000)}g`;
                        return (
                          <div
                            key={product.id}
                            className={`px-5 py-3 flex items-center justify-between ${
                              !product.is_active ? "opacity-50" : ""
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-bold rounded">
                                {sizeLabel}
                              </span>
                              <span className="text-sm font-medium text-gray-900">{product.name}</span>
                              {!product.is_active && (
                                <span className="px-2 py-0.5 bg-gray-100 text-gray-400 text-xs rounded-full">{t("products_inactive_badge")}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="font-bold text-sm text-gray-900">
                                LKR {product.price_per_unit.toFixed(2)}
                              </span>
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => openEditProduct(product)}
                                  className="px-2.5 py-1 text-xs border rounded-lg hover:bg-gray-50"
                                >{t("common_edit")}</button>
                                <button
                                  onClick={() => toggleProduct(product)}
                                  className={`px-2.5 py-1 text-xs border rounded-lg font-medium ${
                                    product.is_active
                                      ? "text-red-600 border-red-200 hover:bg-red-50"
                                      : "text-green-600 border-green-200 hover:bg-green-50"
                                  }`}
                                >
                                  {product.is_active ? t("products_disable") : t("products_enable")}
                                </button>
                                <button
                                  onClick={() => deleteProduct(product)}
                                  className="px-2.5 py-1 text-xs border border-red-200 text-red-500 rounded-lg hover:bg-red-50"
                                >{t("products_delete")}</button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null
            ))}

            {products.length === 0 && (
              <div className="bg-white rounded-xl border p-8 text-center text-gray-400 text-sm">
                {t("products_no_products")}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}