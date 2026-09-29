import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import api, { formatApiError, downloadFile } from "@/lib/api";
import {
  ArrowLeft,
  ArrowRight,
  Save,
  FileCheck,
  CheckCircle2,
  Sparkles,
  ChevronLeft,
  Check,
} from "lucide-react";

import { calculateDerivedQuotationMetrics, formatINR } from "./defaults";
import Step1Customer from "./steps/Step1Customer";
import Step2Project from "./steps/Step2Project";
import Step3SolarSystem from "./steps/Step3SolarSystem";
import Step4Financials from "./steps/Step4Financials";
import Step5Commercial from "./steps/Step5Commercial";
import Step6BOM from "./steps/Step6BOM";
import Step7Timeline from "./steps/Step7Timeline";
import Step8Scope from "./steps/Step8Scope";
import Step9Terms from "./steps/Step9Terms";
import Step10Review from "./steps/Step10Review";

const STEPS = [
  { id: 1, title: "Customer", short: "1. Customer" },
  { id: 2, title: "Project", short: "2. Project" },
  { id: 3, title: "Solar System", short: "3. System" },
  { id: 4, title: "Financials", short: "4. Savings" },
  { id: 5, title: "Commercial", short: "5. Commercial" },
  { id: 6, title: "BOM", short: "6. BOM" },
  { id: 7, title: "Timeline", short: "7. Timeline" },
  { id: 8, title: "Scope", short: "8. Scope" },
  { id: 9, title: "Terms", short: "9. Terms" },
  { id: 10, title: "Review & Generate", short: "10. Review" },
];

