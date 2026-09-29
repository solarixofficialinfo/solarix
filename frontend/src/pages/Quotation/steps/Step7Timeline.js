import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Clock, Plus, Trash2, CalendarCheck2 } from "lucide-react";
import { newId } from "../defaults";

export default function Step7Timeline({ quotation, updateQuotation }) {
  const timeline = quotation.timeline || [];

  const handleStageChange = (idx, field, value) => {
    const updated = [...timeline];
    updated[idx] = {
      ...updated[idx],
      [field]: value,
    };
    updateQuotation({ timeline: updated });
  };

  const handleAddStage = () => {
    const newStage = {
      id: newId(),
      sequence: timeline.length + 1,
      stage: `Project Stage ${timeline.length + 1}`,
      duration: "10 Days",
    };
    updateQuotation({ timeline: [...timeline, newStage] });
  };

  const handleDeleteStage = (idx) => {
    const updated = timeline.filter((_, i) => i !== idx).map((st, i) => ({ ...st, sequence: i + 1 }));
    updateQuotation({ timeline: updated });
  };

  return (
    <div className="space-y-6">
      <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                Project Execution Timeline & Milestone Stages
              </h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddStage}
              className="h-8 text-xs font-semibold gap-1 text-blue-700 border-blue-200 hover:bg-blue-50"
            >
              <Plus className="w-3.5 h-3.5" /> Add Stage
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {timeline.map((item, idx) => (
              <div
                key={item.id || idx}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex items-start gap-3"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  0{item.sequence || idx + 1}
                </div>

                <div className="flex-1 space-y-2">
                  <div>
                    <Label className="text-[10px] text-slate-400 uppercase font-mono">Stage Milestone Title</Label>
                    <Input
                      className="mt-1 h-8 text-xs font-semibold bg-white"
                      value={item.stage || ""}
                      onChange={(e) => handleStageChange(idx, "stage", e.target.value)}
                    />
                  </div>

                  <div>
                    <Label className="text-[10px] text-slate-400 uppercase font-mono">Target Duration</Label>
                    <Input
                      className="mt-1 h-8 text-xs font-mono font-medium bg-white"
                      placeholder="e.g. 7 Days / 01 to 07 Days"
                      value={item.duration || ""}
                      onChange={(e) => handleStageChange(idx, "duration", e.target.value)}
                    />
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteStage(idx)}
                  className="h-7 w-7 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50"
                  disabled={timeline.length <= 1}
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
