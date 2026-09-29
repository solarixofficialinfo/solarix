import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Edit, Sparkles, Download, CheckCircle2, User, Layers, Sun, DollarSign, CreditCard, Boxes, Clock, CheckSquare, ScrollText, FileCheck, FileDown } from "lucide-react";
import { formatINR, formatNumberIN } from "../defaults";

export default function Step10Review({
  quotation,
  updateQuotation,
  onGoToStep,
  onGenerate,
  onGeneratePdf,
  onSaveDraft,
  busy,
  generatedDoc,
  generatedPdf,
}) {
  const cust = quotation.customer || {};
  const comp = quotation.company || {};
  const proj = quotation.project || {};
  const sys = quotation.solar_system || {};
  const fin = quotation.financials || {};
  const comm = quotation.commercial || {};
  const bom = quotation.bom || [];
  const timeline = quotation.timeline || [];
  const scope = quotation.scope_of_work || [];
  const terms = quotation.terms_and_conditions || [];

  const selectedTemplate = quotation.template || "S1";

  const handleTemplateSelect = (tpl) => {
    updateQuotation({ template: tpl });
  };

  return (
    <div className="space-y-6">
      {/* Document Format Selector */}
      <Card className="border-blue-200 bg-linear-to-b from-blue-50/60 to-white rounded-xl shadow-xs">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-blue-100">
            <FileText className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                Select Proposal Document Format (Word Template)
              </h3>
              <p className="text-xs text-slate-500">
                Generate native Word (.docx) document while preserving exact template layouts, fonts and graphics.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              onClick={() => handleTemplateSelect("S1")}
              className={`p-4 rounded-xl border-2 cursor-pointer transition flex items-start gap-3.5 ${
                selectedTemplate === "S1"
                  ? "border-blue-600 bg-white shadow-xs"
                  : "border-slate-200 bg-slate-50/50 hover:bg-white"
              }`}
              data-testid="option-template-s1"
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                selectedTemplate === "S1" ? "border-blue-600 bg-blue-600" : "border-slate-300"
              }`}>
                {selectedTemplate === "S1" && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-900" style={{ fontFamily: "Outfit" }}>
                    FORMAT S1 — Solar Proposal
                  </span>
                  <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                    Standard Proposal
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Clean modern format featuring executive welcome note, product features, 30-year solar savings chart, payment schedule, bill of materials table, and scope of work.
                </p>
              </div>
            </div>

            <div
              onClick={() => handleTemplateSelect("S2")}
              className={`p-4 rounded-xl border-2 cursor-pointer transition flex items-start gap-3.5 ${
                selectedTemplate === "S2"
                  ? "border-blue-600 bg-white shadow-xs"
                  : "border-slate-200 bg-slate-50/50 hover:bg-white"
              }`}
              data-testid="option-template-s2"
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                selectedTemplate === "S2" ? "border-blue-600 bg-blue-600" : "border-slate-300"
              }`}>
                {selectedTemplate === "S2" && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-900" style={{ fontFamily: "Outfit" }}>
                    FORMAT S2 — Detailed Solar Proposal
                  </span>
                  <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                    Engineering EPC Format
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Comprehensive EPC proposal with detailed equipment specifications (modules, inverters, DC/AC cables, structure, BOS warranties, monthly generation breakdown & milestones).
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Generated File Success Boxes */}
      {(generatedDoc || generatedPdf) && (
        <div className="space-y-3">
          {generatedDoc && (
            <Card className="border-emerald-200 bg-emerald-50/50 rounded-xl shadow-xs">
              <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                      Word Document Ready
                    </h4>
                    <div className="text-xs text-slate-600 font-mono mt-0.5">
                      {generatedDoc.filename}
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => onGenerate(true)}
                  className="h-9 px-4 text-xs font-bold gap-2 bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs"
                >
                  <Download className="w-4 h-4" /> Download (.docx)
                </Button>
              </CardContent>
            </Card>
          )}
          {generatedPdf && (
            <Card className="border-blue-200 bg-blue-50/50 rounded-xl shadow-xs">
              <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <FileDown className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                      PDF Document Ready
                    </h4>
                    <div className="text-xs text-slate-600 font-mono mt-0.5">
                      {generatedPdf.filename}
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => onGeneratePdf(true)}
                  className="h-9 px-4 text-xs font-bold gap-2 bg-blue-700 hover:bg-blue-800 text-white shadow-xs"
                >
                  <Download className="w-4 h-4" /> Download (.pdf)
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Structured Review Sections with [Edit] Jump Links */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider px-1" style={{ fontFamily: "Outfit" }}>
          Live Proposal Overview & Verification
        </h3>

        {/* Section 1: Customer */}
        <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5" />
              </div>
              <div className="text-xs">
                <div className="font-bold text-slate-900">{cust.name || "Customer Name Not Provided"}</div>
                <div className="text-slate-500 mt-0.5">{cust.address || "Address not provided"} · {cust.phone || "No phone"}</div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onGoToStep(1)} className="h-8 text-xs font-semibold gap-1 text-blue-700 hover:bg-blue-50">
              <Edit className="w-3.5 h-3.5" /> Edit
            </Button>
          </CardContent>
        </Card>

        {/* Section 2: Project */}
        <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <div className="text-xs">
                <div className="font-bold text-slate-900">{proj.size_kw || 100} kW Solar Power Plant</div>
                <div className="text-slate-500 mt-0.5">{proj.structure_type} · {proj.system_type} · {proj.location || "Location not set"}</div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onGoToStep(2)} className="h-8 text-xs font-semibold gap-1 text-blue-700 hover:bg-blue-50">
              <Edit className="w-3.5 h-3.5" /> Edit
            </Button>
          </CardContent>
        </Card>

        {/* Section 3: Solar System */}
        <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                <Sun className="w-3.5 h-3.5" />
              </div>
              <div className="text-xs">
                <div className="font-bold text-slate-900">
                  {sys.panel?.watt_peak} × {sys.panel?.quantity} Modules ({sys.panel?.make})
                </div>
                <div className="text-slate-500 mt-0.5">
                  Inverter: {sys.inverter?.size_kw} ({sys.inverter?.make}, {sys.inverter?.phase}) · Cables: {sys.cable?.make}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onGoToStep(3)} className="h-8 text-xs font-semibold gap-1 text-blue-700 hover:bg-blue-50">
              <Edit className="w-3.5 h-3.5" /> Edit
            </Button>
          </CardContent>
        </Card>

        {/* Section 4: Financials */}
        <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                <DollarSign className="w-3.5 h-3.5" />
              </div>
              <div className="text-xs">
                <div className="font-bold text-slate-900">
                  Total Project Cost: {formatINR(fin.project_cost || comm.price)}
                </div>
                <div className="text-slate-500 mt-0.5">
                  Payback: {fin.payback_years} Years · Gen: {formatNumberIN(fin.annual_generation)} Units/yr · Savings: {formatINR(fin.annual_saving)}/yr
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onGoToStep(4)} className="h-8 text-xs font-semibold gap-1 text-blue-700 hover:bg-blue-50">
              <Edit className="w-3.5 h-3.5" /> Edit
            </Button>
          </CardContent>
        </Card>

        {/* Section 5: Commercial & Payment Terms */}
        <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                <CreditCard className="w-3.5 h-3.5" />
              </div>
              <div className="text-xs">
                <div className="font-bold text-slate-900">
                  Rate: {formatINR(comm.price_per_kw)} / kW — {(comm.payment_terms || []).length} Milestones Configured
                </div>
                <div className="text-slate-500 mt-0.5">
                  Bank: {comm.bank_details?.bank_name} · A/C: {comm.bank_details?.account_number}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onGoToStep(5)} className="h-8 text-xs font-semibold gap-1 text-blue-700 hover:bg-blue-50">
              <Edit className="w-3.5 h-3.5" /> Edit
            </Button>
          </CardContent>
        </Card>

        {/* Section 6: BOM */}
        <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                <Boxes className="w-3.5 h-3.5" />
              </div>
              <div className="text-xs">
                <div className="font-bold text-slate-900">Bill of Materials ({bom.length} Items)</div>
                <div className="text-slate-500 mt-0.5">
                  {bom.slice(0, 3).map((b) => b.item).join(", ")} {bom.length > 3 ? `+${bom.length - 3} more` : ""}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onGoToStep(6)} className="h-8 text-xs font-semibold gap-1 text-blue-700 hover:bg-blue-50">
              <Edit className="w-3.5 h-3.5" /> Edit
            </Button>
          </CardContent>
        </Card>

        {/* Section 7: Timeline */}
        <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                <Clock className="w-3.5 h-3.5" />
              </div>
              <div className="text-xs">
                <div className="font-bold text-slate-900">Project Timeline ({timeline.length} Stages)</div>
                <div className="text-slate-500 mt-0.5">
                  {timeline.map((t) => `${t.stage} (${t.duration})`).slice(0, 2).join(" · ")}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onGoToStep(7)} className="h-8 text-xs font-semibold gap-1 text-blue-700 hover:bg-blue-50">
              <Edit className="w-3.5 h-3.5" /> Edit
            </Button>
          </CardContent>
        </Card>

        {/* Section 8: Scope */}
        <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                <CheckSquare className="w-3.5 h-3.5" />
              </div>
              <div className="text-xs">
                <div className="font-bold text-slate-900">Scope of Work ({scope.length} Inclusions)</div>
                <div className="text-slate-500 mt-0.5">
                  Engineering, Procurement, Installation, Testing, Net-Metering Support
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onGoToStep(8)} className="h-8 text-xs font-semibold gap-1 text-blue-700 hover:bg-blue-50">
              <Edit className="w-3.5 h-3.5" /> Edit
            </Button>
          </CardContent>
        </Card>

        {/* Section 9: Terms */}
        <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                <ScrollText className="w-3.5 h-3.5" />
              </div>
              <div className="text-xs">
                <div className="font-bold text-slate-900">Commercial Terms ({terms.length} Conditions)</div>
                <div className="text-slate-500 mt-0.5">
                  Price validity 15 days, milestone payment release, DISCOM utility timeline terms
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onGoToStep(9)} className="h-8 text-xs font-semibold gap-1 text-blue-700 hover:bg-blue-50">
              <Edit className="w-3.5 h-3.5" /> Edit
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Main Generation & Draft Actions Bar */}
      <Card className="border-slate-200/80 shadow-md bg-white rounded-xl">
        <CardContent className="p-5 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                Ready to Export Proposal
              </div>
              <div className="text-[11px] text-slate-500">
                Using selected template: <span className="font-bold text-blue-700">{selectedTemplate}</span>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={onSaveDraft}
              disabled={busy}
              className="h-10 px-4 text-xs font-semibold text-slate-700 border-slate-300 hover:bg-slate-50"
              data-testid="btn-save-draft"
            >
              Save Draft
            </Button>
          </div>

          {/* Download Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              onClick={() => onGenerate(false)}
              disabled={busy}
              className="h-11 text-xs font-bold gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
              data-testid="btn-generate-quotation"
            >
              <FileCheck className="w-4 h-4" />
              {busy ? "Generating..." : `Word (.docx) — Format ${selectedTemplate}`}
            </Button>

            <Button
              onClick={() => onGeneratePdf(false)}
              disabled={busy}
              variant="outline"
              className="h-11 text-xs font-bold gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 shadow-xs"
              data-testid="btn-generate-pdf"
            >
              <FileDown className="w-4 h-4" />
              {busy ? "Converting..." : `PDF Download — Format ${selectedTemplate}`}
            </Button>
          </div>

          <p className="text-[10px] text-slate-400 text-center">
            Word (.docx) preserves full template formatting. PDF requires LibreOffice on the server.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