export default function QuotationWizard({
  initialQuotation,
  clients,
  company,
  onSaveComplete,
  onCancel,
}) {
  const [currentStep, setCurrentStep] = useState(1);
  const [quotation, setQuotation] = useState(() => initialQuotation);
  const [busy, setBusy] = useState(false);
  const [generatedDoc, setGeneratedDoc] = useState(null);
  const [generatedPdf, setGeneratedPdf] = useState(null);

  // Centralized quotation state updater with auto-recalculation of dependent metrics
  const updateQuotation = (partial) => {
    setQuotation((prev) => {
      const merged = { ...prev, ...partial };
      // Always maintain synchronous calculations across the single state tree
      return calculateDerivedQuotationMetrics(merged, prev);
    });
  };

  // Step navigation
  const handleNext = () => {
    // Basic validation before moving forward
    if (currentStep === 1) {
      if (!quotation.customer?.name?.trim()) {
        toast.error("Please enter customer / client name.");
        return;
      }
      if (!quotation.reference_no?.trim()) {
        toast.error("Please provide a quotation reference number.");
        return;
      }
    }
    if (currentStep === 2) {
      if (!quotation.project?.size_kw || Number(quotation.project.size_kw) <= 0) {
        toast.error("Please enter a valid positive project size in kW.");
        return;
      }
    }

    if (currentStep < 10) {
      setCurrentStep((s) => s + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((s) => s - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (onCancel) {
      onCancel();
    }
  };

  const handleGoToStep = (stepNumber) => {
    setCurrentStep(stepNumber);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Save draft to server
  const handleSaveDraft = async () => {
    try {
      setBusy(true);
      const res = await api.post("/quotations", {
        ...quotation,
        status: "draft",
      });
      toast.success("Quotation draft saved successfully!");
      if (res.data) {
        setQuotation(res.data);
      }
      if (onSaveComplete) {
        onSaveComplete(res.data);
      }
    } catch (err) {
      toast.error(formatApiError(err) || "Failed to save quotation draft.");
    } finally {
      setBusy(false);
    }
  };

  // Generate DOCX document (S1 or S2)
  const handleGenerate = async (downloadOnly = false) => {
    if (downloadOnly && generatedDoc?.id) {
      downloadFile(generatedDoc.id, generatedDoc.filename || "Solar_Proposal.docx");
      return;
    }

    try {
      setBusy(true);
      const payload = {
        quotation_id: quotation.id,
        template: quotation.template || "S1",
        quotation: quotation,
      };

      const res = await api.post("/quotations/generate", payload);
      const doc = res.data;
      setGeneratedDoc(doc);
      toast.success(`Proposal generated successfully in Format ${quotation.template || "S1"}!`);

      // Trigger automatic browser download
      if (doc?.id) {
        downloadFile(doc.id, doc.filename || "Solar_Proposal.docx");
      }

      if (onSaveComplete) {
        onSaveComplete({
          ...quotation,
          status: "generated",
          generated_file_id: doc.id,
          generated_filename: doc.filename,
        });
      }
    } catch (err) {
      toast.error(formatApiError(err) || "Failed to generate quotation document.");
    } finally {
      setBusy(false);
    }
  };

  // Generate PDF document (S1 or S2)
  const handleGeneratePdf = async (downloadOnly = false) => {
    if (downloadOnly && generatedPdf?.id) {
      downloadFile(generatedPdf.id, generatedPdf.filename || "Solar_Proposal.pdf");
      return;
    }

    try {
      setBusy(true);
      const payload = {
        quotation_id: quotation.id,
        template: quotation.template || "S1",
        quotation: quotation,
      };

      const res = await api.post("/quotations/generate-pdf", payload);
      const doc = res.data;
      setGeneratedPdf(doc);
      toast.success(`PDF generated successfully in Format ${quotation.template || "S1"}!`);

      if (doc?.id) {
        downloadFile(doc.id, doc.filename || "Solar_Proposal.pdf");
      }

      if (onSaveComplete) {
        onSaveComplete({
          ...quotation,
          status: "generated",
          generated_pdf_id: doc.id,
          generated_pdf_filename: doc.filename,
        });
      }
    } catch (err) {
      const msg = formatApiError(err) || "PDF generation failed.";
      // Provide a helpful user-facing message if LibreOffice is not installed
      if (msg.toLowerCase().includes("libreoffice")) {
        toast.error("PDF conversion requires LibreOffice on the server. Please download the Word (.docx) version instead.", { duration: 6000 });
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel || handleBack}
            className="h-8 px-2 text-slate-500 hover:text-slate-900"
          >
            <ChevronLeft className="w-4 h-4 mr-0.5" /> Back
          </Button>

          <div className="border-l border-slate-200 pl-3">
            <h2 className="text-base font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>
              {quotation.customer?.name || "New Solar Quotation"}
            </h2>
            <div className="text-[11px] text-slate-500 font-mono">
              Ref: <span className="font-semibold text-blue-700">{quotation.reference_no}</span> · {quotation.project?.size_kw || 100} kW ({formatINR(quotation.financials?.project_cost || 260000)})
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={busy}
            className="h-8 text-xs font-semibold text-slate-700 border-slate-300 gap-1.5"
            data-testid="wizard-save-draft-btn"
          >
            <Save className="w-3.5 h-3.5" /> Save Draft
          </Button>

          {currentStep === 10 && (
            <Button
              size="sm"
              onClick={() => handleGenerate(false)}
              disabled={busy}
              className="h-8 text-xs font-bold gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
              data-testid="wizard-generate-btn"
            >
              <FileCheck className="w-3.5 h-3.5" />
              {busy ? "Generating..." : `Generate ${quotation.template || "S1"}`}
            </Button>
          )}
        </div>
      </div>

      {/* 10-Step Progress Navigation Header */}
      <div className="w-full overflow-x-auto scrollbar-none py-1">
        <div className="flex items-center justify-between min-w-[760px] bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
          {STEPS.map((st) => {
            const isCurrent = currentStep === st.id;
            const isCompleted = currentStep > st.id;

            return (
              <button
                key={st.id}
                onClick={() => handleGoToStep(st.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer shrink-0 ${
                  isCurrent
                    ? "bg-blue-600 text-white shadow-xs font-bold"
                    : isCompleted
                    ? "bg-blue-50/70 text-blue-800 hover:bg-blue-100"
                    : "text-slate-500 hover:bg-slate-100"
                }`}
                data-testid={`step-tab-${st.id}`}
              >
                <span
                  className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center font-bold ${
                    isCurrent
                      ? "bg-white text-blue-600"
                      : isCompleted
                      ? "bg-blue-600 text-white"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {isCompleted ? <Check className="w-2.5 h-2.5" /> : st.id}
                </span>
                <span>{st.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step View Container */}
      <div className="min-h-[500px]">
        {currentStep === 1 && (
          <Step1Customer
            quotation={quotation}
            updateQuotation={updateQuotation}
            clients={clients}
            company={company}
          />
        )}

        {currentStep === 2 && (
          <Step2Project
            quotation={quotation}
            updateQuotation={updateQuotation}
          />
        )}

        {currentStep === 3 && (
          <Step3SolarSystem
            quotation={quotation}
            updateQuotation={updateQuotation}
          />
        )}

        {currentStep === 4 && (
          <Step4Financials
            quotation={quotation}
            updateQuotation={updateQuotation}
          />
        )}

        {currentStep === 5 && (
          <Step5Commercial
            quotation={quotation}
            updateQuotation={updateQuotation}
          />
        )}

        {currentStep === 6 && (
          <Step6BOM
            quotation={quotation}
            updateQuotation={updateQuotation}
          />
        )}

        {currentStep === 7 && (
          <Step7Timeline
            quotation={quotation}
            updateQuotation={updateQuotation}
          />
        )}

        {currentStep === 8 && (
          <Step8Scope
            quotation={quotation}
            updateQuotation={updateQuotation}
          />
        )}

        {currentStep === 9 && (
          <Step9Terms
            quotation={quotation}
            updateQuotation={updateQuotation}
          />
        )}

        {currentStep === 10 && (
          <Step10Review
            quotation={quotation}
            updateQuotation={updateQuotation}
            onGoToStep={handleGoToStep}
            onGenerate={handleGenerate}
            onGeneratePdf={handleGeneratePdf}
            onSaveDraft={handleSaveDraft}
            busy={busy}
            generatedDoc={generatedDoc}
            generatedPdf={generatedPdf}
          />
        )}
      </div>

      {/* Bottom Sticky Step Action Navigation Bar */}
      <div className="sticky bottom-3 z-20 bg-white/95 backdrop-blur p-4 rounded-2xl border border-slate-200/90 shadow-md flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={handleBack}
          className="h-10 px-4 text-xs font-semibold text-slate-700 border-slate-300 gap-1.5"
          data-testid="wizard-back-btn"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>

        <div className="text-xs text-slate-400 font-mono hidden sm:block">
          Step {currentStep} of 10 — {STEPS[currentStep - 1]?.title}
        </div>

        {currentStep < 10 ? (
          <Button
            onClick={handleNext}
            className="h-10 px-5 text-xs font-bold gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
            data-testid="wizard-next-btn"
          >
            Next Step <ArrowRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            onClick={() => handleGenerate(false)}
            disabled={busy}
            className="h-10 px-6 text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
            data-testid="wizard-finish-generate-btn"
          >
            <FileCheck className="w-4 h-4" />
            {busy ? "Generating..." : `Generate Proposal (${quotation.template || "S1"})`}
          </Button>
        )}
      </div>
    </div>
  );
}
