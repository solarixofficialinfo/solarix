import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { formatApiError } from "@/lib/api";
import { Sun, ArrowLeft, Building2, User, Phone, Mail, Lock, MapPin, CheckCircle2 } from "lucide-react";
import LocationAutoFill from "@/components/LocationAutoFill";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({
    owner_name: "",
    company_name: "",
    mobile: "",
    alt_mobile: "",
    email: "",
    password: "",
    confirm_password: "",
    gst_number: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    business_type: "Solar EPC",
  });
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleMobileChange = (e) => {
    const clean = e.target.value.replace(/\D/g, "").slice(0, 10);
    setForm((prev) => ({ ...prev, mobile: clean }));
  };

  const handleAltMobileChange = (e) => {
    const clean = e.target.value.replace(/\D/g, "").slice(0, 10);
    setForm((prev) => ({ ...prev, alt_mobile: clean }));
  };

  const getMobileError = (m) => {
    if (!m) return "";
    if (m.length < 10) return "Enter a valid 10-digit mobile number.";
    if (!/^[6-9]/.test(m)) return "Enter a valid Indian mobile number.";
    return "";
  };

  const mobileError = getMobileError(form.mobile);
  const isMobileValid = form.mobile.length === 10 && /^[6-9]\d{9}$/.test(form.mobile);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.owner_name.trim()) {
      toast.error("Owner Name is required");
      return;
    }
    if (!form.company_name.trim()) {
      toast.error("Company Name is required");
      return;
    }
    if (!form.mobile.trim()) {
      toast.error("Mobile Number is required");
      return;
    }
    if (form.mobile.length < 10) {
      toast.error("Enter a valid 10-digit mobile number.");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(form.mobile)) {
      toast.error("Enter a valid Indian mobile number.");
      return;
    }
    if (!form.email.trim()) {
      toast.error("Email Address is required");
      return;
    }
    if (!form.password) {
      toast.error("Password is required");
      return;
    }
    if (form.password !== form.confirm_password) {
      toast.error("Passwords do not match. Please verify password.");
      return;
    }

    if (loading) return;
    setLoading(true);
    try {
      const payload = {
        owner_name: form.owner_name,
        company_name: form.company_name,
        mobile: form.mobile,
        alt_mobile: form.alt_mobile,
        email: form.email,
        password: form.password,
        gst_number: form.gst_number,
        address: form.address,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        business_type: form.business_type
      };
      const res = await register(payload);
      if (res?.resumed) {
        toast.success("Registration completed successfully!");
      } else {
        toast.success("Vendor account created successfully!");
      }
      nav("/dashboard");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Navigation Header Bar */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-2xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-sm">
              <Sun className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold tracking-tight text-base text-slate-900 font-mono" style={{ fontFamily: "Outfit" }}>
                SOLARIX
              </span>
              <span className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                GVP Solar Energy Vendor Portal
              </span>
            </div>
          </div>

          <Link
            to="/login"
            className="text-xs font-semibold text-slate-600 hover:text-blue-600 flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition"
            data-testid="register-login-link"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
          </Link>
        </div>
      </header>

      {/* Main Vendor Registration Body */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="mb-6 text-center sm:text-left space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>
            Create Vendor Account
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Register your company account to manage orders, material dispatches, and transactions.
          </p>
        </div>

        <Card className="border-slate-200 shadow-sm bg-white rounded-2xl overflow-hidden">
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={submit} className="space-y-6" data-testid="vendor-registration-form">
              {/* SECTION 1: COMPANY INFORMATION */}
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-blue-600" /> 1. Company Information
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Owner Name *</Label>
                    <Input
                      value={form.owner_name}
                      onChange={set("owner_name")}
                      placeholder="Full name of company owner / director"
                      className="mt-1 text-xs h-9 bg-white border-slate-200 focus:border-blue-600"
                      required
                      data-testid="reg-owner-name"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Company Name *</Label>
                    <Input
                      value={form.company_name}
                      onChange={set("company_name")}
                      placeholder="Registered business / firm name"
                      className="mt-1 text-xs h-9 bg-white border-slate-200 focus:border-blue-600"
                      required
                      data-testid="reg-company-name"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Business Type *</Label>
                    <Select value={form.business_type} onValueChange={(v) => setForm({ ...form, business_type: v })}>
                      <SelectTrigger className="mt-1 text-xs h-9 bg-white border-slate-200" data-testid="reg-business-type">
                        <SelectValue placeholder="Select business type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Solar EPC">Solar EPC</SelectItem>
                        <SelectItem value="Solar Vendor">Solar Vendor</SelectItem>
                        <SelectItem value="EPC + Vendor">EPC + Vendor</SelectItem>
                        <SelectItem value="General Supplier">General Supplier</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">GST Number (Optional)</Label>
                    <Input
                      value={form.gst_number}
                      onChange={set("gst_number")}
                      placeholder="e.g. 27AKMPD5407A1ZM"
                      className="mt-1 text-xs h-9 bg-white border-slate-200 font-mono uppercase focus:border-blue-600"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: CONTACT INFORMATION */}
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-blue-600" /> 2. Contact Information
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Mobile Number *</Label>
                    <Input
                      value={form.mobile}
                      onChange={handleMobileChange}
                      placeholder="10-digit mobile number"
                      maxLength={10}
                      className={`mt-1 text-xs h-9 bg-white font-mono ${
                        mobileError ? "border-red-500 focus:border-red-600 focus:ring-red-500/20" : "border-slate-200 focus:border-blue-600"
                      }`}
                      required
                      data-testid="reg-mobile"
                    />
                    {mobileError && (
                      <p className="mt-1 text-[11px] font-semibold text-red-600" data-testid="reg-mobile-error">
                        {mobileError}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Alternate Mobile</Label>
                    <Input
                      value={form.alt_mobile}
                      onChange={handleAltMobileChange}
                      placeholder="Secondary 10-digit mobile"
                      maxLength={10}
                      className="mt-1 text-xs h-9 bg-white border-slate-200 font-mono focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Email Address *</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={set("email")}
                      placeholder="vendor@company.com"
                      className="mt-1 text-xs h-9 bg-white border-slate-200 font-mono focus:border-blue-600"
                      required
                      data-testid="reg-email"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 3: ACCOUNT SECURITY */}
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-blue-600" /> 3. Account Security
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Password *</Label>
                    <Input
                      type="password"
                      value={form.password}
                      onChange={set("password")}
                      placeholder="Minimum 6 characters"
                      className="mt-1 text-xs h-9 bg-white border-slate-200 font-medium focus:border-blue-600"
                      required
                      minLength={6}
                      data-testid="reg-password"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Confirm Password *</Label>
                    <Input
                      type="password"
                      value={form.confirm_password}
                      onChange={set("confirm_password")}
                      placeholder="Re-enter password to verify"
                      className="mt-1 text-xs h-9 bg-white border-slate-200 font-medium focus:border-blue-600"
                      required
                      minLength={6}
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 4: BUSINESS ADDRESS */}
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-blue-600" /> 4. Business Address
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Street Address / Landmark</Label>
                    <Input
                      value={form.address}
                      onChange={set("address")}
                      placeholder="Building, street, area, landmark"
                      className="mt-1 text-xs h-9 bg-white border-slate-200 focus:border-blue-600"
                    />
                  </div>

                  <LocationAutoFill
                    city={form.city}
                    state={form.state}
                    pincode={form.pincode}
                    onChange={({ city, state, pincode }) => setForm({ ...form, city, state, pincode })}
                  />
                </div>
              </div>

              {/* ACTION & FOOTER LINKS */}
              <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-xs text-slate-500 font-medium text-center sm:text-left">
                  Already have a vendor account?{" "}
                  <Link to="/login" className="text-blue-600 hover:text-blue-700 font-bold hover:underline">
                    Sign In
                  </Link>
                </div>

                <Button
                  type="submit"
                  disabled={loading || !isMobileValid}
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold text-xs px-6 h-10 shadow-sm rounded-xl transition-all"
                  data-testid="vendor-submit-btn"
                >
                  {loading ? "Creating your workspace..." : "Create Vendor Account"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
