import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { invalidateAllClientQueries } from "@/lib/queryKeys";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Users, Plus, Search, ArrowUpFromLine, ArrowDownToLine, RefreshCw, Eye, Pencil, Building2, Trash2, AlertTriangle, BookOpen, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";

export default function B2BClientsView({ globalSearch = "", onChanged }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  // Modals state
  const [selectedClient, setSelectedClient] = useState(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

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

  // Delete Client Dialog State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  // Query Client History when client is selected for ledger
  const { data: historyData, isLoading: loadingHistory } = useQuery({
    queryKey: ["inventory-b2b-client-history", selectedClient?.id],
    queryFn: async () => {
      if (!selectedClient?.id) return null;
      const res = await api.get(`/inventory/b2b-client-history/${selectedClient.id}`);
      return res.data;
    },
    enabled: Boolean(selectedClient?.id && ledgerOpen),
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

  // Actions
  const openClientLedger = (client, e) => {
    if (e) e.stopPropagation();
    setSelectedClient(client);
    setLedgerOpen(true);
  };

  const openClientDetails = (client, e) => {
    if (e) e.stopPropagation();
    setSelectedClient(client);
    setDetailsOpen(true);
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

  const handleOpenDeleteClient = (client, e) => {
    if (e) e.stopPropagation();
    setClientToDelete(client);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!clientToDelete) return;
    setIsDeleting(true);
    try {
      const res = await api.delete(`/clients/${clientToDelete.id}`);
      invalidateAllClientQueries(queryClient, clientToDelete.id);
      await refetch();
      setDeleteDialogOpen(false);
      setClientToDelete(null);
      toast.success(res.data?.message || `Client "${clientToDelete.full_name}" deleted`);
      if (onChanged) onChanged();
    } catch (err) {
      toast.error(formatApiError(err, "Failed to delete client"));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="b2b-clients-view">
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
            Direct B2B client master: manage clients, view details, inspect client ledger, and track net dispatches.
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
                <th className="py-3 px-4 text-right">Total Return</th>
                <th className="py-3 px-4 text-right">Net Quantity</th>
                <th className="py-3 px-4 text-center">Tx Count</th>
                <th className="py-3 px-4 text-center">Last Tx</th>
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
                    className="hover:bg-blue-50/30 transition-colors group"
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
                    <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => openClientDetails(client, e)}
                        className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg gap-1"
                        title="View Client Details"
                        data-testid={`b2b-view-details-btn-${client.id}`}
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-500" /> View
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleOpenEditClient(client, e)}
                        className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg gap-1"
                        title="Edit B2B Client"
                        data-testid={`b2b-edit-btn-${client.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5 text-slate-500" /> Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleOpenDeleteClient(client, e)}
                        className="h-7 px-2 text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg gap-1"
                        title="Delete B2B Client"
                        data-testid={`b2b-delete-btn-${client.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(e) => openClientLedger(client, e)}
                        className="h-7 px-2.5 text-xs text-blue-600 border-blue-200 hover:bg-blue-50 hover:text-blue-800 rounded-lg gap-1 font-medium"
                        title="View Client Ledger"
                        data-testid={`b2b-ledger-btn-${client.id}`}
                      >
                        <BookOpen className="w-3.5 h-3.5" /> Ledger
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
                Directly add a new B2B client. The client will be immediately available in B2B Sales, Outward, Returns, and Ledger.
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
                <label className="font-semibold text-slate-700">Alternate Mobile / Phone</label>
                <Input
                  value={newClient.alt_mobile}
                  onChange={(e) => setNewClient({ ...newClient, alt_mobile: e.target.value })}
                  placeholder="e.g. 0261-222333"
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
                <label className="font-semibold text-slate-700">Address / Location</label>
                <Input
                  value={newClient.address}
                  onChange={(e) => setNewClient({ ...newClient, address: e.target.value })}
                  placeholder="Plot / Road / Industrial Area"
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
                className="h-9 px-4 text-xs rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={savingClient}
                className="h-9 px-4 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs"
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
                Update client contact details and business address.
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
                <label className="font-semibold text-slate-700">Alternate Mobile / Phone</label>
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
                <label className="font-semibold text-slate-700">Address / Location</label>
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
                className="h-9 px-4 text-xs rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={updatingClient}
                className="h-9 px-4 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs"
                data-testid="b2b-update-client-btn"
              >
                {updatingClient ? "Updating..." : "Update Client"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Client Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md p-6 rounded-2xl" data-testid="b2b-client-details-dialog">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <DialogTitle className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
              Client Details
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Verified client record from canonical Client Master.
            </DialogDescription>
          </DialogHeader>

          {selectedClient && (
            <div className="space-y-3.5 py-2 text-xs">
              <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-100">
                <div className="font-bold text-slate-900 text-sm">{selectedClient.full_name}</div>
                {selectedClient.sol_id && (
                  <div className="text-[11px] text-blue-700 font-mono mt-0.5">SOL-ID: {selectedClient.sol_id}</div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-slate-400 font-medium">Primary Mobile</span>
                  <div className="font-medium text-slate-800 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    {selectedClient.mobile || "—"}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-slate-400 font-medium">Alternate Phone</span>
                  <div className="font-medium text-slate-800">{selectedClient.alt_mobile || "—"}</div>
                </div>
                <div className="space-y-1">
                  <span className="text-slate-400 font-medium">City / District</span>
                  <div className="font-medium text-slate-800 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {selectedClient.city || "—"}
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-slate-400 font-medium">State</span>
                  <div className="font-medium text-slate-800">{selectedClient.state || "—"}</div>
                </div>
                <div className="col-span-2 space-y-1">
                  <span className="text-slate-400 font-medium">Address</span>
                  <div className="font-medium text-slate-800">{selectedClient.address || "—"}</div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Outward</div>
                  <div className="text-sm font-bold text-slate-800">{selectedClient.total_outward}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Return</div>
                  <div className="text-sm font-bold text-emerald-700">{selectedClient.total_return}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Net Qty</div>
                  <div className="text-sm font-bold text-indigo-700">{selectedClient.net_quantity}</div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDetailsOpen(false);
                setLedgerOpen(true);
              }}
              className="h-8 px-3 text-xs text-blue-600 border-blue-200 hover:bg-blue-50 rounded-xl gap-1.5 font-medium"
            >
              <BookOpen className="w-3.5 h-3.5" /> View Ledger
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setDetailsOpen(false)}
              className="h-8 px-4 text-xs rounded-xl"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Client Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md p-6 rounded-2xl" data-testid="b2b-delete-dialog">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
              <Trash2 className="w-5 h-5 text-rose-600" /> Delete Client?
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Confirm deletion of this B2B client record.
            </DialogDescription>
          </DialogHeader>

          {clientToDelete && (
            <div className="space-y-3 py-2">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="font-bold text-slate-900 text-sm">
                  {clientToDelete.full_name}
                </div>
                <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                  {clientToDelete.sol_id && <span className="font-mono text-slate-600">ID: {clientToDelete.sol_id}</span>}
                  {clientToDelete.city && <span>• {clientToDelete.city}</span>}
                  {clientToDelete.mobile && <span>• {clientToDelete.mobile}</span>}
                </div>
              </div>

              <div className="text-xs">
                {Number(clientToDelete.transaction_count || 0) > 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 space-y-1.5">
                    <div className="font-semibold flex items-center gap-1.5 text-amber-900">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      This client has {clientToDelete.transaction_count} transaction(s).
                    </div>
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      To protect historical ledger and stock balance integrity, all outward dispatches and return records will remain safely preserved in the database. The client will be archived and removed from active selection.
                    </p>
                  </div>
                ) : (
                  <p className="text-slate-600 leading-relaxed">
                    This client has 0 transactions. Deleting will permanently remove this client record.
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
              className="h-9 px-4 text-xs rounded-xl"
              data-testid="b2b-cancel-delete-btn"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="h-9 px-4 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs gap-1.5"
              data-testid="b2b-confirm-delete-btn"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Client Ledger Dialog */}
      <Dialog open={ledgerOpen} onOpenChange={setLedgerOpen}>
        <DialogContent className="max-w-4xl p-6 rounded-2xl max-h-[85vh] flex flex-col" data-testid="client-ledger-dialog">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
                  <BookOpen className="w-5 h-5 text-blue-600" /> Client Ledger: {selectedClient?.full_name}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  {selectedClient?.city && `${selectedClient.city} • `}
                  {selectedClient?.mobile && `Mobile: ${selectedClient.mobile} • `}
                  Authoritative transaction ledger computed from outward dispatches and returns.
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
              <div className="py-16 text-center text-slate-400 text-xs">Loading transaction ledger...</div>
            ) : transactions.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                No outward dispatches or returns recorded for this client yet.
              </div>
            ) : (
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Bill No</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">Size / Spec</th>
                    <th className="py-2.5 px-3 text-right">Quantity</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3 font-mono text-slate-600">{tx.date}</td>
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-900">
                        {tx.bill_number || tx.reference_number || "—"}
                      </td>
                      <td className="py-2.5 px-3">
                        {tx.type === "OUTWARD" ? (
                          <Badge className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 gap-1 font-semibold">
                            <ArrowUpFromLine className="w-3 h-3" /> Sale / Outward
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 font-semibold">
                            <ArrowDownToLine className="w-3 h-3" /> Return
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">{tx.product}</td>
                      <td className="py-2.5 px-3 text-slate-600">{tx.size || "—"}</td>
                      <td className="py-2.5 px-3 text-right font-bold tabular-nums text-slate-800">
                        {tx.quantity} {tx.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium tabular-nums text-slate-700">
                        {tx.amount ? `₹${Number(tx.amount).toLocaleString("en-IN")}` : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-medium">{tx.status}</td>
                      <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">{tx.remarks || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Total Transactions: <strong className="text-slate-800 font-semibold">{transactions.length}</strong>
            </span>
            <Button variant="outline" size="sm" onClick={() => setLedgerOpen(false)} className="rounded-xl text-xs">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
