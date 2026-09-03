import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../db/supabase";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();

  async function handlePasswordUpdate(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setMessage("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        throw error;
      }

      setMessage("Password updated successfully.");

      setTimeout(() => {
        navigate("/");
      }, 1500);
    } catch (err: any) {
      setError(err?.message || "Failed to update password.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-gray-800 px-4">
      <div className="bg-white rounded-2xl p-8 shadow-2xl w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-2 text-gray-900">
          Reset Password
        </h1>

        <p className="text-gray-500 text-center text-sm mb-8">
          Enter your new administrator password.
        </p>

        <form onSubmit={handlePasswordUpdate} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              New Password
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              className="w-full h-11 px-3 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Confirm Password
            </label>

            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
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
            disabled={isLoading}
            className="w-full h-11 bg-black text-white rounded-lg font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed mt-6"
          >
            {isLoading ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
