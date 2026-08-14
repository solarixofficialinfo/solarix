import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useCreateClient } from "@/hooks/useClients";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, Upload, FileText, X, Plus, Trash2, DollarSign, Landmark, Layers } from "lucide-react";

export default function ClientNew() {
  const nav = useNavigate();
  const location = useLocation();
  const fromLead = location.state?.lead;

  const [tab, setTab] = useState("client");
  const [form, setForm] = useState(() => {
    const base = {
      full_name: fromLead?.name || "",
      mobile: fromLead?.mobile || "",
      alt_mobile: fromLead?.alt_mobile || "",
      consumer_number: "",
      address: fromLead?.address || "",
      city: fromLead?.city || "",
      state: "",
      pincode: "",
      aadhaar: "",
      system_kw: Number(fromLead?.estimated_kw) || 0,
      panel_make: "",
      panel_brand: "",
      panel_technology: "",
      panel_wattage: 0,
      num_panels: 0,
      inverter_make: "",
      inverter_capacity: "",
      inverter_model: "",
      inverter_serial: "",
      inverter_year: "",
      inverters: [{ brand: "", capacity: "", quantity: 1, serials: [""] }],
      sanction_number: "",
      consumer_type: fromLead?.consumer_type || "",
      phase_type: "Single Phase",
      subsidy_eligible: false,
      status: fromLead ? "Approved" : "Lead",
      documents: [],
      // ── Financial Setup Initial State ──
      contract_value: "500000",
      initial_payments: [
        { description: "Advance", amount: "20000", payment_source: "Cash", status: "Received", ref_number: "", remarks: "" },
        { description: "Initial Online Payment", amount: "30000", payment_source: "Online", status: "Received", ref_number: "", remarks: "" },
        { description: "Custom Payment", amount: "", payment_source: "Bank Transfer", status: "Pending", ref_number: "", remarks: "" }
      ],
      loan_setup: {
        enabled: true,
        provider: "Tata Capital",
        loan_amount: "100000",
        approved_amount: "100000",
        approved_date: new Date().toISOString().split("T")[0],
        expected_disbursement_date: "",
        disbursed_amount: "0",
        loan_ref: "",
        status: "Approved",
        remarks: ""
      },
      payment_plan: [
        { name: "Advance", amount: "50000" },
        { name: "Dispatch", amount: "150000" },
        { name: "Installation", amount: "200000" },
        { name: "Handover", amount: "50000" }
      ]
    };
    return base;
  });

  // Dynamic Inverter Functions
  const addInverterRow = () => {
    setForm((prev) => ({
      ...prev,
      inverters: [...(prev.inverters || []), { brand: "", capacity: "", quantity: 1, serials: [""] }],
    }));
  };

  const updateInverterRow = (idx, field, val) => {
    setForm((prev) => {
      const list = [...(prev.inverters || [])];
      list[idx] = { ...list[idx], [field]: val };
      return { ...prev, inverters: list };
    });
  };

  const updateInverterQuantity = (idx, val) => {
    const qty = Math.max(1, parseInt(val) || 1);
    setForm((prev) => {
      const list = [...(prev.inverters || [])];
      const inv = list[idx] || {};
      const currentSerials = Array.isArray(inv.serials) ? inv.serials : (inv.serial ? [inv.serial] : []);
      let newSerials = [...currentSerials];
      if (newSerials.length < qty) {
        while (newSerials.length < qty) newSerials.push("");
      } else if (newSerials.length > qty) {
        newSerials = newSerials.slice(0, qty);
      }
      list[idx] = {
        ...inv,
        quantity: qty,
        serials: newSerials,
        serial: newSerials.filter(Boolean).join(", ")
      };
      return { ...prev, inverters: list };
    });
  };

  const updateInverterSerial = (idx, sIdx, val) => {
    setForm((prev) => {
      const list = [...(prev.inverters || [])];
      const inv = list[idx] || {};
      const qty = Math.max(1, Number(inv.quantity) || 1);
      let serials = Array.isArray(inv.serials) ? [...inv.serials] : (inv.serial ? [inv.serial] : []);
      while (serials.length < qty) serials.push("");
      serials[sIdx] = val;
      list[idx] = {
        ...inv,
        serials: serials,
        serial: serials.filter(Boolean).join(", ")
      };
      return { ...prev, inverters: list };
    });
  };

  const removeInverterRow = (idx) => {
    setForm((prev) => ({
      ...prev,
      inverters: (prev.inverters || []).filter((_, i) => i !== idx),
    }));
  };

  // Dynamic Financial Entry Functions
  const addInitialPaymentRow = () => {
    setForm((prev) => ({
      ...prev,
      initial_payments: [
        ...(prev.initial_payments || []),
        { description: "Additional Payment", amount: "", payment_source: "Bank Transfer", status: "Pending", ref_number: "", remarks: "" }
      ]
    }));
  };

  const updateInitialPaymentRow = (idx, field, val) => {
    setForm((prev) => {
      const list = [...(prev.initial_payments || [])];
      list[idx] = { ...list[idx], [field]: val };
      return { ...prev, initial_payments: list };
    });
  };

  const removeInitialPaymentRow = (idx) => {
    setForm((prev) => ({
      ...prev,
      initial_payments: (prev.initial_payments || []).filter((_, i) => i !== idx)
    }));
  };

  // Dynamic Payment Plan Functions
  const addPaymentPlanRow = () => {
    setForm((prev) => ({
      ...prev,
      payment_plan: [...(prev.payment_plan || []), { name: "Milestone", amount: "" }]
    }));
  };

  const updatePaymentPlanRow = (idx, field, val) => {
    setForm((prev) => {
      const list = [...(prev.payment_plan || [])];
      list[idx] = { ...list[idx], [field]: val };
      return { ...prev, payment_plan: list };
    });
  };

  const removePaymentPlanRow = (idx) => {
    setForm((prev) => ({
      ...prev,
      payment_plan: (prev.payment_plan || []).filter((_, i) => i !== idx)
    }));
  };

  const createClient = useCreateClient();
  const saving = createClient.isPending;
  const [uploading, setUploading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const upload = async (e, label) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "client");
      const { data } = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((f) => ({ ...f, documents: [...(f.documents || []), { ...data, label }] }));
      toast.success(`${label} uploaded`);
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setUploading(false); e.target.value = ""; }
  };

  // Financial Calculations for Live Preview
  const contractVal = Number(form.contract_value || 0);
  const actualRec = (form.initial_payments || []).reduce((acc, curr) => {
    if (curr.status === "Received" && curr.amount) {
      return acc + Number(curr.amount);
    }
    return acc;
  }, 0);

  const loanApproved = form.loan_setup?.enabled ? Number(form.loan_setup.approved_amount || 0) : 0;
  const loanDisbursed = form.loan_setup?.enabled ? Number(form.loan_setup.disbursed_amount || 0) : 0;
  const loanPending = Math.max(0, loanApproved - loanDisbursed);
  const netRec = actualRec + loanDisbursed;
  const outstanding = Math.max(0, contractVal - netRec);

  const submit = async () => {
    if (!form.full_name || !form.mobile) { toast.error("Name and Mobile are required"); setTab("client"); return; }

    const cleanInitialPayments = (form.initial_payments || [])
      .filter((p) => p.description && (p.amount || p.payment_source))
      .map((p) => ({
        ...p,
        amount: Number(p.amount || 0)
      }));

    const cleanPaymentPlan = (form.payment_plan || [])
      .filter((p) => p.name && p.amount)
      .map((p) => ({
        name: p.name.trim(),
        amount: Number(p.amount)
      }));

    const payload = {
      ...form,
      system_kw: Number(form.system_kw) || 0,
      panel_wattage: Number(form.panel_wattage) || 0,
      num_panels: Number(form.num_panels) || 0,
      contract_value: contractVal,
      quotation_value: contractVal,
      initial_payments: cleanInitialPayments,
      payment_plan: cleanPaymentPlan,
      loan_setup: {
        ...form.loan_setup,
        loan_amount: Number(form.loan_setup.loan_amount || 0),
        approved_amount: Number(form.loan_setup.approved_amount || 0),
        disbursed_amount: Number(form.loan_setup.disbursed_amount || 0)
      }
    };

    createClient.mutate(payload, {
      onSuccess: async (data) => {
        if (fromLead?.id) {
          try {
            await api.post(`/leads/${fromLead.id}/link-client`, { client_id: data.id, sol_id: data.sol_id });
            toast.success(`Lead converted & linked to Client ${data.sol_id}`);
          } catch (e) {
            console.error("Linking lead failed:", e);
          }
        } else {
          toast.success(`Client created: ${data.sol_id}`);
        }
        nav(`/clients/${data.id}`);
      }
    });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <button onClick={() => nav("/clients")} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-2">
            <ArrowLeft className="w-4 h-4" /> Back to Clients
          </button>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>New Client Onboarding</h1>
        </div>
        <Button onClick={submit} disabled={saving} className="bg-blue-600 hover:bg-blue-700" data-testid="save-client-btn">
          {saving ? "Saving…" : "Save Client & Financial Setup"}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} data-testid="new-client-form">
        <TabsList className="bg-white border border-slate-200">
          <TabsTrigger value="client" data-testid="tab-client-details">1. Client Details</TabsTrigger>
          <TabsTrigger value="system" data-testid="tab-system-details">2. System Details</TabsTrigger>
          <TabsTrigger value="finance" data-testid="tab-finance-details" className="text-blue-700 font-semibold">3. Financial Setup</TabsTrigger>
          <TabsTrigger value="docs" data-testid="tab-docs">4. Documents</TabsTrigger>
        </TabsList>

        {/* TAB 1: CLIENT DETAILS */}
        <TabsContent value="client">
          <Card className="border-slate-200">
            <CardContent className="p-6 grid md:grid-cols-2 gap-5">
              <F label="Full Name *"><Input value={form.full_name} onChange={set("full_name")} required data-testid="client-fullname" /></F>
              <F label="Mobile *"><Input value={form.mobile} onChange={set("mobile")} required data-testid="client-mobile" /></F>
              <F label="Alternate Mobile"><Input value={form.alt_mobile} onChange={set("alt_mobile")} /></F>
              <F label="Consumer Number"><Input value={form.consumer_number} onChange={set("consumer_number")} data-testid="client-consumer" /></F>
              <F label="Address" full><Input value={form.address} onChange={set("address")} /></F>
              <F label="City"><Input value={form.city} onChange={set("city")} /></F>
              <F label="State"><Input value={form.state} onChange={set("state")} /></F>
              <F label="Pincode"><Input value={form.pincode} onChange={set("pincode")} /></F>
              <F label="Consumer Category">
                <Select value={form.consumer_type} onValueChange={(v) => setForm({ ...form, consumer_type: v })}>
                  <SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Residential Customer">Residential Customer</SelectItem>
                    <SelectItem value="Commercial Customer">Commercial Customer</SelectItem>
                    <SelectItem value="Domestic Customer">Domestic Customer</SelectItem>
                  </SelectContent>
                </Select>
              </F>
              <F label="Sanction Number"><Input value={form.sanction_number} onChange={set("sanction_number")} /></F>
              <F label="Aadhaar (Optional)"><Input value={form.aadhaar} onChange={set("aadhaar")} /></F>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: SYSTEM DETAILS */}
        <TabsContent value="system">
          <Card className="border-slate-200">
            <CardContent className="p-6 grid md:grid-cols-2 gap-5">
              <F label="System Size (KW)"><Input type="number" step="0.01" value={form.system_kw} onChange={set("system_kw")} data-testid="system-kw" /></F>
              <F label="Panel Make / Brand"><Input value={form.panel_make} onChange={(e) => setForm({ ...form, panel_make: e.target.value, panel_brand: e.target.value })} /></F>
              <F label="Panel Technology">
                <Select value={form.panel_technology} onValueChange={(v) => setForm({ ...form, panel_technology: v })}>
                  <SelectTrigger><SelectValue placeholder="Select Technology" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TopCon Bifacial">TopCon Bifacial</SelectItem>
                    <SelectItem value="TopCon Mono">TopCon Mono</SelectItem>
                    <SelectItem value="Mono PERC">Mono PERC</SelectItem>
                    <SelectItem value="Polycrystalline">Polycrystalline</SelectItem>
                    <SelectItem value="N-Type">N-Type</SelectItem>
                    <SelectItem value="P-Type">P-Type</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </F>
              <F label="Panel Wattage (W)"><Input type="number" value={form.panel_wattage} onChange={set("panel_wattage")} /></F>
              <F label="Number of Panels"><Input type="number" value={form.num_panels} onChange={set("num_panels")} /></F>
              <F label="Total Inverter Capacity (kW)"><Input value={form.inverter_capacity} onChange={set("inverter_capacity")} placeholder="e.g. 340" /></F>

              <div className="col-span-full border-t border-slate-200 pt-4 mt-2">
                <div className="mb-3">
                  <Label className="text-sm font-semibold text-slate-800">Inverter Configuration</Label>
                  <p className="text-xs text-slate-500">Specify inverter brand, capacity, quantity, and serial numbers</p>
                </div>

                <div className="space-y-3 max-w-2xl">
                  {(form.inverters || []).map((inv, idx) => {
                    const qty = Math.max(1, Number(inv.quantity) || 1);
                    const serials = Array.isArray(inv.serials) && inv.serials.length === qty
                      ? inv.serials
                      : Array.from({ length: qty }).map((_, i) => (inv.serials?.[i] !== undefined ? inv.serials[i] : (i === 0 ? inv.serial || "" : "")));

                    return (
                      <div key={idx} className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-3">
                        <div className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-5">
                            <Label className="text-[10px] font-semibold text-slate-500">Brand</Label>
                            <Input value={inv.brand || ""} onChange={(e) => updateInverterRow(idx, "brand", e.target.value)} placeholder="e.g. Growatt" className="h-8 text-xs bg-white" />
                          </div>
                          <div className="col-span-3">
                            <Label className="text-[10px] font-semibold text-slate-500">Capacity (kW)</Label>
                            <Input value={inv.capacity || ""} onChange={(e) => updateInverterRow(idx, "capacity", e.target.value)} placeholder="60" className="h-8 text-xs bg-white" />
                          </div>
                          <div className="col-span-3">
                            <Label className="text-[10px] font-semibold text-slate-500">Quantity</Label>
                            <Input type="number" min="1" value={inv.quantity || 1} onChange={(e) => updateInverterQuantity(idx, e.target.value)} placeholder="1" className="h-8 text-xs bg-white" />
                          </div>
                          <div className="col-span-1 flex justify-center pt-3">
                            {form.inverters.length > 1 && (
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeInverterRow(idx)} className="h-7 w-7 text-red-500 hover:bg-red-50" title="Remove">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-200/70">
                          <div className="text-[11px] font-semibold text-slate-600 mb-1.5">
                            Serial Numbers ({qty})
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                            {Array.from({ length: qty }).map((_, sIdx) => (
                              <Input
                                key={sIdx}
                                value={serials[sIdx] || ""}
                                onChange={(e) => updateInverterSerial(idx, sIdx, e.target.value)}
                                placeholder={`Serial #${sIdx + 1}`}
                                className="h-7 text-xs bg-white font-mono"
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div className="pt-1">
                    <Button type="button" variant="outline" size="sm" onClick={addInverterRow} className="text-xs border-blue-300 text-blue-700 hover:bg-blue-50">
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Inverter
                    </Button>
                  </div>
                </div>
              </div>

              <F label="Phase Type">
                <Select value={form.phase_type} onValueChange={(v) => setForm({ ...form, phase_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Single Phase">Single Phase</SelectItem>
                    <SelectItem value="Three Phase">Three Phase</SelectItem>
                  </SelectContent>
                </Select>
              </F>
              <F label="Subsidy Eligible">
                <div className="flex items-center gap-3 h-10">
                  <Switch checked={form.subsidy_eligible} onCheckedChange={(v) => setForm({ ...form, subsidy_eligible: v })} data-testid="subsidy-switch" />
                  <span className="text-sm text-slate-600">{form.subsidy_eligible ? "Yes" : "No"}</span>
                </div>
              </F>
              <F label="Status">
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Lead", "Survey Pending", "Quotation Sent", "Approved", "Installation Pending", "Installation Complete", "Handover Complete"].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </F>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: FINANCIAL SETUP */}
        <TabsContent value="finance">
          <Card className="border-slate-200">
            <CardContent className="p-6 space-y-6">
              {/* Top Banner: Contract Value */}
              <div className="bg-slate-900 text-white p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-400" /> Commercial Contract Setup
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Define project contract value, initial payment entries, loan setup, and payment schedule.</p>
                </div>
                <div className="w-full sm:w-60">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Contract / Project Value (₹)</Label>
                  <Input
                    type="number"
                    value={form.contract_value}
                    onChange={(e) => setForm({ ...form, contract_value: e.target.value })}
                    placeholder="500000"
                    className="bg-slate-800 text-white border-slate-700 font-bold text-base mt-1"
                  />
                </div>
              </div>

              {/* 1. INITIAL FINANCIAL STRUCTURE (MULTIPLE ENTRIES) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-emerald-600" /> Initial Financial Structure / Payment Entries
                    </h4>
                    <p className="text-xs text-slate-500">Log initial cash, online, or custom payment entries. Support unlimited entries.</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={addInitialPaymentRow} className="text-xs border-blue-300 text-blue-700">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Financial Entry
                  </Button>
                </div>

                <div className="space-y-2">
                  {(form.initial_payments || []).map((pay, idx) => (
                    <div key={idx} className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-12 gap-2 items-center text-xs">
                      <div className="col-span-3">
                        <Label className="text-[10px] font-semibold text-slate-500">Description</Label>
                        <Input
                          value={pay.description}
                          onChange={(e) => updateInitialPaymentRow(idx, "description", e.target.value)}
                          placeholder="e.g. Advance, Online Deposit"
                          className="h-8 text-xs bg-white"
                        />
                      </div>
                      <div className="col-span-3">
                        <Label className="text-[10px] font-semibold text-slate-500">Amount (₹)</Label>
                        <Input
                          type="number"
                          value={pay.amount}
                          onChange={(e) => updateInitialPaymentRow(idx, "amount", e.target.value)}
                          placeholder="20000"
                          className="h-8 text-xs bg-white font-mono font-semibold"
                        />
                      </div>
                      <div className="col-span-3">
                        <Label className="text-[10px] font-semibold text-slate-500">Payment Source</Label>
                        <Select
                          value={pay.payment_source}
                          onValueChange={(v) => updateInitialPaymentRow(idx, "payment_source", v)}
                        >
                          <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Cash">Cash</SelectItem>
                            <SelectItem value="Online">Online</SelectItem>
                            <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                            <SelectItem value="Cheque">Cheque</SelectItem>
                            <SelectItem value="Loan / Finance">Loan / Finance</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label className="text-[10px] font-semibold text-slate-500">Status</Label>
                        <Select
                          value={pay.status}
                          onValueChange={(v) => updateInitialPaymentRow(idx, "status", v)}
                        >
                          <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Received">Received</SelectItem>
                            <SelectItem value="Pending">Pending</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-1 flex justify-center pt-3">
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeInitialPaymentRow(idx)} className="h-7 w-7 text-red-500 hover:bg-red-50">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. LOAN / FINANCE SETUP */}
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                      <Landmark className="w-4 h-4 text-indigo-600" /> Loan / Finance Setup
                    </h4>
                    <p className="text-xs text-slate-500">Configure client loan application & approval details. (Approved loan is NOT received money until disbursed)</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <span>No Loan</span>
                    <Switch
                      checked={form.loan_setup?.enabled}
                      onCheckedChange={(v) => setForm({ ...form, loan_setup: { ...form.loan_setup, enabled: v } })}
                    />
                    <span className="text-indigo-700 font-semibold">Yes, Loan / Finance</span>
                  </div>
                </div>

                {form.loan_setup?.enabled && (
                  <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-200 grid md:grid-cols-3 gap-3 text-xs">
                    <div>
                      <Label className="text-xs font-semibold">Finance Provider</Label>
                      <Input
                        value={form.loan_setup.provider}
                        onChange={(e) => setForm({ ...form, loan_setup: { ...form.loan_setup, provider: e.target.value } })}
                        placeholder="e.g. Tata Capital, SBI"
                        className="mt-1 h-8 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Loan Requested (₹)</Label>
                      <Input
                        type="number"
                        value={form.loan_setup.loan_amount}
                        onChange={(e) => setForm({ ...form, loan_setup: { ...form.loan_setup, loan_amount: e.target.value } })}
                        placeholder="100000"
                        className="mt-1 h-8 text-xs bg-white font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Approved Amount (₹)</Label>
                      <Input
                        type="number"
                        value={form.loan_setup.approved_amount}
                        onChange={(e) => setForm({ ...form, loan_setup: { ...form.loan_setup, approved_amount: e.target.value } })}
                        placeholder="100000"
                        className="mt-1 h-8 text-xs bg-white font-mono font-bold text-indigo-700"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Actual Disbursed Amount (₹)</Label>
                      <Input
                        type="number"
                        value={form.loan_setup.disbursed_amount}
                        onChange={(e) => setForm({ ...form, loan_setup: { ...form.loan_setup, disbursed_amount: e.target.value } })}
                        placeholder="0"
                        className="mt-1 h-8 text-xs bg-white font-mono font-bold text-emerald-700"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Loan Reference / Sanction No.</Label>
                      <Input
                        value={form.loan_setup.loan_ref}
                        onChange={(e) => setForm({ ...form, loan_setup: { ...form.loan_setup, loan_ref: e.target.value } })}
                        placeholder="Sanction Letter No."
                        className="mt-1 h-8 text-xs bg-white font-mono"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Loan Status</Label>
                      <Select
                        value={form.loan_setup.status}
                        onValueChange={(v) => setForm({ ...form, loan_setup: { ...form.loan_setup, status: v } })}
                      >
                        <SelectTrigger className="mt-1 h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Applied">Applied</SelectItem>
                          <SelectItem value="Approved">Approved</SelectItem>
                          <SelectItem value="Partially Disbursed">Partially Disbursed</SelectItem>
                          <SelectItem value="Disbursed">Disbursed</SelectItem>
                          <SelectItem value="Rejected">Rejected</SelectItem>
                          <SelectItem value="Closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Approved Date</Label>
                      <Input
                        type="date"
                        value={form.loan_setup.approved_date}
                        onChange={(e) => setForm({ ...form, loan_setup: { ...form.loan_setup, approved_date: e.target.value } })}
                        className="mt-1 h-8 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Remarks</Label>
                      <Input
                        value={form.loan_setup.remarks}
                        onChange={(e) => setForm({ ...form, loan_setup: { ...form.loan_setup, remarks: e.target.value } })}
                        placeholder="Optional remarks"
                        className="mt-1 h-8 text-xs bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 3. PLANNED PAYMENT SCHEDULE (PAYMENT PLAN) */}
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-blue-600" /> Planned Payment Schedule (Payment Plan)
                    </h4>
                    <p className="text-xs text-slate-500">Define milestone payment schedule. Planned milestone amounts do NOT increase money received.</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={addPaymentPlanRow} className="text-xs border-blue-300 text-blue-700">
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Milestone
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(form.payment_plan || []).map((item, idx) => (
                    <div key={idx} className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex items-center gap-2 text-xs">
                      <Input
                        value={item.name}
                        onChange={(e) => updatePaymentPlanRow(idx, "name", e.target.value)}
                        placeholder="Milestone Name"
                        className="h-8 text-xs bg-white flex-1"
                      />
                      <Input
                        type="number"
                        value={item.amount}
                        onChange={(e) => updatePaymentPlanRow(idx, "amount", e.target.value)}
                        placeholder="₹ Amount"
                        className="h-8 text-xs bg-white font-mono w-28 text-right font-semibold"
                      />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removePaymentPlanRow(idx)} className="h-7 w-7 text-red-500 hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. LIVE FINANCIAL CALCULATION SUMMARY */}
              <div className="bg-slate-100 p-4 rounded-xl border border-slate-300 space-y-2 text-xs">
                <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                  Live Financial Onboarding Summary
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                  <div className="bg-white p-2 rounded border">
                    <div className="text-[10px] text-slate-400 font-sans">Contract Value</div>
                    <div className="font-bold text-slate-900 text-sm">₹{contractVal.toLocaleString("en-IN")}</div>
                  </div>
                  <div className="bg-white p-2 rounded border">
                    <div className="text-[10px] text-emerald-600 font-sans">Actual Received</div>
                    <div className="font-bold text-emerald-700 text-sm">₹{netRec.toLocaleString("en-IN")}</div>
                  </div>
                  <div className="bg-white p-2 rounded border">
                    <div className="text-[10px] text-indigo-600 font-sans">Loan Pending</div>
                    <div className="font-bold text-indigo-700 text-sm">₹{loanPending.toLocaleString("en-IN")}</div>
                  </div>
                  <div className="bg-white p-2 rounded border">
                    <div className="text-[10px] text-amber-600 font-sans">Outstanding</div>
                    <div className="font-bold text-amber-700 text-sm">₹{outstanding.toLocaleString("en-IN")}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: DOCUMENTS */}
        <TabsContent value="docs">
          <Card className="border-slate-200">
            <CardContent className="p-6 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                {["Aadhaar", "Electricity Bill", "Site Photo", "Other Document"].map((label) => (
                  <label key={label} className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-6 hover:border-blue-400 hover:bg-blue-50/30 cursor-pointer transition-colors" data-testid={`upload-${label.replace(/\s/g, "-").toLowerCase()}`}>
                    <Upload className="w-6 h-6 text-slate-400 mb-2" />
                    <div className="text-sm font-medium text-slate-700">{label}</div>
                    <div className="text-xs text-slate-500 mt-1">PDF, JPG, PNG (max 10MB)</div>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => upload(e, label)} />
                  </label>
                ))}
              </div>
              {uploading && <div className="text-sm text-blue-600">Uploading…</div>}
              {form.documents?.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Uploaded ({form.documents.length})</div>
                  {form.documents.map((d, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-slate-900">{d.label}</div>
                        <div className="text-xs text-slate-500">{d.filename}</div>
                      </div>
                      <button type="button" className="text-slate-400 hover:text-red-500" onClick={() => setForm((f) => ({ ...f, documents: f.documents.filter((_, idx) => idx !== i) }))}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const F = ({ label, children, full }) => (
  <div className={full ? "md:col-span-2" : ""}>
    <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</Label>
    <div className="mt-1.5">{children}</div>
  </div>
);
