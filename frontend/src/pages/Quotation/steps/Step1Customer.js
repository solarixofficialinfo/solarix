import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users2, Building2, Calendar, Hash, Mail, Phone, MapPin, UserCheck } from "lucide-react";

export default function Step1Customer({ quotation, updateQuotation, clients, company }) {
  const cust = quotation.customer || {};
  const comp = quotation.company || {};

  const handleSelectCustomer = (clientId) => {
    if (!clientId) return;
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;

    const fullAddr = [client.address, client.city, client.state, client.pincode].filter(Boolean).join(", ");

    updateQuotation({
      customer: {
        ...cust,
        client_id: client.id,
        name: client.full_name || client.name || "",
        address: fullAddr || client.address || "",
        phone: client.mobile || client.phone || "",
        email: client.email || "",
        city: client.city || "",
      },
      // Pre-fill project capacity if available from client master
      project: {
        ...quotation.project,
        size_kw: Number(client.system_kw) > 0 ? Number(client.system_kw) : quotation.project.size_kw,
      },
      solar_system: {
        ...quotation.solar_system,
        panel: {
          ...quotation.solar_system.panel,
          make: client.panel_make || quotation.solar_system.panel.make,
          watt_peak: client.panel_wattage ? `${client.panel_wattage} Wp` : quotation.solar_system.panel.watt_peak,
          quantity: client.num_panels || quotation.solar_system.panel.quantity,
        },
        inverter: {
          ...quotation.solar_system.inverter,
          make: client.inverter_make || quotation.solar_system.inverter.make,
          size_kw: client.inverter_capacity ? `${client.inverter_capacity} kW` : quotation.solar_system.inverter.size_kw,
        },
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Existing Customer Selector */}
      <Card className="border-blue-100 bg-blue-50/40 rounded-xl shadow-xs">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Users2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>
                  Select Existing Customer
                </h4>
                <p className="text-[11px] text-slate-500">
                  Quickly auto-populate client details from your existing Solarix database
                </p>
              </div>
            </div>

            <div className="w-full sm:w-72">
              <Select value={cust.client_id || ""} onValueChange={handleSelectCustomer}>
                <SelectTrigger className="h-9 text-xs bg-white border-slate-200">
                  <SelectValue placeholder="Search or pick customer..." />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.full_name || "Unnamed Client"} {c.mobile ? `(${c.mobile})` : ""} {c.system_kw ? `— ${c.system_kw} kW` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quotation Metadata & Customer Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer Information Card */}
        <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <UserCheck className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                Customer / Client Information
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  Customer / Business Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  className="mt-1 h-9 text-xs"
                  placeholder="e.g. ABC Industries / John Doe"
                  value={cust.name || ""}
                  onChange={(e) => updateQuotation({ customer: { ...cust, name: e.target.value } })}
                  data-testid="input-customer-name"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Installation Site Address</Label>
                <Input
                  className="mt-1 h-9 text-xs"
                  placeholder="Street address, Industrial area, City, Pincode"
                  value={cust.address || ""}
                  onChange={(e) => updateQuotation({ customer: { ...cust, address: e.target.value } })}
                  data-testid="input-customer-address"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Customer Phone / Mobile</Label>
                  <Input
                    className="mt-1 h-9 text-xs"
                    placeholder="+91 98765 43210"
                    value={cust.phone || ""}
                    onChange={(e) => updateQuotation({ customer: { ...cust, phone: e.target.value } })}
                    data-testid="input-customer-phone"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">Customer Email</Label>
                  <Input
                    className="mt-1 h-9 text-xs"
                    type="email"
                    placeholder="client@example.com"
                    value={cust.email || ""}
                    onChange={(e) => updateQuotation({ customer: { ...cust, email: e.target.value } })}
                    data-testid="input-customer-email"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reference & Authorized Company Info */}
        <div className="space-y-6">
          <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <Hash className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                  Document Reference & Date
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Reference Number <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    className="mt-1 h-9 text-xs font-mono font-medium text-blue-700 bg-slate-50"
                    value={quotation.reference_no || ""}
                    onChange={(e) => updateQuotation({ reference_no: e.target.value })}
                    data-testid="input-quotation-ref"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Quotation Date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    className="mt-1 h-9 text-xs"
                    type="date"
                    value={quotation.date || ""}
                    onChange={(e) => updateQuotation({ date: e.target.value })}
                    data-testid="input-quotation-date"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Company Profile (Dynamically loaded) */}
          <Card className="border-slate-200/80 shadow-xs rounded-xl bg-slate-50/70">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-700" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Authorized EPC Company Profile
                  </h3>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-blue-100/70 text-blue-800 rounded font-semibold">
                  Auto-loaded
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[11px] text-slate-400 block">Company Name:</span>
                  <span className="font-semibold text-slate-800">{comp.name || company?.company_name || "GVP Solar"}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">Contact POC:</span>
                  <span className="font-semibold text-slate-800">{comp.poc || company?.owner_name || "Manager"}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">Phone / Support:</span>
                  <span className="font-semibold text-slate-800">{comp.phone || company?.mobile || "—"}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">GST Number:</span>
                  <span className="font-semibold font-mono text-slate-800">{comp.gst || company?.gst_number || "—"}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
