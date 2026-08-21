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
  Sun, Eye, EyeOff, CheckCircle2, ArrowRight, Package, FileText, Wallet, Building2
} from "lucide-react";

export default function Login() {
  const { login, googleLogin, handleGoogleCallback } = useAuth();
  const nav = useNavigate();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Detect Supabase Google OAuth callback on mount and on auth state change
  useEffect(() => {
    let mounted = true;
    let handled = false;

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
          toast.error(formatApiError(err));
          setGoogleLoading(false);
        }
        if (window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      }
    };

    // 1. Initial check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted && session) {
        processSession(session);
      }
    }).catch(() => {});

    // 2. Auth state change listener (catches hash token completion)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted && session && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")) {
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
    const cleanId = identifier ? identifier.trim() : "";
    if (!cleanId) {
      toast.error("Please enter your Email, Mobile, or Employee ID");
      return;
    }
    if (!password) {
      toast.error("Please enter your password");
      return;
    }

    if (loading) return;
    setLoading(true);
    try {
      await login(cleanId, password);
      toast.success("Welcome back!");
      nav("/dashboard");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    try {
      await googleLogin();
    } catch (err) {
      const msg = formatApiError(err);
      if (msg.includes("provider is not enabled") || msg.includes("disabled")) {
        toast.error("Google login is not enabled in Supabase Dashboard. Please enable Google under Authentication > Providers.");
      } else {
        toast.error("Google sign-in could not be completed. Please try again.");
      }
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col lg:flex-row text-slate-900 font-sans selection:bg-blue-600 selection:text-white">
      {/* ─── LEFT SIDE — WHITE BACKGROUND WITH SUBTLE BLUE GLASS CARDS (58% DESKTOP) ────────── */}
      <div className="relative lg:w-[58%] min-h-[440px] lg:min-h-screen flex flex-col justify-between p-6 sm:p-10 lg:p-12 bg-gradient-to-br from-blue-50/20 via-white to-slate-50/40 border-b lg:border-b-0 lg:border-r border-slate-200">
        
        {/* Brand Header */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Sun className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-slate-900 font-mono" style={{ fontFamily: "Outfit" }}>
                SOLARIX
              </span>
              <span className="block text-[11px] font-semibold text-blue-600 uppercase tracking-widest">
                Solar EPC Business OS
              </span>
            </div>
          </div>
          <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 text-xs font-mono px-3 py-1">
            Enterprise Workspace
          </Badge>
        </div>

        {/* Center Content & Value Proposition */}
        <div className="relative z-10 my-8 lg:my-auto space-y-6 max-w-2xl">
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-[1.15]" style={{ fontFamily: "Outfit" }}>
              Run Your Solar EPC Business From One Place.
            </h1>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-normal">
              Manage projects, inventory, documents, payments and daily operations without jumping between spreadsheets, WhatsApp and separate tools.
            </p>
          </div>

          {/* 4 Core Value Points (Subtle Glass Cards) */}
          <div className="grid grid-cols-2 gap-3 pt-1 font-medium text-xs sm:text-sm">
            <div
              className="flex items-center gap-2.5 p-3 rounded-xl transition-shadow"
              style={{
                background: "rgba(255, 255, 255, 0.75)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(37, 99, 235, 0.12)",
                boxShadow: "0 8px 25px rgba(30, 64, 175, 0.06)",
                borderRadius: "12px"
              }}
            >
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-slate-900 font-medium">Project & Client Management</span>
            </div>

            <div
              className="flex items-center gap-2.5 p-3 rounded-xl transition-shadow"
              style={{
                background: "rgba(255, 255, 255, 0.75)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(37, 99, 235, 0.12)",
                boxShadow: "0 8px 25px rgba(30, 64, 175, 0.06)",
                borderRadius: "12px"
              }}
            >
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-slate-900 font-medium">Inward / Outward Inventory</span>
            </div>

            <div
              className="flex items-center gap-2.5 p-3 rounded-xl transition-shadow"
              style={{
                background: "rgba(255, 255, 255, 0.75)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(37, 99, 235, 0.12)",
                boxShadow: "0 8px 25px rgba(30, 64, 175, 0.06)",
                borderRadius: "12px"
              }}
            >
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-slate-900 font-medium">Quotations & Documents</span>
            </div>

            <div
              className="flex items-center gap-2.5 p-3 rounded-xl transition-shadow"
              style={{
                background: "rgba(255, 255, 255, 0.75)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(37, 99, 235, 0.12)",
                boxShadow: "0 8px 25px rgba(30, 64, 175, 0.06)",
                borderRadius: "12px"
              }}
            >
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="text-slate-900 font-medium">Payments & Receivables</span>
            </div>
          </div>

          {/* Real Problem-Solving Section */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-blue-600 font-mono flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-blue-600" /> Built around the problems solar teams actually face
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div
                className="p-3 rounded-xl space-y-1"
                style={{
                  background: "rgba(255, 255, 255, 0.85)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  border: "1px solid rgba(37, 99, 235, 0.1)",
                  boxShadow: "0 4px 15px rgba(30, 64, 175, 0.04)",
                  borderRadius: "12px"
                }}
              >
                <div className="font-bold text-slate-900 flex items-center gap-1 text-[11px]">
                  <Package className="w-3.5 h-3.5 text-amber-600 shrink-0" /> Stock tracking
                </div>
                <p className="text-[11px] text-slate-600 leading-tight">
                  Material comes in through purchases and goes out to projects.
                </p>
                <div className="text-[10px] font-bold text-blue-700 pt-1">
                  SOLARIX: Track inward, outward & balance.
                </div>
              </div>

              <div
                className="p-3 rounded-xl space-y-1"
                style={{
                  background: "rgba(255, 255, 255, 0.85)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  border: "1px solid rgba(37, 99, 235, 0.1)",
                  boxShadow: "0 4px 15px rgba(30, 64, 175, 0.04)",
                  borderRadius: "12px"
                }}
              >
                <div className="font-bold text-slate-900 flex items-center gap-1 text-[11px]">
                  <FileText className="w-3.5 h-3.5 text-sky-600 shrink-0" /> Repetitive docs
                </div>
                <p className="text-[11px] text-slate-600 leading-tight">
                  Quotation & delivery docs require repetitive client data entry.
                </p>
                <div className="text-[10px] font-bold text-blue-700 pt-1">
                  SOLARIX: Mapped data generates docs faster.
                </div>
              </div>

              <div
                className="p-3 rounded-xl space-y-1"
                style={{
                  background: "rgba(255, 255, 255, 0.85)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  border: "1px solid rgba(37, 99, 235, 0.1)",
                  boxShadow: "0 4px 15px rgba(30, 64, 175, 0.04)",
                  borderRadius: "12px"
                }}
              >
                <div className="font-bold text-slate-900 flex items-center gap-1 text-[11px]">
                  <Wallet className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> Scattered payments
                </div>
                <p className="text-[11px] text-slate-600 leading-tight">
                  Milestone & final payments need project tracking.
                </p>
                <div className="text-[10px] font-bold text-blue-700 pt-1">
                  SOLARIX: Full project financial status.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Left Side Footer */}
        <div className="relative z-10 pt-4 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between font-mono">
          <span>Enterprise Solar EPC Operating Platform</span>
          <span>SOLARIX v2.0</span>
        </div>
      </div>

      {/* ─── RIGHT SIDE — SOPHISTICATED SOLRIX BLUE GRADIENT WITH WHITE CARD (42% DESKTOP) ────────── */}
      <div
        className="relative lg:w-[42%] flex flex-col justify-center p-6 sm:p-8 lg:p-12 overflow-hidden"
        style={{
          background: "linear-gradient(145deg, #2563EB 0%, #1D4ED8 45%, #172554 100%)"
        }}
      >
        {/* Ambient Subtle Depth Shapes */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-blue-400/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-blue-600/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 w-full max-w-[460px] mx-auto space-y-6">
          {/* Pure Solid White Authentication Card */}
          <Card
            className="border border-white/50 bg-white text-slate-900 overflow-hidden"
            style={{
              borderRadius: "18px",
              boxShadow: "0 24px 60px rgba(7, 25, 70, 0.25)"
            }}
          >
            <CardContent className="p-6 sm:p-8 space-y-5">
              {/* Header Branding Inside Card */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    <Sun className="w-5 h-5 text-white" />
                  </div>
                  <span className="font-bold text-lg text-slate-900 font-mono" style={{ fontFamily: "Outfit" }}>
                    SOLARIX
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight pt-3" style={{ fontFamily: "Outfit" }}>
                  Welcome back
                </h2>
                <p className="text-xs text-slate-500">
                  Sign in to continue to your workspace.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4" data-testid="unified-login-form">
                {/* Identifier Field */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-800">
                    Email / Mobile / Employee ID
                  </Label>
                  <Input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Enter email, mobile or EMP ID"
                    className="h-11 text-xs bg-white border-[#D7DEEA] text-[#0F172A] placeholder-[#64748B] focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 rounded-xl"
                    data-testid="admin-email-input"
                    autoComplete="username"
                    required
                  />
                </div>

                {/* Password Field */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-800">
                      Password
                    </Label>
                    <Link
                      to="/forgot-password"
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                      data-testid="forgot-password-link"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-11 text-xs bg-white border-[#D7DEEA] text-[#0F172A] placeholder-[#64748B] focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 rounded-xl pr-10 font-medium"
                      data-testid="admin-password-input"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition p-1"
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
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition hover:-translate-y-0.5"
                  data-testid="admin-login-btn"
                >
                  {loading ? "Signing in…" : "Sign In"}
                </Button>
              </form>

              {/* Divider */}
              <div className="relative flex items-center justify-center">
                <div className="border-t border-slate-200 w-full" />
                <span className="bg-white px-3 text-[11px] text-slate-400 font-mono uppercase tracking-wider absolute">
                  or
                </span>
              </div>

              {/* Google OAuth Button */}
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleAuth}
                disabled={googleLoading}
                className="w-full h-11 border-[#D7DEEA] bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs rounded-xl gap-2 shadow-2xs transition"
                data-testid="google-login-btn"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
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
              <div className="pt-3 text-center border-t border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-500">New to SOLARIX?</span>
                <Link
                  to="/register"
                  className="font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
                  data-testid="login-register-link"
                >
                  Sign Up <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Microcopy Security Footer below White Card */}
          <div className="text-center text-[10px] font-mono space-y-0.5" style={{ color: "rgba(255, 255, 255, 0.75)" }}>
            <p>Authorized workspace access only.</p>
            <p>Your workspace access is controlled by your company administrator.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
