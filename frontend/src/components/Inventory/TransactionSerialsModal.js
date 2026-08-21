import React, { useState } from "react";
import api, { formatApiError } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Eye, Pencil, Check, X, ArrowDownToLine, ArrowUpFromLine, Hash } from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";

export default function TransactionSerialsModal({ transaction, open, onClose, onUpdated }) {
  const [revealedSet, setRevealedSet] = useState(new Set());
  const [editingIndex, setEditingIndex] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [serialsList, setSerialsList] = useState([]);

  React.useEffect(() => {
    if (transaction) {
      setSerialsList(transaction.serial_numbers || []);
      setRevealedSet(new Set());
      setEditingIndex(null);
      setEditValue("");
    }
  }, [transaction, open]);

  if (!transaction) return null;

  const type = transaction.type || "Inward";
  const entryId = transaction.id;

  const handleReveal = (index) => {
    setRevealedSet((prev) => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
  };

  const startEdit = (index, currentVal) => {
    setEditingIndex(index);
    setEditValue(currentVal);
    // Also reveal when editing so user sees what they edit
    handleReveal(index);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditValue("");
  };

  const saveEdit = async (index) => {
    const oldVal = serialsList[index];
    const newVal = editValue.trim();

    if (!newVal) {
      toast.error("Serial number cannot be empty");
      return;
    }

    if (oldVal === newVal) {
      setEditingIndex(null);
      return;
    }

    try {
      setSaving(true);
      await api.put(`/inventory/serial-numbers/${type.toLowerCase()}/${entryId}`, {
        old_serial: oldVal,
        new_serial: newVal
      });

      const updated = [...serialsList];
      updated[index] = newVal;
      setSerialsList(updated);
      setEditingIndex(null);
      toast.success("Serial number updated successfully");
      onUpdated?.();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-lg p-6 shadow-2xl rounded-2xl">
        <DialogHeader className="space-y-2 text-left pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
                <Hash className="w-4 h-4" />
              </div>
              <DialogTitle className="text-base font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                Transaction Serial Numbers
              </DialogTitle>
            </div>
            <Badge
              variant="outline"
              className={
                type === "Inward"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                  : "bg-amber-50 text-amber-700 border-amber-200 text-[10px]"
              }
            >
              {type === "Inward" ? (
                <ArrowDownToLine className="w-2.5 h-2.5 mr-1 inline" />
              ) : (
                <ArrowUpFromLine className="w-2.5 h-2.5 mr-1 inline" />
              )}
              {type}
            </Badge>
          </div>

          <DialogDescription className="text-xs text-slate-500 pt-1">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 text-slate-600">
              <div>
                <span className="font-semibold text-slate-700">Product:</span> {transaction.product}
              </div>
              <div>
                <span className="font-semibold text-slate-700">Date:</span>{" "}
                {dayjs(transaction.date || transaction.created_at).format("DD MMM YYYY")}
              </div>
              <div>
                <span className="font-semibold text-slate-700">Party:</span>{" "}
                {type === "Inward" ? transaction.source_name : transaction.client_name || "—"}
              </div>
              <div>
                <span className="font-semibold text-slate-700">Reference:</span>{" "}
                {transaction.reference_number || transaction.outward_challan_no || "—"}
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Serials List */}
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1 py-2">
          {serialsList.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">No serial numbers found for this transaction.</div>
          ) : (
            serialsList.map((sn, idx) => {
              const isRevealed = revealedSet.has(idx);
              const isEditing = editingIndex === idx;

              return (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0 mr-2">
                    <span className="text-[10px] font-mono text-slate-400 w-5 shrink-0 text-right">#{idx + 1}</span>

                    {isEditing ? (
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-8 text-xs font-mono font-bold bg-white text-slate-900 border-blue-400"
                        autoFocus
                        disabled={saving}
                      />
                    ) : (
                      <span className="font-mono font-semibold text-slate-800 truncate select-all">
                        {isRevealed ? sn : "••••••••••••••••"}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isEditing ? (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => saveEdit(idx)}
                          disabled={saving}
                          className="h-7 w-7 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                          title="Save change"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={cancelEdit}
                          disabled={saving}
                          className="h-7 w-7 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleReveal(idx)}
                          className={`h-7 w-7 ${isRevealed ? "text-blue-600 hover:bg-transparent cursor-default" : "text-slate-500 hover:bg-blue-50 hover:text-blue-600"}`}
                          title="Reveal Serial Number"
                          data-testid={`reveal-serial-${idx}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => startEdit(idx, sn)}
                          className="h-7 w-7 text-slate-500 hover:bg-amber-50 hover:text-amber-600"
                          title="Edit Serial Number"
                          data-testid={`edit-serial-${idx}`}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter className="pt-2 border-t border-slate-100">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
