

/// <reference types="vite/client" />

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Please check your .env.local file."
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);


// Login with email and password
export async function loginUser(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;

  return data;
}


// Get current user role
export async function getUserRole(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Failed to get user role:", error);
    return undefined;
  }

  return data?.role;
}


// Logout current user
export async function logoutUser() {
  const { error } = await supabase.auth.signOut();

  if (error) throw error;
}


// Get current session
export async function getCurrentSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) throw error;

  return session;
}


// Subscribe to auth state changes
export function onAuthStateChange(
  callback: (session: any) => void
) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      callback(session);
    }
  );

  return subscription;
}


// Send password reset email
export async function resetPassword(email: string) {
  const { error } =
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

  if (error) throw error;
}