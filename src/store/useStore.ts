import { create } from "zustand";
import { Session } from "@supabase/supabase-js";

interface AuthStore {
  session: Session | null;
  userRole: "admin" | "driver" | null;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  setUserRole: (role: "admin" | "driver" | null) => void;
  setIsLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  userRole: null,
  isLoading: true,
  setSession: (session) => set({ session }),
  setUserRole: (role) => set({ userRole: role }),
  setIsLoading: (loading) => set({ isLoading: loading }),
}));

interface AdminStore {
  selectedShopId: string | null;
  selectedProductId: string | null;
  setSelectedShopId: (id: string | null) => void;
  setSelectedProductId: (id: string | null) => void;
}

export const useAdminStore = create<AdminStore>((set) => ({
  selectedShopId: null,
  selectedProductId: null,
  setSelectedShopId: (id) => set({ selectedShopId: id }),
  setSelectedProductId: (id) => set({ selectedProductId: id }),
}));
