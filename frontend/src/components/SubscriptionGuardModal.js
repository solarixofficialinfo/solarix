import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";

export default function SubscriptionGuardModal() {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleSubscriptionRequired = (e) => {
      setDetails(e.detail || null);
      setOpen(true);
    };

    window.addEventListener("solarix:subscription-required", handleSubscriptionRequired);
    return () => {
      window.removeEventListener("solarix:subscription-required", handleSubscriptionRequired);
    };
  }, []);

  const handleUpgrade = () => {
    setOpen(false);
    navigate("/pricing");
  };

  const handleBilling = () => {
    setOpen(false);
    navigate("/billing");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-md p-6 shadow-2xl rounded-2xl">
        <DialogHeader className="space-y-3 text-left">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
            {details?.message?.includes("PLAN_LIMIT_REACHED") || details?.message?.includes("plan limit") ? (
              <Sparkles className="w-6 h-6 text-amber-400" />
            ) : (
              <Lock className="w-6 h-6" />
            )}
          </div>
          <DialogTitle className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            {details?.message?.includes("PLAN_LIMIT_REACHED") || details?.message?.includes("plan limit")
              ? "Plan Limit Reached"
              : "Subscription Required"}
          </DialogTitle>
          <DialogDescription className="text-slate-300 text-xs leading-relaxed">
            {details?.message?.replace("PLAN_LIMIT_REACHED: ", "") ||
              "Your trial or subscription has expired. Upgrade your plan to unlock full access to creating clients, generating quotations, and managing solar installations."}
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 bg-slate-900/90 border border-slate-800/80 rounded-xl space-y-2.5 text-xs text-slate-300">
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>All your existing historical data is safely stored.</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300 text-xs">
            <Sparkles className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Instant activation with GST-compliant invoicing.</span>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2 border-t border-slate-800/80">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
            className="border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900 text-xs"
          >
            Later
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleBilling}
            className="border-slate-700 text-slate-200 hover:bg-slate-800 text-xs"
          >
            View Plans
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleUpgrade}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-blue-600/20"
          >
            Upgrade Plan <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
