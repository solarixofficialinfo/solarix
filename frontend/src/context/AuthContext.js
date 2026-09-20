import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { supabase } from "@/lib/supabase";

const AuthContext = createContext(null);

// On-demand data loading: pages load their respective data when navigated to.
// Disabling eager prefetch prevents a 6-endpoint storm immediately after login.
function _prefetchCommonData(_queryClient) {
  // Data loads on-demand per page via React Query hooks with automatic caching.
}

export const AuthProvider = ({ children }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  // Prevent React StrictMode double-mount from firing two /auth/me fetches
  const fetchingRef = useRef(false);

  const fetchMe = useCallback(async () => {
    if (fetchingRef.current) return;
    const token = localStorage.getItem("solarix_token");
    if (!token) {
      setUser(false);
      setCompany(null);
      setLoading(false);
      return;
    }
    fetchingRef.current = true;
    try {
      const { data } = await api.get("/auth/me", { timeout: 5000 });
      setUser(data.user);
      setCompany(data.company);
      // Prefetch commonly used data so first navigation is instant
      _prefetchCommonData(queryClient);
    } catch {
      localStorage.removeItem("solarix_token");
      localStorage.removeItem("solarix_refresh_token");
      setUser(false);
      setCompany(null);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [queryClient]);

  useEffect(() => { fetchMe(); }, [fetchMe]);


  // Allow any component to ask AuthContext to re-fetch /auth/me
  // by dispatching window event `solarix:auth-refresh`.
  useEffect(() => {
    const handler = () => { fetchMe(); };
    window.addEventListener("solarix:auth-refresh", handler);
    return () => window.removeEventListener("solarix:auth-refresh", handler);
  }, [fetchMe]);

  const login = async (identifier, password) => {
    const { data } = await api.post("/auth/login", { identifier, password });
    if (data.token) localStorage.setItem("solarix_token", data.token);
    if (data.refresh_token) localStorage.setItem("solarix_refresh_token", data.refresh_token);
    setUser(data.user);
    setCompany(data.company);
    // Prefetch after login so navigating to clients/inventory/projects is instant
    _prefetchCommonData(queryClient);
    return data;
  };

  const googleLogin = async () => {
    // Always use the current browser origin as the redirect URL.
    // On Vercel production, window.location.origin is the Vercel URL.
    // In development, it is http://localhost:3000.
    // Never rely on NODE_ENV for this — it reflects build time, not runtime.
    let origin = (typeof window !== "undefined" && window.location?.origin)
      ? window.location.origin
      : (process.env.REACT_APP_SITE_URL || "https://solarix-cumx-sable.vercel.app");
    origin = origin.replace(/\/+$/, "");
    const redirectUrl = `${origin}/login`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
        queryParams: { prompt: "select_account" }
      }
    });
    if (error) throw error;
    return data;
  };

  const handleGoogleCallback = async (sbSession) => {
    if (!sbSession || !sbSession.user || !sbSession.user.email) {
      throw new Error("Invalid Google authentication session");
    }
    const email = sbSession.user.email;
    const sbToken = sbSession.access_token;
    try {
      const { data } = await api.post("/auth/google", {
        email,
        supabase_access_token: sbToken
      });
      if (data.token) localStorage.setItem("solarix_token", data.token);
      if (data.refresh_token) localStorage.setItem("solarix_refresh_token", data.refresh_token);
      setUser(data.user);
      setCompany(data.company);
      _prefetchCommonData(queryClient);
      return data;
    } catch (err) {
      await supabase.auth.signOut().catch(() => {});
      throw err;
    }
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    if (data.token) localStorage.setItem("solarix_token", data.token);
    if (data.refresh_token) localStorage.setItem("solarix_refresh_token", data.refresh_token);
    setUser(data.user);
    setCompany(data.company);
    return data;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    try { await supabase.auth.signOut(); } catch {}
    localStorage.removeItem("solarix_token");
    localStorage.removeItem("solarix_refresh_token");
    setUser(false);
    setCompany(null);
    // Clear all cached data on logout
    queryClient.clear();
  };

  const refreshCompany = async () => {
    const { data } = await api.get("/company");
    setCompany(data);
  };

  return (
    <AuthContext.Provider value={{ user, company, loading, login, googleLogin, handleGoogleCallback, register, logout, refreshCompany, setCompany }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
