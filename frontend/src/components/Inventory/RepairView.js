import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Wrench, Plus, Search, RefreshCw, ArrowDownToLine, ArrowUpFromLine, ShieldAlert, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function RepairView({ globalSearch = "", onChanged }) {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState("records"); // 'parties' | 'records'
  const [search, setSearch] = useState("");
  const [addPartyOpen, setAddPartyOpen] = useState(false);
  const [busyAdd, setBusyAdd] = useState(false);

  const [newParty, setNewParty] = useState({
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    notes: ""
  });

  // Query Repair Summary
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["inventory-repair-summary"],
    queryFn: async () => {
      const res = await api.get("/inventory/repair-summary");
      return res.data || { repair_parties: [], repair_records: [] };
    },
    staleTime: 1000 * 30,
  });

  const rawParties = data?.repair_parties;
  const rawRecords = data?.repair_records;
  const repairParties = useMemo(() => (Array.isArray(rawParties) ? rawParties : []), [rawParties]);
  const repairRecords = useMemo(() => (Array.isArray(rawRecords) ? rawRecords : []), [rawRecords]);

  const activeSearch = (search || globalSearch || "").trim().toLowerCase();

  const filteredParties = useMemo(() => {
    if (!activeSearch) return repairParties;
    return repairParties.filter((p) =>
      (p.name || "").toLowerCase().includes(activeSearch) ||
      (p.contact_person || "").toLowerCase().includes(activeSearch) ||
      (p.phone || "").toLowerCase().includes(activeSearch)
    );
  }, [repairParties, activeSearch]);

  const filteredRecords = useMemo(() => {
    if (!activeSearch) return repairRecords;
    return repairRecords.filter((r) =>
      (r.product || "").toLowerCase().includes(activeSearch) ||
      (r.party_name || "").toLowerCase().includes(activeSearch) ||
      (r.reference_number || "").toLowerCase().includes(activeSearch) ||
      (r.remarks || "").toLowerCase().includes(activeSearch)
    );
  }, [repairRecords, activeSearch]);

  // Handle Add Repair Party
  const handleCreateParty = async (e) => {
    e?.preventDefault();
    if (!newParty.name.trim()) {
      toast.error("Party Name is required!");
      return;
    }

    setBusyAdd(true);
    try {
      await api.post("/vendors", {
        name: newParty.name.trim(),
        contact_person: newParty.contact_person.trim(),
        phone: newParty.phone.trim(),
        email: newParty.email.trim(),
        category: "Repair & Service",
        address: newParty.address.trim(),
        notes: newParty.notes.trim()
      });
      toast.success("Repair Party registered successfully!");
      setAddPartyOpen(false);
      setNewParty({ name: "", contact_person: "", phone: "", email: "", address: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["inventory-repair-summary"] });
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      onChanged?.();
      refetch();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusyAdd(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="repair-view">
      {/* Top Banner & Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Repair & Service Management
            </h2>
            <Badge variant="outline" className="text-[11px] font-semibold text-violet-700 bg-violet-50 border-violet-200">
              Integrated Inventory Flow
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Track equipment sent out for repair and received back into stock using the unified transaction system.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search repair party or product..."
              className="pl-8 h-9 text-xs bg-slate-50/70 border-slate-200 rounded-xl"
              data-testid="repair-search-input"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-9 px-2.5 text-xs text-slate-600 rounded-xl"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => setAddPartyOpen(true)}
            className="h-9 px-3.5 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded-xl gap-1.5 shadow-2xs shrink-0"
            data-testid="repair-add-party-btn"
          >
            <Plus className="w-3.5 h-3.5" /> + Add Repair Party
          </Button>
        </div>
      </div>

      {/* Sub-tabs switcher */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-fit border border-slate-200/60">
        <button
          type="button"
          onClick={() => setSubTab("records")}
          className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            subTab === "records"
              ? "bg-white text-violet-700 shadow-2xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
          data-testid="subtab-repair-records"
        >
          Repair Records ({repairRecords.length})
        </button>
        <button
          type="button"
          onClick={() => setSubTab("parties")}
          className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            subTab === "parties"
              ? "bg-white text-violet-700 shadow-2xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
          data-testid="subtab-repair-parties"
        >
          Repair Parties ({repairParties.length})
        </button>
      </div>

      {/* Repair Records View */}
      {subTab === "records" && (
        <Card className="border-slate-200 shadow-2xs bg-white rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-slate-500" /> Repair Movement Log ({filteredRecords.length})
            </h3>
            <span className="text-[11px] text-slate-400">Chronological history of repair shipments and returns</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Repair Party</th>
                  <th className="py-3 px-4">Product Name</th>
                  <th className="py-3 px-4">Size / Spec</th>
                  <th className="py-3 px-4 text-right">Quantity</th>
                  <th className="py-3 px-4">Reference / Challan</th>
                  <th className="py-3 px-4">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      Loading repair transactions...
                    </td>
                  </tr>
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      No repair movements found. Create Inward entry with Source Type "Repair Return" or Outward entry for repair.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-mono text-slate-600">{r.date}</td>
                      <td className="py-3 px-4">
                        {r.movement === "INWARD" ? (
                          <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 font-semibold">
                            <ArrowDownToLine className="w-3 h-3" /> Repair Return
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 gap-1 font-semibold">
                            <ArrowUpFromLine className="w-3 h-3" /> Out for Repair
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{r.party_name}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">{r.product}</td>
                      <td className="py-3 px-4 text-slate-600">{r.size || "—"}</td>
                      <td className="py-3 px-4 text-right font-bold tabular-nums text-slate-800">
                        {r.quantity} {r.unit}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">{r.reference_number || "—"}</td>
                      <td className="py-3 px-4 text-slate-500 max-w-xs truncate">{r.remarks || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Repair Parties View */}
      {subTab === "parties" && (
        <Card className="border-slate-200 shadow-2xs bg-white rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-slate-500" /> Registered Repair Parties ({filteredParties.length})
            </h3>
            <span className="text-[11px] text-slate-400">Authorized repair vendors and service centers</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Party Name</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Contact Person</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      Loading repair parties...
                    </td>
                  </tr>
                ) : filteredParties.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      No repair parties registered yet. Click "+ Add Repair Party" to add one.
                    </td>
                  </tr>
                ) : (
                  filteredParties.map((party) => (
                    <tr key={party.id} className="hover:bg-violet-50/40">
                      <td className="py-3 px-4 font-semibold text-slate-900">{party.name}</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200">
                          {party.category || "Repair & Service"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{party.contact_person || "—"}</td>
                      <td className="py-3 px-4 font-mono text-slate-700">{party.phone || "—"}</td>
                      <td className="py-3 px-4 text-slate-600">{party.email || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add Repair Party Dialog */}
      <Dialog open={addPartyOpen} onOpenChange={setAddPartyOpen}>
        <DialogContent className="max-w-md p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Add Repair Party
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Register a service center or repair vendor in the master catalog.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateParty} className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Party / Workshop Name *</Label>
              <Input
                value={newParty.name}
                onChange={(e) => setNewParty({ ...newParty, name: e.target.value })}
                placeholder="e.g. Inverter Care Solutions"
                className="mt-1 h-9 text-xs rounded-xl"
                required
                data-testid="add-repair-party-name"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Contact Person</Label>
              <Input
                value={newParty.contact_person}
                onChange={(e) => setNewParty({ ...newParty, contact_person: e.target.value })}
                placeholder="e.g. Ramesh Patel"
                className="mt-1 h-9 text-xs rounded-xl"
                data-testid="add-repair-party-contact"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-slate-700">Phone</Label>
                <Input
                  value={newParty.phone}
                  onChange={(e) => setNewParty({ ...newParty, phone: e.target.value })}
                  placeholder="e.g. 9876543210"
                  className="mt-1 h-9 text-xs rounded-xl"
                  data-testid="add-repair-party-phone"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-700">Email</Label>
                <Input
                  value={newParty.email}
                  onChange={(e) => setNewParty({ ...newParty, email: e.target.value })}
                  placeholder="e.g. service@invertercare.com"
                  className="mt-1 h-9 text-xs rounded-xl"
                  data-testid="add-repair-party-email"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Workshop Address</Label>
              <Input
                value={newParty.address}
                onChange={(e) => setNewParty({ ...newParty, address: e.target.value })}
                placeholder="e.g. Plot 14, Service Estate"
                className="mt-1 h-9 text-xs rounded-xl"
                data-testid="add-repair-party-address"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddPartyOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={busyAdd}
                className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-xs font-semibold"
                data-testid="save-new-repair-party-btn"
              >
                {busyAdd ? "Saving..." : "Save Party"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
