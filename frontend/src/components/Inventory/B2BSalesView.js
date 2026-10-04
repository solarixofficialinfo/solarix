import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Users, Plus, Search, ArrowUpFromLine, ArrowDownToLine, RefreshCw, Eye, Calendar, Layers, ShieldCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function B2BSalesView({ globalSearch = "", onChanged }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [busyAdd, setBusyAdd] = useState(false);

  const [newClient, setNewClient] = useState({
    full_name: "",
    mobile: "",
    city: "",
    address: ""
  });

  // Query B2B Summary
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["inventory-b2b-summary"],
    queryFn: async () => {
      const res = await api.get("/inventory/b2b-summary");
      return res.data?.clients || [];
    },
    staleTime: 1000 * 30,
  });

  const rawClients = data;
  const clients = useMemo(() => (Array.isArray(rawClients) ? rawClients : []), [rawClients]);

  // Query Client History when a client is selected
  const { data: historyData, isLoading: loadingHistory } = useQuery({
    queryKey: ["inventory-b2b-client-history", selectedClient?.id],
    queryFn: async () => {
      if (!selectedClient?.id) return null;
      const res = await api.get(`/inventory/b2b-client-history/${selectedClient.id}`);
      return res.data;
    },
    enabled: Boolean(selectedClient?.id && historyOpen),
  });

  const transactions = historyData?.transactions || [];

  // Filtered clients list
  const activeSearch = (search || globalSearch || "").trim().toLowerCase();
  const filteredClients = useMemo(() => {
    if (!activeSearch) return clients;
    return clients.filter((c) =>
      (c.full_name || "").toLowerCase().includes(activeSearch) ||
      (c.mobile || "").toLowerCase().includes(activeSearch) ||
      (c.city || "").toLowerCase().includes(activeSearch) ||
      (c.sol_id || "").toLowerCase().includes(activeSearch)
    );
  }, [clients, activeSearch]);

  // Aggregate stats
  const stats = useMemo(() => {
    let totOut = 0;
    let totRet = 0;
    let totTxs = 0;
    clients.forEach((c) => {
      totOut += Number(c.total_outward || 0);
      totRet += Number(c.total_return || 0);
      totTxs += Number(c.transaction_count || 0);
    });
    return {
      totalClients: clients.length,
      totalOutward: Math.round(totOut * 100) / 100,
      totalReturn: Math.round(totRet * 100) / 100,
      netQuantity: Math.round((totOut - totRet) * 100) / 100,
      totalTransactions: totTxs
    };
  }, [clients]);

  // Handle Add Client
  const handleCreateClient = async (e) => {
    e?.preventDefault();
    if (!newClient.full_name.trim()) {
      toast.error("Client Name is required!");
      return;
    }
    if (!newClient.mobile.trim()) {
      toast.error("Mobile number is required!");
      return;
    }

    // Check if client with identical name already exists to prevent duplicate master data
    const existing = clients.find(
      (c) => (c.full_name || "").trim().toLowerCase() === newClient.full_name.trim().toLowerCase()
    );
    if (existing) {
      toast.warning(`A client named "${existing.full_name}" already exists! Reusing existing master record.`);
      setAddClientOpen(false);
      setSelectedClient(existing);
      setHistoryOpen(true);
      return;
    }

    setBusyAdd(true);
    try {
      await api.post("/clients", {
        full_name: newClient.full_name.trim(),
        mobile: newClient.mobile.trim(),
        city: newClient.city.trim(),
        address: newClient.address.trim()
      });
      toast.success("Client added successfully!");
      setAddClientOpen(false);
      setNewClient({ full_name: "", mobile: "", city: "", address: "" });
      queryClient.invalidateQueries({ queryKey: ["inventory-b2b-summary"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      onChanged?.();
      refetch();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusyAdd(false);
    }
  };

  const openClientHistory = (client) => {
    setSelectedClient(client);
    setHistoryOpen(true);
  };

  return (
    <div className="space-y-5" data-testid="b2b-sales-view">
      {/* Top Banner & Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              B2B Sales & Client Master
            </h2>
            <Badge variant="outline" className="text-[11px] font-semibold text-blue-700 bg-blue-50 border-blue-200">
              Authoritative Ledger
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Single source of truth tracking outward dispatches, client returns, and real-time net inventory balances.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search B2B client..."
              className="pl-8 h-9 text-xs bg-slate-50/70 border-slate-200 rounded-xl"
              data-testid="b2b-search-input"
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
            onClick={() => setAddClientOpen(true)}
            className="h-9 px-3.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-xl gap-1.5 shadow-2xs shrink-0"
            data-testid="b2b-add-client-btn"
          >
            <Plus className="w-3.5 h-3.5" /> + Add Client
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-slate-200 shadow-2xs bg-white rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <span>B2B Clients</span>
              <Users className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums" style={{ fontFamily: "Outfit" }}>
              {stats.totalClients}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Active client accounts</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <span>Total Outward</span>
              <ArrowUpFromLine className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-bold text-amber-700 mt-1 tabular-nums" style={{ fontFamily: "Outfit" }}>
              {stats.totalOutward}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Dispatched units</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <span>Total Returns</span>
              <ArrowDownToLine className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-emerald-700 mt-1 tabular-nums" style={{ fontFamily: "Outfit" }}>
              {stats.totalReturn}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">B2B client returns</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <span>Net On Site</span>
              <Layers className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-2xl font-bold text-indigo-700 mt-1 tabular-nums" style={{ fontFamily: "Outfit" }}>
              {stats.netQuantity}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Net outward balance</div>
          </CardContent>
        </Card>
      </div>

      {/* Clients Table */}
      <Card className="border-slate-200 shadow-2xs bg-white rounded-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" /> B2B Client Directory ({filteredClients.length})
          </h3>
          <span className="text-[11px] text-slate-400">Click any client row to view transaction history</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Client Name</th>
                <th className="py-3 px-4 text-right">Total Outward</th>
                <th className="py-3 px-4 text-right">Total Return / Inward</th>
                <th className="py-3 px-4 text-right">Net Quantity</th>
                <th className="py-3 px-4 text-center">Tx Count</th>
                <th className="py-3 px-4 text-center">Last Transaction</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Loading B2B client data...
                  </td>
                </tr>
              ) : filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No clients found. Click "+ Add Client" to create one.
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => (
                  <tr
                    key={client.id}
                    onClick={() => openClientHistory(client)}
                    className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                    data-testid={`b2b-client-row-${client.id}`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                        {client.full_name}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-2">
                        {client.sol_id && <span className="font-mono text-slate-500">{client.sol_id}</span>}
                        {client.city && <span>• {client.city}</span>}
                        {client.mobile && <span>• {client.mobile}</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-medium tabular-nums text-slate-800">
                      {client.total_outward}
                    </td>
                    <td className="py-3 px-4 text-right font-medium tabular-nums text-emerald-700">
                      {client.total_return}
                    </td>
                    <td className="py-3 px-4 text-right font-bold tabular-nums text-indigo-700">
                      {client.net_quantity}
                    </td>
                    <td className="py-3 px-4 text-center tabular-nums">
                      <Badge variant="outline" className="text-[10px] font-mono bg-slate-50 text-slate-700">
                        {client.transaction_count}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-slate-600 text-[11px]">
                      {client.last_transaction}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openClientHistory(client);
                        }}
                        className="h-7 px-2.5 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-100/60 rounded-lg gap-1"
                        data-testid={`b2b-view-history-${client.id}`}
                      >
                        <Eye className="w-3.5 h-3.5" /> History
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Client Transaction History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6 rounded-2xl">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                  {selectedClient?.full_name} · Transaction History
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  {selectedClient?.sol_id ? `ID: ${selectedClient.sol_id} · ` : ""}
                  {selectedClient?.mobile ? `Mobile: ${selectedClient.mobile} · ` : ""}
                  {selectedClient?.city ? `City: ${selectedClient.city}` : ""}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                  Outward: {selectedClient?.total_outward}
                </Badge>
                <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                  Returned: {selectedClient?.total_return}
                </Badge>
                <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200 font-bold">
                  Net: {selectedClient?.net_quantity}
                </Badge>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-3">
            {loadingHistory ? (
              <div className="py-16 text-center text-slate-400 text-xs">Loading transaction history...</div>
            ) : transactions.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                No outward dispatches or returns recorded for this client yet.
              </div>
            ) : (
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">Size / Spec</th>
                    <th className="py-2.5 px-3 text-right">Quantity</th>
                    <th className="py-2.5 px-3">Challan / Ref No</th>
                    <th className="py-2.5 px-3">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-mono text-slate-600">{tx.date}</td>
                      <td className="py-2.5 px-3">
                        {tx.type === "OUTWARD" ? (
                          <Badge className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 gap-1 font-semibold">
                            <ArrowUpFromLine className="w-3 h-3" /> Sale / Outward
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 font-semibold">
                            <ArrowDownToLine className="w-3 h-3" /> B2B Return
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">{tx.product}</td>
                      <td className="py-2.5 px-3 text-slate-600">{tx.size || "—"}</td>
                      <td className="py-2.5 px-3 text-right font-bold tabular-nums text-slate-800">
                        {tx.quantity} {tx.unit}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">{tx.reference_number || "—"}</td>
                      <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">{tx.remarks || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <DialogFooter className="pt-3 border-t border-slate-100">
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(false)} className="rounded-xl text-xs">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Client Dialog */}
      <Dialog open={addClientOpen} onOpenChange={setAddClientOpen}>
        <DialogContent className="max-w-md p-6 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Add B2B Client
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Create an authoritative client record for B2B dispatches and transaction ledger tracking.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateClient} className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Client / Company Name *</Label>
              <Input
                value={newClient.full_name}
                onChange={(e) => setNewClient({ ...newClient, full_name: e.target.value })}
                placeholder="e.g. ABC Solar Industries Ltd."
                className="mt-1 h-9 text-xs rounded-xl"
                required
                data-testid="add-client-name"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Mobile / Contact Phone *</Label>
              <Input
                value={newClient.mobile}
                onChange={(e) => setNewClient({ ...newClient, mobile: e.target.value })}
                placeholder="e.g. 9876543210"
                className="mt-1 h-9 text-xs rounded-xl"
                required
                data-testid="add-client-mobile"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">City / Location</Label>
              <Input
                value={newClient.city}
                onChange={(e) => setNewClient({ ...newClient, city: e.target.value })}
                placeholder="e.g. Mumbai"
                className="mt-1 h-9 text-xs rounded-xl"
                data-testid="add-client-city"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Address / Site Details</Label>
              <Input
                value={newClient.address}
                onChange={(e) => setNewClient({ ...newClient, address: e.target.value })}
                placeholder="e.g. MIDC Industrial Area Phase II"
                className="mt-1 h-9 text-xs rounded-xl"
                data-testid="add-client-address"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddClientOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={busyAdd}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold"
                data-testid="save-new-client-btn"
              >
                {busyAdd ? "Saving..." : "Save Client"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
