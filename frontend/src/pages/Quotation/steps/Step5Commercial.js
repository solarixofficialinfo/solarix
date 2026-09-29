import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, CreditCard, Building2, Landmark, CheckCircle2 } from "lucide-react";
import { formatINR, newId } from "../defaults";

export default function Step5Commercial({ quotation, updateQuotation }) {
  const comm = quotation.commercial || {};
  const terms = comm.payment_terms || [];
  const bank = comm.bank_details || {};
  const totalCost = Number(comm.price || quotation.financials?.project_cost) || 0;

  const handleTermChange = (idx, field, value) => {
    const updated = [...terms];
    updated[idx] = {
      ...updated[idx],
      [field]: value,
    };
    // If percentage changed, auto update amount
    if (field === "percent") {
      const pct = parseFloat(value) || 0;
      updated[idx].amount = Math.round((totalCost * pct) / 100);
    }
    updateQuotation({
      commercial: {
        ...comm,
        payment_terms: updated,
      },
    });
  };

  const handleAddTerm = () => {
    const newTerm = {
      id: newId(),
      stage: `Stage ${terms.length + 1}`,
      percent: 10,
      amount: Math.round((totalCost * 10) / 100),
      description: "Upon milestone milestone completion",
    };
    updateQuotation({
      commercial: {
        ...comm,
        payment_terms: [...terms, newTerm],
      },
    });
  };

  const handleDeleteTerm = (idx) => {
    const updated = terms.filter((_, i) => i !== idx);
    updateQuotation({
      commercial: {
        ...comm,
        payment_terms: updated,
      },
    });
  };

  const handleBankChange = (field, value) => {
    updateQuotation({
      commercial: {
        ...comm,
        bank_details: {
          ...bank,
          [field]: value,
        },
      },
    });
  };

  const totalPercent = terms.reduce((acc, t) => acc + (parseFloat(t.percent) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Price Summary Banner */}
      <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
              Commercial Quotation Summary
            </div>
            <div className="text-xl font-black font-mono text-slate-900 mt-1" style={{ fontFamily: "Outfit" }}>
              Total Commercial Value: {formatINR(totalCost)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Based on {quotation.project?.size_kw || 100} kW @ {formatINR(comm.price_per_kw || 2600)} / kW
            </div>
          </div>

          <div className="text-left sm:text-right">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold ${
              Math.abs(totalPercent - 100) < 0.1
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-amber-50 text-amber-700 border border-amber-200"
            }`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Schedule Total: {totalPercent}%
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Payment Terms Milestones Table */}
      <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                Payment Terms & Milestone Schedule
              </h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddTerm}
              className="h-8 text-xs font-semibold gap-1 text-blue-700 border-blue-200 hover:bg-blue-50"
            >
              <Plus className="w-3.5 h-3.5" /> Add Milestone
            </Button>
          </div>

          <div className="space-y-3">
            {terms.map((term, idx) => (
              <div
                key={term.id || idx}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-start sm:items-center gap-3"
              >
                <div className="w-full sm:w-1/4">
                  <Label className="text-[10px] text-slate-400 uppercase font-mono">Stage Name</Label>
                  <Input
                    className="mt-1 h-8 text-xs font-semibold bg-white"
                    value={term.stage || ""}
                    onChange={(e) => handleTermChange(idx, "stage", e.target.value)}
                    placeholder="Milestone stage"
                  />
                </div>

                <div className="w-full sm:w-24">
                  <Label className="text-[10px] text-slate-400 uppercase font-mono">% Share</Label>
                  <div className="relative mt-1">
                    <Input
                      className="h-8 text-xs font-mono font-bold pr-6 bg-white"
                      type="number"
                      value={term.percent ?? 0}
                      onChange={(e) => handleTermChange(idx, "percent", e.target.value)}
                    />
                    <span className="absolute right-2 top-1.5 text-xs text-slate-400 font-bold">%</span>
                  </div>
                </div>

                <div className="w-full sm:w-32">
                  <Label className="text-[10px] text-slate-400 uppercase font-mono">Amount (₹)</Label>
                  <Input
                    className="mt-1 h-8 text-xs font-mono font-bold text-blue-700 bg-white"
                    type="number"
                    value={term.amount ?? Math.round((totalCost * (Number(term.percent) || 0)) / 100)}
                    onChange={(e) => handleTermChange(idx, "amount", Number(e.target.value) || 0)}
                  />
                </div>

                <div className="w-full sm:flex-1">
                  <Label className="text-[10px] text-slate-400 uppercase font-mono">Payment Condition</Label>
                  <Input
                    className="mt-1 h-8 text-xs bg-white"
                    value={term.description || ""}
                    onChange={(e) => handleTermChange(idx, "description", e.target.value)}
                    placeholder="Trigger condition for milestone"
                  />
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteTerm(idx)}
                  className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 mt-4 sm:mt-0"
                  disabled={terms.length <= 1}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bank & Remittance Details */}
      <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Landmark className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Remittance Bank Details
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Bank Name</Label>
              <Input
                className="mt-1 h-9 text-xs"
                placeholder="e.g. HDFC Bank Ltd"
                value={bank.bank_name || ""}
                onChange={(e) => handleBankChange("bank_name", e.target.value)}
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Beneficiary / Account Name</Label>
              <Input
                className="mt-1 h-9 text-xs"
                placeholder="e.g. GVP Solar Technologies Pvt Ltd"
                value={bank.account_name || ""}
                onChange={(e) => handleBankChange("account_name", e.target.value)}
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Account Number</Label>
              <Input
                className="mt-1 h-9 text-xs font-mono font-medium"
                placeholder="e.g. 50200012345678"
                value={bank.account_number || ""}
                onChange={(e) => handleBankChange("account_number", e.target.value)}
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">IFSC Code</Label>
              <Input
                className="mt-1 h-9 text-xs font-mono font-medium"
                placeholder="e.g. HDFC0001234"
                value={bank.ifsc || ""}
                onChange={(e) => handleBankChange("ifsc", e.target.value)}
              />
            </div>

            <div className="sm:col-span-2">
              <Label className="text-xs font-semibold text-slate-700">Branch Location</Label>
              <Input
                className="mt-1 h-9 text-xs"
                placeholder="e.g. Main Commercial Branch, Pune"
                value={bank.branch || ""}
                onChange={(e) => handleBankChange("branch", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
