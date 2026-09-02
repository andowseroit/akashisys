
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser, resetPassword } from "../db/supabase";
import { useAuthStore } from "../store/useStore";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const navigate = useNavigate();
  const { setSession } = useAuthStore();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();

    if (!email || !password) return;

    setIsLoading(true);
    setError("");
    setMessage("");

    try {
      const result = await loginUser(email, password);
      setSession(result.session);
      navigate("/admin/dashboard");
    } catch (err: any) {
      setError("Invalid email or password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Enter your email address first.");
      return;
    }

    setIsResetting(true);
    setError("");
    setMessage("");

    try {
      await resetPassword(email);

      setMessage(
        "If an account exists with this email, a password reset link has been sent."
      );
    } catch (err: any) {
      setError(err.message || "Failed to send password reset email.");
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-gray-800 px-4">
      <div className="bg-white rounded-2xl p-8 shadow-2xl w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-2 text-gray-900">
          Admin Portal
        </h1>

        <p className="text-gray-500 text-center text-sm mb-8">
          Flour Distribution Management System
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Email
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@flourmgmt.local"
              className="w-full h-11 px-3 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Password
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-11 px-3 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-500"
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center bg-red-50 p-3 rounded-lg">
              {error}
            </p>
          )}

          {message && (
            <p className="text-green-600 text-sm text-center bg-green-50 p-3 rounded-lg">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading || isResetting}
            className="w-full h-11 bg-black text-white rounded-lg font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed mt-6"
          >
            {isLoading ? "Logging in..." : "Login"}
          </button>

          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={isLoading || isResetting}
            className="w-full text-sm text-gray-600 hover:text-black hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isResetting ? "Sending reset link..." : "Forgot password?"}
          </button>
        </form>
      </div>
    </div>
  );
}
