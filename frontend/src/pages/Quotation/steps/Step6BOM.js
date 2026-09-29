import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Boxes, Plus, Trash2, ShieldAlert } from "lucide-react";
import { newId } from "../defaults";

export default function Step6BOM({ quotation, updateQuotation }) {
  const bom = quotation.bom || [];

  const handleRowChange = (idx, field, value) => {
    const updated = [...bom];
    updated[idx] = {
      ...updated[idx],
      [field]: value,
    };
    if (field === "rate" || field === "quantity") {
      const q = parseFloat(field === "quantity" ? value : updated[idx].quantity) || 0;
      const r = parseFloat(field === "rate" ? value : updated[idx].rate) || 0;
      if (r > 0) {
        updated[idx].amount = Math.round(q * r);
      }
    }
    updateQuotation({ bom: updated });
  };

  const handleAddRow = () => {
    const newRow = {
      id: newId(),
      item: "Solar Component",
      specification: "Standard Specification",
      make: "Tier-1",
      quantity: 1,
      unit: "Nos",
      rate: 0,
      amount: 0,
    };
    updateQuotation({ bom: [...bom, newRow] });
  };

  const handleDeleteRow = (idx) => {
    const updated = bom.filter((_, i) => i !== idx);
    updateQuotation({ bom: updated });
  };

  return (
    <div className="space-y-6">
      {/* Compliance info notice */}
      <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 flex items-center gap-3 text-xs">
        <ShieldAlert className="w-4 h-4 text-blue-600 shrink-0" />
        <span>
          <b>Note:</b> Creating or customizing the Quotation Bill of Materials (BOM) does not affect warehouse inventory balances. Inventory movements are only initiated upon formal execution outward entries.
        </span>
      </div>

      <Card className="border-slate-200/80 shadow-xs rounded-xl bg-white">
        <CardContent className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Boxes className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                Bill of Material (BOM) Line Items
              </h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddRow}
              className="h-8 text-xs font-semibold gap-1 text-blue-700 border-blue-200 hover:bg-blue-50"
            >
              <Plus className="w-3.5 h-3.5" /> Add Component
            </Button>
          </div>

          <div className="space-y-3">
            {bom.map((row, idx) => (
              <div
                key={row.id || idx}
                className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col lg:flex-row items-start lg:items-center gap-3"
              >
                <div className="flex items-center gap-2 w-full lg:w-48">
                  <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-mono text-[10px] flex items-center justify-center font-bold shrink-0">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    <Label className="text-[10px] text-slate-400 uppercase font-mono">Item Name</Label>
                    <Input
                      className="mt-1 h-8 text-xs font-semibold bg-white"
                      value={row.item || ""}
                      onChange={(e) => handleRowChange(idx, "item", e.target.value)}
                      placeholder="Component name"
                    />
                  </div>
                </div>

                <div className="w-full lg:flex-1">
                  <Label className="text-[10px] text-slate-400 uppercase font-mono">Specification / Model</Label>
                  <Input
                    className="mt-1 h-8 text-xs bg-white"
                    value={row.specification || ""}
                    onChange={(e) => handleRowChange(idx, "specification", e.target.value)}
                    placeholder="Technical specification"
                  />
                </div>

                <div className="w-full lg:w-36">
                  <Label className="text-[10px] text-slate-400 uppercase font-mono">Make / Brand</Label>
                  <Input
                    className="mt-1 h-8 text-xs bg-white"
                    value={row.make || row.brand || ""}
                    onChange={(e) => handleRowChange(idx, "make", e.target.value)}
                    placeholder="Make / Brand"
                  />
                </div>

                <div className="flex items-center gap-2 w-full lg:w-36">
                  <div className="w-20">
                    <Label className="text-[10px] text-slate-400 uppercase font-mono">Qty</Label>
                    <Input
                      className="mt-1 h-8 text-xs font-mono font-bold bg-white"
                      value={row.quantity || ""}
                      onChange={(e) => handleRowChange(idx, "quantity", e.target.value)}
                      placeholder="Qty"
                    />
                  </div>

                  <div className="w-16">
                    <Label className="text-[10px] text-slate-400 uppercase font-mono">Unit</Label>
                    <Input
                      className="mt-1 h-8 text-xs bg-white"
                      value={row.unit || "Nos"}
                      onChange={(e) => handleRowChange(idx, "unit", e.target.value)}
                      placeholder="Unit"
                    />
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteRow(idx)}
                  className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 mt-2 lg:mt-0"
                  disabled={bom.length <= 1}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
