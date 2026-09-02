import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import {
  getCurrentSession,
  getUserRole,
  onAuthStateChange,
} from "./db/supabase";
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
import ResetPassword from "./pages/ResetPassword";

function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, userRole, isLoading } = useAuthStore();

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

  if (userRole !== "admin") {
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
  const {
    session,
    setSession,
    setUserRole,
    isLoading,
    setIsLoading,
  } = useAuthStore();

  // Initialize and listen for authentication changes.
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        const currentSession = await getCurrentSession();

        if (mounted) {
          setSession(currentSession);
        }
      } catch (err) {
        console.error(
          "Failed to get current session:",
          err
        );

        if (mounted) {
          setSession(null);
        }
      }
    }

    initAuth();

    const subscription = onAuthStateChange(
      (nextSession) => {
        if (!mounted) return;

        setSession(nextSession);

        if (!nextSession) {
          setUserRole(null);
        }
      }
    );

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [setSession, setUserRole]);

  // Load the server-controlled role whenever the authenticated
  // user's ID changes.
  useEffect(() => {
    let mounted = true;

    async function loadRole() {
      setIsLoading(true);

      if (!session?.user?.id) {
        setUserRole(null);

        if (mounted) {
          setIsLoading(false);
        }

        return;
      }

      try {
        const role = await getUserRole(session.user.id);

        if (!mounted) return;

        if (role === "admin") {
          setUserRole("admin");
        } else if (role === "driver") {
          setUserRole("driver");
        } else {
          setUserRole(null);
        }
      } catch (err) {
        console.error(
          "Failed to load user role:",
          err
        );

        if (mounted) {
          setUserRole(null);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadRole();

    return () => {
      mounted = false;
    };
  }, [
    session?.user?.id,
    setUserRole,
    setIsLoading,
  ]);

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

      <Route
        path="/reset-password"
        element={<ResetPassword />}
      />

      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
  );
}

export default App;