import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { getCurrentSession, onAuthStateChange } from "./db/supabase";
import { useAuthStore } from "./store/useStore";
import AdminNav from "./components/AdminNav";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import ShopsPage from "./pages/ShopsPage";
import SessionsPage from "./pages/SessionsPage";
import ProductsPage from "./pages/ProductsPage";
import OutstandingPage from "./pages/OutstandingPage";
import ReportsPage from "./pages/ReportsPage";
import CorrectionsPage from "./pages/CorrectionsPage";
import SettingsPage from "./pages/SettingsPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <AdminNav />
      {children}
    </>
  );
}

function App() {
  const { setSession, isLoading, setIsLoading } = useAuthStore();

  useEffect(() => {
    async function initAuth() {
      try {
        const session = await getCurrentSession();
        if (session) {
          setSession(session);
        }
      } catch (err) {
        console.error("Failed to get current session:", err);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();

    const subscription = onAuthStateChange((session) => {
      setSession(session);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [setSession, setIsLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Initializing...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<AdminLogin />} />
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/shops"
        element={
          <ProtectedRoute>
            <ShopsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/sessions"
        element={
          <ProtectedRoute>
            <SessionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/products"
        element={
          <ProtectedRoute>
            <ProductsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/outstanding"
        element={
          <ProtectedRoute>
            <OutstandingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <ProtectedRoute>
            <ReportsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/corrections"
        element={
          <ProtectedRoute>
            <CorrectionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;