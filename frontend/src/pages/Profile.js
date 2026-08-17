import React, { useEffect, useState } from "react";
import api, { formatApiError, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useCompany } from "@/hooks/useClients";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, Image as ImageIcon } from "lucide-react";
import LocationAutoFill from "@/components/LocationAutoFill";

export default function Profile() {
  const { user, refreshCompany } = useAuth();
  const queryClient = useQueryClient();
  const { data: companyData, isLoading: loading, error: companyError } = useCompany();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const canEdit = user?.role === "Super Admin" || user?.role === "Admin" || user?.user_type === "owner" || user?.permissions?.settings?.edit === true;
  const set = (k) => (e) => {
    if (!canEdit) return;
    setForm({ ...form, [k]: e.target.value });
  };

  // Sync local form state when company data loads or changes
  useEffect(() => {
    if (companyData && !form) {
      setForm({ ...companyData, documents: companyData?.documents || {} });
    }
  }, [companyData]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidateCompany = () => queryClient.invalidateQueries({ queryKey: queryKeys.company.detail() });

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      delete payload.id; delete payload.created_at; delete payload.trial_start; delete payload.trial_end; delete payload.plan;
      await api.put("/company", payload);
      toast.success("Profile saved");
      refreshCompany();
      invalidateCompany();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const uploadLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("category", "logo");
      const { data } = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const updated = { ...form, logo_file_id: data.id };
      setForm(updated);
      await api.put("/company", { logo_file_id: data.id });
      refreshCompany();
      toast.success("Logo uploaded");
    } catch (err) { toast.error(formatApiError(err)); }
    finally { e.target.value = ""; }
  };

  if (loading) return <div className="text-slate-500">Loading…</div>;
  if (companyError) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Unable to load company details. {formatApiError(companyError)}</div>;
  if (!form) return <div className="text-slate-500">No company data available.</div>;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Company Profile</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your company information and template documents.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="border-slate-200 lg:col-span-2" data-testid="company-profile-form">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-4 h-4 text-blue-600" />
              <div className="font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>Company Information</div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <F label="Company Name"><Input value={form.company_name || ""} onChange={set("company_name")} /></F>
              <F label="Owner Name"><Input value={form.owner_name || ""} onChange={set("owner_name")} /></F>
              <F label="Mobile"><Input value={form.mobile || ""} onChange={set("mobile")} /></F>
              <F label="Alternate Mobile"><Input value={form.alt_mobile || ""} onChange={set("alt_mobile")} /></F>
              <F label="Company Business Email (Read-Only)">
                <Input value={form.email || ""} readOnly className="bg-slate-100 cursor-not-allowed text-slate-600 font-mono text-xs" />
              </F>
              <F label="GST Number"><Input value={form.gst_number || ""} onChange={set("gst_number")} /></F>
              <F label="Website"><Input value={form.website || ""} onChange={set("website")} placeholder="https://" /></F>
              <F label="Support Number"><Input value={form.support_number || ""} onChange={set("support_number")} /></F>
              <F label="Business Type">
                <Select value={form.business_type} onValueChange={(v) => setForm({ ...form, business_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Solar EPC">Solar EPC</SelectItem>
                    <SelectItem value="Solar Vendor">Solar Vendor</SelectItem>
                    <SelectItem value="EPC + Vendor">EPC + Vendor</SelectItem>
                  </SelectContent>
                </Select>
              </F>
              <F label="Street Address / Landmark" full><Input value={form.address || ""} onChange={set("address")} /></F>
              <div className="col-span-full">
                <LocationAutoFill
                  city={form.city || ""}
                  state={form.state || ""}
                  pincode={form.pincode || ""}
                  onChange={({ city, state, pincode }) => setForm({ ...form, city, state, pincode })}
                />
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between">
              {!canEdit && (
                <div className="text-xs text-slate-500 italic">
                  View-only mode. Administrator permissions required to modify company details.
                </div>
              )}
              {canEdit && (
                <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700 ml-auto" data-testid="save-profile-btn">{saving ? "Saving…" : "Save Profile"}</Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-6">
            <div className="font-semibold text-slate-900 mb-4" style={{ fontFamily: "Outfit" }}>Company Logo</div>
            <label className={`block aspect-square rounded-xl border-2 border-dashed border-slate-200 ${canEdit ? "hover:border-blue-400 cursor-pointer" : "cursor-default opacity-80"} flex items-center justify-center overflow-hidden bg-slate-50`} data-testid="company-logo-upload">
              {form.logo_file_id ? (
                <img src={fileUrl(form.logo_file_id)} alt="Logo" className="object-contain w-full h-full" />
              ) : (
                <div className="text-center text-slate-400">
                  <ImageIcon className="w-10 h-10 mx-auto mb-2" />
                  <div className="text-sm">{canEdit ? "Click to upload logo" : "No logo uploaded"}</div>
                </div>
              )}
              {canEdit && <input type="file" accept="image/*" className="hidden" onChange={uploadLogo} />}
            </label>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const F = ({ label, children, full }) => (
  <div className={full ? "md:col-span-2" : ""}>
    <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</Label>
    <div className="mt-1.5">{children}</div>
  </div>
);
