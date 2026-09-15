import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatApiError } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  Sun, Eye, EyeOff, CheckCircle2, ArrowRight, Package, FileText, Wallet, Building2, AlertCircle
} from "lucide-react";

export default function Login() {
  const { login, googleLogin, handleGoogleCallback } = useAuth();
  const nav = useNavigate();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Detect Supabase Google OAuth callback on mount and on auth state change
  useEffect(() => {
    let mounted = true;
    let handled = false;

    // Check if the current URL actually contains OAuth callback parameters
    const hasOAuthParams = () => {
      const hash = typeof window !== "undefined" ? (window.location.hash || "") : "";
      const search = typeof window !== "undefined" ? (window.location.search || "") : "";
      const pathname = typeof window !== "undefined" ? (window.location.pathname || "") : "";
      return (
        hash.includes("access_token") ||
        hash.includes("refresh_token") ||
        hash.includes("error_description") ||
        search.includes("code=") ||
        search.includes("error=") ||
        pathname === "/auth/callback"
      );
    };

    const processSession = async (session) => {
      if (handled || !session || !session.user || !session.user.email) return;
      handled = true;
      if (mounted) setGoogleLoading(true);
      try {
        await handleGoogleCallback(session);
        if (mounted) {
          toast.success("Signed in with Google!");
          nav("/dashboard");
        }
      } catch (err) {
        if (mounted) {
          const formatted = formatApiError(err);
          setErrorMsg(formatted);
          toast.error(formatted);
          setGoogleLoading(false);
        }
      } finally {
        if (typeof window !== "undefined" && (window.location.hash || window.location.search.includes("code="))) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      }
    };

    // Check for error in URL hash or query params
    if (typeof window !== "undefined") {
      const hash = window.location.hash || "";
      const search = window.location.search || "";
      if (hash.includes("error_description=") || search.includes("error_description=")) {
        const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : search);
        const desc = params.get("error_description") || params.get("error") || "Authentication failed";
        const cleanDesc = decodeURIComponent(desc.replace(/\+/g, " "));
        setErrorMsg(cleanDesc);
        toast.error(cleanDesc);
        window.history.replaceState(null, "", window.location.pathname);
        return;
      }
    }

    // 1. Check existing session ONLY if URL contains OAuth redirect parameters
    if (hasOAuthParams()) {
      supabase.auth.getSession().then(({ data: { session }, error }) => {
        if (error) {
          const msg = error.message || "Google authentication failed";
          setErrorMsg(msg);
          toast.error(msg);
          if (window.location.hash) {
            window.history.replaceState(null, "", window.location.pathname);
          }
          return;
        }
        if (mounted && session) {
          processSession(session);
        }
      }).catch(() => {});
    }

    // 2. Auth state change listener (catches SIGNED_IN event from OAuth redirect)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted && session && (event === "SIGNED_IN" || (event === "TOKEN_REFRESHED" && hasOAuthParams()))) {
        processSession(session);
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [handleGoogleCallback, nav]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    const cleanId = identifier ? identifier.trim() : "";
    if (!cleanId) {
      setErrorMsg("Please enter your Email, Mobile, or Employee ID");
      return;
    }
    if (!password) {
      setErrorMsg("Please enter your password");
      return;
    }

    if (loading) return;
    setLoading(true);
    try {
      await login(cleanId, password);
      toast.success("Welcome back!");
      nav("/dashboard");
    } catch (err) {
      const msg = formatApiError(err);
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    if (googleLoading) return;
    setErrorMsg("");
    setGoogleLoading(true);
    try {
      await googleLogin();
    } catch (err) {
      const msg = formatApiError(err);
      let displayMsg = "Google sign-in could not be completed. Please try again.";
      if (msg.includes("provider is not enabled") || msg.includes("disabled")) {
        displayMsg = "Google login is not enabled in Supabase Dashboard. Please enable Google under Authentication > Providers.";
      }
      setErrorMsg(displayMsg);
      toast.error(displayMsg);
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row text-slate-900 font-sans selection:bg-blue-600 selection:text-white">
      {/* ─── LEFT SIDE — BRAND IDENTITY & VALUE PROPOSITION (58% DESKTOP) ────────── */}
      <div className="relative lg:w-[58%] min-h-[460px] lg:min-h-screen flex flex-col justify-between p-6 sm:p-10 lg:p-12 bg-white border-b lg:border-b-0 lg:border-r border-slate-200">
        
        {/* Brand Header */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Sun className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                SOLARIX
              </span>
              <span className="block text-[10px] font-extrabold text-blue-600 uppercase tracking-widest">
                SOLAR EPC BUSINESS OS
              </span>
            </div>
          </div>
          <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50/80 text-[11px] font-medium px-2.5 py-0.5 rounded-full">
            Enterprise Workspace
          </Badge>
        </div>

        {/* Center Content & Value Proposition */}
        <div className="relative z-10 my-6 lg:my-auto space-y-6 max-w-xl">
          <div className="space-y-2.5">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight leading-[1.2]" style={{ fontFamily: "Outfit, sans-serif" }}>
              Run Your Solar EPC Business From One Place.
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
              Manage projects, inventory, documents, payments, and daily operations without jumping between spreadsheets, WhatsApp, and separate tools.
            </p>
          </div>

          {/* 4 Core Value Points (Clean 2-Column Grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-medium text-xs">
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 transition-shadow">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-slate-900 font-semibold">Project & Client Management</span>
            </div>

            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 transition-shadow">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-slate-900 font-semibold">Inward / Outward Inventory</span>
            </div>

            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 transition-shadow">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-slate-900 font-semibold">Quotations & Documents</span>
            </div>

            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 transition-shadow">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-slate-900 font-semibold">Payments & Receivables</span>
            </div>
          </div>

          {/* Real Problem-Solving Section (Tightened 3-Card Grid) */}
          <div className="pt-4 border-t border-slate-200 space-y-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-600" /> Built around the problems solar teams actually face
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1 text-[11px]">
                  <Package className="w-3.5 h-3.5 text-amber-600 shrink-0" /> Stock tracking
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Material comes in via purchases and leaves to projects.
                </p>
                <div className="text-[10px] font-semibold text-blue-600 pt-0.5">
                  Track inward, outward & balance.
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1 text-[11px]">
                  <FileText className="w-3.5 h-3.5 text-sky-600 shrink-0" /> Repetitive docs
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Quotation & delivery docs require repetitive client data.
                </p>
                <div className="text-[10px] font-semibold text-blue-600 pt-0.5">
                  Mapped data generates docs faster.
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50/60 border border-slate-200/80 space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1 text-[11px]">
                  <Wallet className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> Scattered payments
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Milestone & final payments need project tracking.
                </p>
                <div className="text-[10px] font-semibold text-blue-600 pt-0.5">
                  Full project financial status.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Left Side Footer */}
        <div className="relative z-10 pt-3 border-t border-slate-200 text-[11px] text-slate-400 flex items-center justify-between font-mono">
          <span>Enterprise Solar EPC Operating Platform</span>
          <span>SOLARIX v2.0</span>
        </div>
      </div>

      {/* ─── RIGHT SIDE — SOPHISTICATED DEEP BLUE GRADIENT WITH COMPACT WHITE CARD (42% DESKTOP) ────────── */}
      <div
        className="relative lg:w-[42%] flex flex-col justify-center p-6 sm:p-8 lg:p-10 overflow-hidden"
        style={{
          background: "linear-gradient(150deg, #1D4ED8 0%, #1E40AF 40%, #0F172A 100%)"
        }}
      >
        {/* Ambient Subtle Depth Shapes */}
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-blue-400/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-blue-600/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 w-full max-w-[420px] mx-auto space-y-5">
          {/* Pure Solid White Authentication Card */}
          <Card
            className="border border-slate-200/60 bg-white text-slate-900 overflow-hidden shadow-2xl rounded-2xl"
          >
            <CardContent className="p-6 sm:p-7 space-y-4">
              {/* Header Branding Inside Card */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    <Sun className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-bold text-base text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                    SOLARIX
                  </span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 tracking-tight pt-2" style={{ fontFamily: "Outfit, sans-serif" }}>
                  Welcome back
                </h2>
                <p className="text-xs text-slate-500">
                  Sign in to continue to your workspace.
                </p>
              </div>

              {/* Inline Error Message Display */}
              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium flex items-center gap-2 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span className="leading-tight">{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3.5" data-testid="unified-login-form">
                {/* Identifier Field */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">
                    Email / Mobile / Employee ID
                  </Label>
                  <Input
                    type="text"
                    value={identifier}
                    onChange={(e) => {
                      setIdentifier(e.target.value);
                      if (errorMsg) setErrorMsg("");
                    }}
                    placeholder="Enter email, mobile or EMP ID"
                    className="h-10 text-xs bg-slate-50/70 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 rounded-xl transition [&:-webkit-autofill]:[-webkit-text-fill-color:#0f172a] [&:-webkit-autofill]:[-webkit-box-shadow:0_0_0px_1000px_white_inset]"
                    data-testid="admin-email-input"
                    autoComplete="username"
                    required
                  />
                </div>

                {/* Password Field */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-700">
                      Password
                    </Label>
                    <Link
                      to="/forgot-password"
                      className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                      data-testid="forgot-password-link"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errorMsg) setErrorMsg("");
                      }}
                      placeholder="••••••••"
                      className="h-10 text-xs bg-slate-50/70 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 rounded-xl pr-10 font-medium transition [&:-webkit-autofill]:[-webkit-text-fill-color:#0f172a] [&:-webkit-autofill]:[-webkit-box-shadow:0_0_0px_1000px_white_inset]"
                      data-testid="admin-password-input"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition p-1 cursor-pointer"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition active:scale-[0.99] cursor-pointer"
                  data-testid="admin-login-btn"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Signing in…
                    </span>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>

              {/* Divider */}
              <div className="relative flex items-center justify-center py-1">
                <div className="border-t border-slate-200 w-full" />
                <span className="bg-white px-3 text-[10px] text-slate-400 font-mono uppercase tracking-wider absolute">
                  or
                </span>
              </div>

              {/* Google OAuth Button */}
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleAuth}
                disabled={googleLoading}
                className="w-full h-10 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl gap-2 shadow-2xs transition cursor-pointer"
                data-testid="google-login-btn"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                {googleLoading ? "Connecting Google OAuth…" : "Continue with Google"}
              </Button>

              {/* Sign Up Link Box */}
              <div className="pt-2 text-center border-t border-slate-200/80 flex items-center justify-between text-xs">
                <span className="text-slate-500 text-[11px]">New to SOLARIX?</span>
                <Link
                  to="/register"
                  className="font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 text-[11px]"
                  data-testid="login-register-link"
                >
                  Sign Up <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Microcopy Security Footer below White Card */}
          <div className="text-center text-[10px] font-mono space-y-0.5 text-white/70">
            <p>Authorized workspace access only.</p>
            <p>Your access is managed by your company administrator.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
