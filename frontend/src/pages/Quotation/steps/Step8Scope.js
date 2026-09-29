import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckSquare, Plus, Trash2, ShieldCheck } from "lucide-react";

export default function Step8Scope({ quotation, updateQuotation }) {
  const scope = quotation.scope_of_work || [];

  const handleItemChange = (idx, value) => {
    const updated = [...scope];
    updated[idx] = value;
    updateQuotation({ scope_of_work: updated });
  };

  const handleAddItem = () => {
    updateQuotation({
      scope_of_work: [...scope, "New EPC Scope of Work deliverable item."],
    });
  };

  const handleDeleteItem = (idx) => {
    const updated = scope.filter((_, i) => i !== idx);
    updateQuotation({ scope_of_work: updated });
  };

  return (
    <div className="space-y-6">
      <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                EPC Contractor Scope of Work & Inclusions
              </h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddItem}
              className="h-8 text-xs font-semibold gap-1 text-blue-700 border-blue-200 hover:bg-blue-50"
            >
              <Plus className="w-3.5 h-3.5" /> Add Scope Item
            </Button>
          </div>

          <div className="space-y-2.5">
            {scope.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-white transition"
              >
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>

                <Input
                  className="h-8 text-xs bg-transparent border-0 focus-visible:ring-1 flex-1"
                  value={item || ""}
                  onChange={(e) => handleItemChange(idx, e.target.value)}
                  placeholder="Enter scope item..."
                />

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteItem(idx)}
                  className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                  disabled={scope.length <= 1}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
