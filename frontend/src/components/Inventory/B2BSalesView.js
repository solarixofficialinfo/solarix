import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { invalidateAllClientQueries } from "@/lib/queryKeys";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Users, Plus, Search, ArrowUpFromLine, ArrowDownToLine, RefreshCw, Eye, Pencil, Building2 } from "lucide-react";
import { toast } from "sonner";

export default function B2BSalesView({ globalSearch = "", onChanged }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Add Client Dialog State
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [newClient, setNewClient] = useState({
    full_name: "",
    mobile: "",
    alt_mobile: "",
    city: "",
    state: "",
    address: ""
  });
  const [savingClient, setSavingClient] = useState(false);

  // Edit Client Dialog State
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [editFormData, setEditFormData] = useState({
    full_name: "",
    mobile: "",
    alt_mobile: "",
    city: "",
    state: "",
    address: ""
  });
  const [updatingClient, setUpdatingClient] = useState(false);

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

  const openClientHistory = (client) => {
    setSelectedClient(client);
    setHistoryOpen(true);
  };

  const handleOpenAddClient = () => {
    setNewClient({
      full_name: "",
      mobile: "",
      alt_mobile: "",
      city: "",
      state: "",
      address: ""
    });
    setAddClientOpen(true);
  };

  const handleCreateClient = async (e) => {
    e.preventDefault();
    if (!newClient.full_name?.trim() || !newClient.mobile?.trim()) {
      toast.error("Please provide Client Name and Mobile Number");
      return;
    }
    setSavingClient(true);
    try {
      await api.post("/clients", {
        full_name: newClient.full_name.trim(),
        mobile: newClient.mobile.trim(),
        alt_mobile: newClient.alt_mobile?.trim() || "",
        city: newClient.city?.trim() || "",
        state: newClient.state?.trim() || "",
        address: newClient.address?.trim() || "",
        phase_type: "Three Phase",
        subsidy_eligible: false,
        status: "Active"
      });
      invalidateAllClientQueries(queryClient);
      await refetch();
      setAddClientOpen(false);
      toast.success(`B2B Client "${newClient.full_name}" added successfully`);
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(formatApiError(err, "Failed to add B2B client"));
    } finally {
      setSavingClient(false);
    }
  };

  const handleOpenEditClient = (client, e) => {
    if (e) e.stopPropagation();
    setEditingClient(client);
    setEditFormData({
      full_name: client.full_name || "",
      mobile: client.mobile === "—" ? "" : client.mobile || "",
      alt_mobile: client.alt_mobile || "",
      city: client.city === "—" ? "" : client.city || "",
      state: client.state || "",
      address: client.address || ""
    });
    setEditClientOpen(true);
  };

  const handleUpdateClient = async (e) => {
    e.preventDefault();
    if (!editFormData.full_name?.trim() || !editFormData.mobile?.trim()) {
      toast.error("Please provide Client Name and Mobile Number");
      return;
    }
    setUpdatingClient(true);
    try {
      await api.put(`/clients/${editingClient.id}`, {
        full_name: editFormData.full_name.trim(),
        mobile: editFormData.mobile.trim(),
        alt_mobile: editFormData.alt_mobile?.trim() || "",
        city: editFormData.city?.trim() || "",
        state: editFormData.state?.trim() || "",
        address: editFormData.address?.trim() || "",
      });
      invalidateAllClientQueries(queryClient);
      await refetch();
      setEditClientOpen(false);
      toast.success(`B2B Client "${editFormData.full_name}" updated successfully`);
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(formatApiError(err, "Failed to update B2B client"));
    } finally {
      setUpdatingClient(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="b2b-sales-view">
      {/* Top Banner & Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              B2B Clients
            </h2>
            <Badge variant="outline" className="text-[11px] font-semibold text-blue-700 bg-blue-50 border-blue-200">
              Client Master
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Direct B2B client master: manage clients, track outward dispatches, client returns, and transaction ledger.
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
            onClick={handleOpenAddClient}
            className="h-9 px-3.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-xl gap-1.5 shadow-2xs shrink-0 font-medium"
            title="Add B2B Client directly"
            data-testid="b2b-add-client-btn"
          >
            <Plus className="w-3.5 h-3.5" /> Add Client
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-slate-200 shadow-2xs bg-white rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>B2B Clients</span>
              <Users className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2" style={{ fontFamily: "Outfit" }}>
              {stats.totalClients}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Active directory records</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Total Dispatched</span>
              <ArrowUpFromLine className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2" style={{ fontFamily: "Outfit" }}>
              {stats.totalOutward}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Total outward units</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Total Returned</span>
              <ArrowDownToLine className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2" style={{ fontFamily: "Outfit" }}>
              {stats.totalReturn}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">B2B client returns</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white rounded-xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
              <span>Net Ledger Balance</span>
              <Building2 className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2" style={{ fontFamily: "Outfit" }}>
              {stats.netQuantity}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Current outstanding units</div>
          </CardContent>
        </Card>
      </div>

      {/* B2B Clients Table */}
      <Card className="border-slate-200 shadow-2xs bg-white rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" /> B2B Client Directory ({filteredClients.length})
          </div>
          {activeSearch && (
            <span className="text-xs text-slate-400">
              Matching &ldquo;{activeSearch}&rdquo;
            </span>
          )}
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
                <th className="py-3 px-4 text-right">Actions</th>
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
                    No B2B clients found. Click &ldquo;+ Add Client&rdquo; above to create your first B2B client.
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
                    <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleOpenEditClient(client, e)}
                        className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg gap-1"
                        title="Edit B2B Client"
                        data-testid={`b2b-edit-btn-${client.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </Button>
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

      {/* Add Client Dialog */}
      <Dialog open={addClientOpen} onOpenChange={setAddClientOpen}>
        <DialogContent className="max-w-lg p-6 rounded-2xl">
          <form onSubmit={handleCreateClient} className="space-y-4">
            <DialogHeader className="pb-3 border-b border-slate-100">
              <DialogTitle className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                Add B2B Client
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Directly add a new B2B client. The client will be immediately available in Outward, Inward Returns, Reports, and Data Management.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
              <div className="md:col-span-2 space-y-1">
                <label className="font-semibold text-slate-700">Business / Client Name *</label>
                <Input
                  required
                  value={newClient.full_name}
                  onChange={(e) => setNewClient({ ...newClient, full_name: e.target.value })}
                  placeholder="e.g. ABC Industries, NIKI FABRIC"
                  className="h-9 text-xs"
                  data-testid="b2b-input-name"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Mobile Number *</label>
                <Input
                  required
                  value={newClient.mobile}
                  onChange={(e) => setNewClient({ ...newClient, mobile: e.target.value })}
                  placeholder="e.g. 9876543210"
                  className="h-9 text-xs"
                  data-testid="b2b-input-mobile"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Alternate Phone / Person</label>
                <Input
                  value={newClient.alt_mobile}
                  onChange={(e) => setNewClient({ ...newClient, alt_mobile: e.target.value })}
                  placeholder="Contact person or alternate phone"
                  className="h-9 text-xs"
                  data-testid="b2b-input-alt-mobile"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">City / District</label>
                <Input
                  value={newClient.city}
                  onChange={(e) => setNewClient({ ...newClient, city: e.target.value })}
                  placeholder="e.g. Surat, Ahmedabad"
                  className="h-9 text-xs"
                  data-testid="b2b-input-city"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">State</label>
                <Input
                  value={newClient.state}
                  onChange={(e) => setNewClient({ ...newClient, state: e.target.value })}
                  placeholder="e.g. Gujarat"
                  className="h-9 text-xs"
                  data-testid="b2b-input-state"
                />
              </div>

              <div className="md:col-span-2 space-y-1">
                <label className="font-semibold text-slate-700">Address / Plant Location</label>
                <Input
                  value={newClient.address}
                  onChange={(e) => setNewClient({ ...newClient, address: e.target.value })}
                  placeholder="Factory, warehouse, or office address"
                  className="h-9 text-xs"
                  data-testid="b2b-input-address"
                />
              </div>
            </div>

            <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
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
                disabled={savingClient}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs"
                data-testid="b2b-save-client-btn"
              >
                {savingClient ? "Saving..." : "Save Client"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Client Dialog */}
      <Dialog open={editClientOpen} onOpenChange={setEditClientOpen}>
        <DialogContent className="max-w-lg p-6 rounded-2xl">
          <form onSubmit={handleUpdateClient} className="space-y-4">
            <DialogHeader className="pb-3 border-b border-slate-100">
              <DialogTitle className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                Edit B2B Client
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Update client profile, contact number, and location details.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
              <div className="md:col-span-2 space-y-1">
                <label className="font-semibold text-slate-700">Business / Client Name *</label>
                <Input
                  required
                  value={editFormData.full_name}
                  onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                  className="h-9 text-xs"
                  data-testid="b2b-edit-name"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Mobile Number *</label>
                <Input
                  required
                  value={editFormData.mobile}
                  onChange={(e) => setEditFormData({ ...editFormData, mobile: e.target.value })}
                  className="h-9 text-xs"
                  data-testid="b2b-edit-mobile"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Alternate Phone / Person</label>
                <Input
                  value={editFormData.alt_mobile}
                  onChange={(e) => setEditFormData({ ...editFormData, alt_mobile: e.target.value })}
                  className="h-9 text-xs"
                  data-testid="b2b-edit-alt-mobile"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">City / District</label>
                <Input
                  value={editFormData.city}
                  onChange={(e) => setEditFormData({ ...editFormData, city: e.target.value })}
                  className="h-9 text-xs"
                  data-testid="b2b-edit-city"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">State</label>
                <Input
                  value={editFormData.state}
                  onChange={(e) => setEditFormData({ ...editFormData, state: e.target.value })}
                  className="h-9 text-xs"
                  data-testid="b2b-edit-state"
                />
              </div>

              <div className="md:col-span-2 space-y-1">
                <label className="font-semibold text-slate-700">Address / Plant Location</label>
                <Input
                  value={editFormData.address}
                  onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                  className="h-9 text-xs"
                  data-testid="b2b-edit-address"
                />
              </div>
            </div>

            <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditClientOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={updatingClient}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs"
                data-testid="b2b-update-client-btn"
              >
                {updatingClient ? "Updating..." : "Update Client"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
