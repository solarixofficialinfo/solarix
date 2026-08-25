import React from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Sparkles, ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Clean, premium locked feature card shown when a feature/tab
 * is not entitled on the tenant's current plan.
 */
export default function LockedFeatureCard({
  featureName = "Premium Feature",
  requiredPlan = "Growth",
  description,
  benefits = [],
  className = "",
}) {
  const navigate = useNavigate();

  const handleUpgrade = () => {
    navigate("/pricing");
  };

  return (
    <Card className={`border border-dashed border-slate-300 dark:border-slate-800 bg-gradient-to-b from-slate-50/80 to-slate-100/50 dark:from-slate-900/60 dark:to-slate-950/60 shadow-sm rounded-xl overflow-hidden my-4 ${className}`}>
      <CardContent className="p-8 text-center max-w-xl mx-auto flex flex-col items-center justify-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-inner">
          <Lock className="w-6 h-6" />
        </div>

        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 mb-1">
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span>Available in {requiredPlan.toUpperCase()} Plan</span>
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            {featureName} is Locked
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-md mx-auto">
            {description ||
              `Upgrade your workspace to the ${requiredPlan} plan to unlock ${featureName} and enhance your solar project workflow.`}
          </p>
        </div>

        {benefits && benefits.length > 0 && (
          <div className="w-full bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 text-left space-y-1.5 my-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              What you unlock with {requiredPlan}:
            </span>
            <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
              {benefits.map((benefit, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button
            type="button"
            onClick={handleUpgrade}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs h-9 px-4 rounded-lg flex items-center gap-1.5 shadow-md shadow-blue-600/20"
          >
            Upgrade to {requiredPlan} <ArrowRight className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/billing")}
            className="text-xs h-9 px-3 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            View Usage & Limits
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
