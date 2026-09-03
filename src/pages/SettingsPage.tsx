import { useState, useEffect } from "react";
import { supabase } from "../db/supabase";
import { useLang } from "../i18n/LanguageContext";

async function invokeAdminFunction(
  functionName: string,
  body: Record<string, unknown>
) {
  // Get the current authenticated session.
  let {
    data: { session },
  } = await supabase.auth.getSession();

  // If there is no usable session, try refreshing it.
  if (!session?.access_token) {
    const {
      data: { session: refreshedSession },
      error: refreshError,
    } = await supabase.auth.refreshSession();

    if (refreshError) {
      throw refreshError;
    }

    session = refreshedSession;
  }

  if (!session?.access_token) {
    throw new Error(
      "Your login session has expired. Please sign in again."
    );
  }

  const { data, error } = await supabase.functions.invoke(
    functionName,
    {
      body,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  );

  if (error) {
    throw error;
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

async function invokeAdminDrivers(
  body: Record<string, unknown>
) {
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

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    password: "",
  });

  useEffect(() => {
    loadDrivers();
  }, []);

  async function loadDrivers() {
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from("driver_accounts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      setDrivers(data || []);
    } catch (err: any) {
      console.error("Failed to load drivers:", err);

      setMessage(
        "Error loading drivers: " +
          (err?.message || "Unknown error")
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function clearTodayData() {
    setClearing(true);
    setMessage("");

    try {
      const data = await invokeAdminFunction(
        "admin-clear-today",
        {}
      );

      if (!data?.success) {
        throw new Error(
          data?.error ||
            "Failed to clear today's data."
        );
      }

      setMessage(
        "Today's data has been cleared successfully."
      );

      setShowClearConfirm(false);
    } catch (error: any) {
      console.error(
        "Failed to clear today's data:",
        error
      );

      setMessage(
        "Error: " +
          (error?.message ||
            "Failed to clear today's data.")
      );
    } finally {
      setClearing(false);
    }
  }

  function openAdd() {
    setEditingDriver(null);

    setForm({
      full_name: "",
      email: "",
      phone: "",
      password: "",
    });

    setShowForm(true);
    setMessage("");
  }

  function openEdit(driver: any) {
    setEditingDriver(driver);

    setForm({
      full_name: driver.full_name,
      email: driver.email,
      phone: driver.phone || "",
      password: "",
    });

    setShowForm(true);
    setMessage("");
  }

  async function handleSave() {
    const fullName = form.full_name.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();
    const password = form.password;

    if (!fullName) {
      setMessage("Name is required.");
      return;
    }

    if (!email) {
      setMessage("Email is required.");
      return;
    }

    if (!editingDriver && !password) {
      setMessage(
        "Password is required for a new driver."
      );
      return;
    }

    if (password && password.length < 8) {
      setMessage(
        "Password must be at least 8 characters."
      );
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      // =========================================================
      // EDIT EXISTING DRIVER
      // =========================================================
      if (editingDriver) {
        const {
          error: driverUpdateError,
        } = await supabase
          .from("driver_accounts")
          .update({
            full_name: fullName,
            email,
            phone,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingDriver.id);

        if (driverUpdateError) {
          throw driverUpdateError;
        }

        // Existing Auth user.
        if (editingDriver.auth_user_id) {
          // Only call the Edge Function when Auth details
          // actually need to change.
          if (
            password ||
            email !== editingDriver.email
          ) {
            await invokeAdminDrivers({
              action: "update",
              userId: editingDriver.auth_user_id,
              email,
              ...(password
                ? { password }
                : {}),
            });
          }
        } else if (password) {
          // Driver exists in driver_accounts but has no
          // Supabase Auth account. Create one securely.
          const authResult =
            await invokeAdminDrivers({
              action: "create",
              email,
              password,
            });

          if (!authResult?.userId) {
            throw new Error(
              "Auth user was created but no user ID was returned."
            );
          }

          const {
            error: authLinkError,
          } = await supabase
            .from("driver_accounts")
            .update({
              auth_user_id: authResult.userId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", editingDriver.id);

          if (authLinkError) {
            throw authLinkError;
          }
        }

        setMessage(
          "Driver updated successfully."
        );
      }

      // =========================================================
      // CREATE NEW DRIVER
      // =========================================================
      else {
        const authResult =
          await invokeAdminDrivers({
            action: "create",
            email,
            password,
          });

        if (!authResult?.userId) {
          throw new Error(
            "Auth user was created but no user ID was returned."
          );
        }

        const {
          error: driverInsertError,
        } = await supabase
          .from("driver_accounts")
          .insert({
            full_name: fullName,
            email,
            phone,
            auth_user_id: authResult.userId,
            is_active: true,
          });

        if (driverInsertError) {
          throw driverInsertError;
        }

        setMessage(
          "Driver account created successfully."
        );
      }

      setShowForm(false);

      setForm({
        full_name: "",
        email: "",
        phone: "",
        password: "",
      });

      setEditingDriver(null);

      await loadDrivers();
    } catch (err: any) {
      console.error(
        "Driver save failed:",
        err
      );

      setMessage(
        "Error: " +
          (err?.message ||
            "Failed to save driver.")
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleDriver(driver: any) {
    const newActiveState = !driver.is_active;

    try {
      setMessage("");

      // Update the application driver record.
      const {
        error: databaseError,
      } = await supabase
        .from("driver_accounts")
        .update({
          is_active: newActiveState,
          updated_at: new Date().toISOString(),
        })
        .eq("id", driver.id);

      if (databaseError) {
        throw databaseError;
      }

      // Update the corresponding Supabase Auth account.
      if (driver.auth_user_id) {
        await invokeAdminDrivers({
          action: "toggle",
          userId: driver.auth_user_id,
          active: newActiveState,
        });
      }

      setMessage(
        newActiveState
          ? "Driver activated successfully."
          : "Driver deactivated successfully."
      );

      await loadDrivers();
    } catch (err: any) {
      console.error(
        "Failed to toggle driver:",
        err
      );

      setMessage(
        "Error: " +
          (err?.message ||
            "Failed to update driver.")
      );

      // Reload so the UI reflects the actual DB state.
      await loadDrivers();
    }
  }

  async function deleteDriver(driver: any) {
    const confirmed = confirm(
      `Permanently delete "${driver.full_name}"? Their sales history will be kept.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setMessage("");

      // Delete the Supabase Auth account first.
      if (driver.auth_user_id) {
        await invokeAdminDrivers({
          action: "delete",
          userId: driver.auth_user_id,
        });
      }

      // Delete the application driver record.
      const {
        error: databaseError,
      } = await supabase
        .from("driver_accounts")
        .delete()
        .eq("id", driver.id);

      if (databaseError) {
        throw databaseError;
      }

      setMessage("Driver deleted.");

      await loadDrivers();
    } catch (err: any) {
      console.error(
        "Failed to delete driver:",
        err
      );

      setMessage(
        "Error: " +
          (err?.message ||
            "Failed to delete driver.")
      );

      await loadDrivers();
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* =======================================================
          HEADER
      ======================================================= */}
      <div className="bg-white border-b px-6 py-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {t("settings_title")}
            </h1>

            <p className="text-sm text-gray-500 mt-1">
              {t("settings_manage_drivers")}
            </p>
          </div>

          <button
            onClick={openAdd}
            className="px-4 py-2 bg-black text-white rounded-xl text-sm font-semibold hover:bg-gray-800"
          >
            {t("settings_new_driver")}
          </button>
        </div>
      </div>

      <div className="px-6 py-5 max-w-3xl mx-auto space-y-4">
        {/* =====================================================
            MESSAGE
        ===================================================== */}
        {message && (
          <div
            className={`p-3 rounded-xl text-sm font-medium ${
              message.startsWith("Error")
                ? "bg-red-50 text-red-700"
                : "bg-green-50 text-green-700"
            }`}
          >
            {message}

            <button
              onClick={() => setMessage("")}
              className="ml-2 font-bold"
            >
              ×
            </button>
          </div>
        )}

        {/* =====================================================
            DRIVER FORM
        ===================================================== */}
        {showForm && (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">
                {editingDriver
                  ? `${t(
                      "settings_edit_driver_title"
                    )}: ${editingDriver.full_name}`
                  : t(
                      "settings_new_driver_title"
                    )}
              </h3>

              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingDriver(null);
                }}
                className="text-gray-400 text-xl"
              >
                ×
              </button>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  key: "full_name",
                  label: t(
                    "settings_full_name"
                  ),
                  type: "text",
                  placeholder: t(
                    "settings_name_placeholder"
                  ),
                },
                {
                  key: "email",
                  label: t("settings_email"),
                  type: "email",
                  placeholder: t(
                    "settings_email_placeholder"
                  ),
                },
                {
                  key: "phone",
                  label: t("settings_phone"),
                  type: "text",
                  placeholder: t(
                    "settings_phone_placeholder"
                  ),
                },
                {
                  key: "password",
                  label: editingDriver
                    ? t(
                        "settings_password_edit"
                      )
                    : t("settings_password"),
                  type: "password",
                  placeholder: t(
                    "settings_password_placeholder"
                  ),
                },
              ].map((field) => (
                <div key={field.key}>
                  <label className="text-xs text-gray-500 font-medium block mb-1">
                    {field.label}
                  </label>

                  <input
                    type={field.type}
                    placeholder={
                      field.placeholder
                    }
                    className="w-full h-10 px-3 border rounded-xl text-sm"
                    value={
                      (form as any)[field.key]
                    }
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        [field.key]:
                          e.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>

            <div className="px-5 py-4 border-t bg-gray-50 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingDriver(null);
                }}
                className="px-4 py-2 border rounded-xl text-sm hover:bg-gray-100"
              >
                {t("settings_cancel")}
              </button>

              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-black text-white rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                {saving
                  ? t("settings_saving")
                  : editingDriver
                  ? t("settings_update")
                  : t("settings_create")}
              </button>
            </div>
          </div>
        )}

        {/* =====================================================
            CLEAR TODAY'S DATA
        ===================================================== */}
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">
                Clear Today's Data
              </h3>

              <p className="text-xs text-gray-500 mt-0.5">
                Delete all sales, payments, returns,
                expenses, truck loads, and settlements
                for today
              </p>
            </div>

            <button
              onClick={() =>
                setShowClearConfirm(true)
              }
              disabled={clearing}
              className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
            >
              {clearing
                ? "Clearing..."
                : "Clear Today's Data"}
            </button>
          </div>
        </div>

        {/* =====================================================
            DRIVER LIST
        ===================================================== */}
        {isLoading ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            {t("common_loading")}
          </div>
        ) : drivers.length === 0 ? (
          <div className="bg-white rounded-2xl border p-8 text-center text-gray-400 text-sm">
            {t("settings_no_drivers")}
          </div>
        ) : (
          <div className="space-y-2">
            {drivers.map((driver) => (
              <div
                key={driver.id}
                className={`bg-white rounded-2xl border p-4 flex items-center justify-between gap-3 ${
                  !driver.is_active
                    ? "opacity-60"
                    : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {driver.full_name
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">
                        {driver.full_name}
                      </p>

                      {!driver.is_active && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs rounded-full font-medium">
                          {t(
                            "settings_inactive"
                          )}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-gray-500">
                      {driver.email}
                    </p>

                    {driver.phone && (
                      <p className="text-xs text-gray-400">
                        {driver.phone}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() =>
                      openEdit(driver)
                    }
                    className="px-3 py-1.5 text-xs border rounded-xl hover:bg-gray-50"
                  >
                    {t("settings_edit")}
                  </button>

                  <button
                    onClick={() =>
                      toggleDriver(driver)
                    }
                    className={`px-3 py-1.5 text-xs border rounded-xl font-medium ${
                      driver.is_active
                        ? "text-orange-600 border-orange-200 hover:bg-orange-50"
                        : "text-green-600 border-green-200 hover:bg-green-50"
                    }`}
                  >
                    {driver.is_active
                      ? t(
                          "settings_deactivate"
                        )
                      : t(
                          "settings_activate"
                        )}
                  </button>

                  <button
                    onClick={() =>
                      deleteDriver(driver)
                    }
                    className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-xl hover:bg-red-50"
                  >
                    {t("settings_delete")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* =======================================================
          CLEAR CONFIRMATION MODAL
      ======================================================= */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Clear all of today's data?
            </h3>

            <p className="text-sm text-gray-500 mb-2">
              This will permanently delete all of
              today's:
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
              The session will also be reset to
              "Pending". This action cannot be undone.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() =>
                  setShowClearConfirm(false)
                }
                className="px-4 py-2 border rounded-xl text-sm hover:bg-gray-50"
              >
                {t("common_cancel")}
              </button>

              <button
                onClick={clearTodayData}
                disabled={clearing}
                className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {clearing
                  ? "Clearing..."
                  : "Yes, Clear Everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

