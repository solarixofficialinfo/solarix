import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useCompany, useClientList } from "@/hooks/useClients";
import { useProductList } from "@/hooks/useInventory";
import { useSalesDocuments, useDeleteSalesDocument } from "@/hooks/useSalesDocuments";
import { toast } from "sonner";
import { getInitialQuotation, calculateDerivedQuotationMetrics } from "./defaults";
import QuotationList from "./QuotationList";
import QuotationWizard from "./QuotationWizard";

const DRAFT_LOCAL_KEY = "solarix_quotation_wizard_draft_v1";

export default function Quotation() {
  const location = useLocation();
  const [viewMode, setViewMode] = useState("list"); // "list" | "wizard"
  const [quotations, setQuotations] = useState([]);
  const [loadingQuotations, setLoadingQuotations] = useState(false);
  const [activeQuotation, setActiveQuotation] = useState(null);

  // Queries
  const { data: companyData } = useCompany();
  const company = companyData || null;
  const { data: clientsData = [] } = useClientList();
  const clients = useMemo(() => clientsData || [], [clientsData]);
  const { data: productsData = [] } = useProductList();
  const products = useMemo(() => productsData || [], [productsData]);

  // Existing file history query
  const { data: history = [], isLoading: loadingHistory, refetch: fetchHistory } = useSalesDocuments("quotation");
  const deleteDocMutation = useDeleteSalesDocument("quotation");

  // Fetch saved quotations from database
  const fetchQuotations = useCallback(async () => {
    try {
      setLoadingQuotations(true);
      const res = await api.get("/quotations");
      setQuotations(res.data || []);
    } catch (e) {
      console.warn("Could not load quotations from server:", e);
    } finally {
      setLoadingQuotations(false);
    }
  }, []);

  useEffect(() => {
    fetchQuotations();
  }, [fetchQuotations]);

  // Handle transfer from 3D Solar Designer or Client
  useEffect(() => {
    if (location.state?.transferFromSolarDesigner) {
      const {
        client_id,
        client_name,
        system_kw,
        panel_make,
        panel_wattage,
        panel_count,
        structure_type,
      } = location.state;

      const baseQ = getInitialQuotation(company);
      const matchedClient = clients.find((c) => c.id === client_id);

      const updated = {
        ...baseQ,
        customer: {
          ...baseQ.customer,
          client_id: client_id || "",
          name: client_name || matchedClient?.full_name || "",
          address: matchedClient?.address || "",
          phone: matchedClient?.mobile || "",
          email: matchedClient?.email || "",
          city: matchedClient?.city || "",
        },
        project: {
          ...baseQ.project,
          size_kw: Number(system_kw) || baseQ.project.size_kw,
          structure_type: structure_type || baseQ.project.structure_type,
        },
        solar_system: {
          ...baseQ.solar_system,
          panel: {
            ...baseQ.solar_system.panel,
            make: panel_make || baseQ.solar_system.panel.make,
            watt_peak: panel_wattage ? `${panel_wattage} Wp` : baseQ.solar_system.panel.watt_peak,
            quantity: panel_count || baseQ.solar_system.panel.quantity,
          },
        },
      };

      setActiveQuotation(calculateDerivedQuotationMetrics(updated));
      setViewMode("wizard");
    }
  }, [location.state, clients, company]);

  // Start new quotation
  const handleNewQuotation = async () => {
    const fresh = getInitialQuotation(company);
    try {
      const res = await api.get("/quotations/next-number");
      if (res.data?.suggested) {
        fresh.reference_no = res.data.suggested;
      }
    } catch (e) {
      // fallback to generated default
    }
    setActiveQuotation(calculateDerivedQuotationMetrics(fresh));
    setViewMode("wizard");
  };

  // Edit existing quotation
  const handleEditQuotation = (q) => {
    setActiveQuotation(calculateDerivedQuotationMetrics(q));
    setViewMode("wizard");
  };

  // Delete saved quotation
  const handleDeleteQuotation = async (id) => {
    if (!window.confirm("Are you sure you want to delete this quotation? This action cannot be undone.")) {
      return;
    }
    try {
      await api.delete(`/quotations/${id}`);
      toast.success("Quotation deleted successfully.");
      fetchQuotations();
      fetchHistory();
    } catch (err) {
      toast.error(formatApiError(err) || "Failed to delete quotation.");
    }
  };

  // Delete history document
  const handleDeleteHistory = async (fileId) => {
    if (!window.confirm("Permanently delete this generated proposal file?")) {
      return;
    }
    deleteDocMutation.mutate(fileId);
  };

  const handleSaveComplete = () => {
    fetchQuotations();
    fetchHistory();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 lg:px-6 py-4">
      {viewMode === "list" ? (
        <QuotationList
          quotations={quotations}
          loadingQuotations={loadingQuotations}
          onNewQuotation={handleNewQuotation}
          onEditQuotation={handleEditQuotation}
          onDeleteQuotation={handleDeleteQuotation}
          history={history}
          loadingHistory={loadingHistory}
          onDeleteHistory={handleDeleteHistory}
        />
      ) : (
        <QuotationWizard
          initialQuotation={activeQuotation || getInitialQuotation(company)}
          clients={clients}
          company={company}
          onSaveComplete={handleSaveComplete}
          onCancel={() => setViewMode("list")}
        />
      )}
    </div>
  );
}
