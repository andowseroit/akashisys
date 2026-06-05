import { useNavigate, useLocation } from "react-router-dom";
import { logoutUser } from "../db/supabase";
import { useLang } from "../i18n/LanguageContext";

export default function AdminNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { language, toggleLanguage, t } = useLang();

  async function handleLogout() {
    try {
      await logoutUser();
      navigate("/");
    } catch (err) {
      console.error("Logout failed:", err);
      navigate("/");
    }
  }

  const links = [
    { label: t("nav_dashboard"),   path: "/admin/dashboard" },
    { label: t("nav_sessions"),    path: "/admin/sessions" },
    { label: t("nav_shops"),       path: "/admin/shops" },
    { label: t("nav_products"),    path: "/admin/products" },
    { label: t("nav_outstanding"), path: "/admin/outstanding" },
    { label: t("nav_reports"),     path: "/admin/reports" },
    { label: t("nav_corrections"), path: "/admin/corrections" },
    { label: t("nav_settings"),    path: "/admin/settings" },
  ];

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <button
            onClick={() => navigate("/admin/dashboard")}
            className="text-lg font-bold text-gray-900 hover:text-gray-600"
          >
            Flour Mgmt
          </button>

          <div className="hidden md:flex gap-1">
            {links.map((link) => {
              const isActive = location.pathname === link.path;

              return (
                <button
                  key={link.path}
                  onClick={() => navigate(link.path)}
                  className={`text-sm font-medium py-2 px-3 rounded-lg transition-colors ${
                    isActive
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mobile menu */}
        <div className="flex md:hidden gap-1 overflow-x-auto">
          {links.map((link) => {
            const isActive = location.pathname === link.path;

            return (
              <button
                key={link.path}
                onClick={() => navigate(link.path)}
                className={`text-xs font-medium py-1.5 px-2 rounded-lg whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {link.label}
              </button>
            );
          })}
        </div>

        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 text-sm font-semibold hover:bg-gray-50 transition-colors"
          title={language === "en" ? "Switch to Sinhala" : "Switch to English"}
        >
          <span className="text-base">{language === "en" ? "🇱🇰" : "🇬🇧"}</span>
          <span className="text-gray-700">{language === "en" ? "සිංහල" : "EN"}</span>
        </button>

        <button
          onClick={handleLogout}
          className="text-sm text-gray-600 hover:text-gray-900 font-medium ml-4"
        >
          {t("nav_logout")}
        </button>
      </div>
    </nav>
  );
}