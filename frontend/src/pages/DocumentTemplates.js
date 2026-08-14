import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search, FileText, Download, User, Zap, Building2, CheckCircle2,
  Layers, ExternalLink
} from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";

export default function DocumentTemplates() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialClientId = searchParams.get("client_id") || null;
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(initialClientId);
  const [generatingDoc, setGeneratingDoc] = useState(null); // tracks "wcr:pdf", "wcr:docx", etc.

  // Synchronize client_id from URL query if provided
  useEffect(() => {
    const cid = searchParams.get("client_id");
    if (cid) {
      setSelectedClientId(cid);
    }
  }, [searchParams]);

  // 1. Fetch Client List using canonical /clients endpoint with fallback
  const { data: clientsList = [], isLoading: loadingClients } = useQuery({
    queryKey: ["document-engine-clients-list"],
    queryFn: async () => {
      try {
        const { data: primaryData } = await api.get("/clients?limit=500");
        const list = Array.isArray(primaryData) ? primaryData : primaryData?.clients || [];
        if (list.length > 0) return list;
      } catch (_) {}

      try {
        const { data: fallbackData } = await api.get("/client-data");
        return Array.isArray(fallbackData) ? fallbackData : fallbackData?.clients || [];
      } catch (_) {}

      return [];
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  // Automatically pre-select first client if none selected
  useEffect(() => {
    if (!selectedClientId && clientsList.length > 0) {
      const first = clientsList[0];
      setSelectedClientId(first.id || first.sol_id || first._id);
    }
  }, [clientsList, selectedClientId]);

  // 2. Fetch Selected Client Full Details
  const { data: clientDetailData, isLoading: loadingDetail } = useQuery({
    queryKey: ["client-detail-doc-engine", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return null;
      try {
        const { data: detail } = await api.get(`/client-data/${selectedClientId}`);
        if (detail) return detail;
      } catch (_) {}

      try {
        const { data: clientObj } = await api.get(`/clients/${selectedClientId}`);
        return { client: clientObj };
      } catch (_) {}

      return null;
    },
    enabled: !!selectedClientId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  // 3. Fetch Company Details
  const { data: companyDoc } = useQuery({
    queryKey: ["company-doc-engine"],
    queryFn: async () => {
      const { data } = await api.get("/company");
      return data;
    },
    staleTime: 300000,
  });

  // Filter clients by Name, Mobile, Consumer Number, or SOL ID
  const filteredClients = clientsList.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const name = (c.full_name || c.name || "").toLowerCase();
    const consumer = (c.consumer_number || "").toLowerCase();
    const mobile = (c.mobile || "").toLowerCase();
    const solId = (c.sol_id || c.client_code || c.id || "").toLowerCase();
    const city = (c.city || "").toLowerCase();
    return name.includes(q) || consumer.includes(q) || mobile.includes(q) || solId.includes(q) || city.includes(q);
  });

  // Selected client object
  const activeClientInList = clientsList.find(
    (c) => c.id === selectedClientId || c.sol_id === selectedClientId || c._id === selectedClientId
  );
  const activeClient = (activeClientInList || clientDetailData?.client || clientDetailData)
    ? { ...(activeClientInList || {}), ...(clientDetailData || {}), ...(clientDetailData?.client || {}) }
    : null;
  const company = companyDoc || {};

  // Handle direct document generation & immediate download
  const handleGeneratePdf = async (docType, docLabel, format = "pdf") => {
    if (!selectedClientId) {
      toast.error("Please select a client first.");
      return;
    }
    const genKey = `${docType}:${format}`;
    setGeneratingDoc(genKey);
    const fmtLabel = format === "docx" ? "Word" : "PDF";
    const toastId = toast.loading(`Generating ${docLabel} ${fmtLabel}...`);
    try {
      const response = await api.post(
        "/documents/download-direct",
        { client_id: selectedClientId, doc_type: docType, format },
        { responseType: "blob" }
      );

      const blob = response.data;
      const contentType = blob.type || response.headers?.["content-type"] || "";
      const disposition = response.headers?.["content-disposition"] || "";
      const isDocx = contentType.includes("wordprocessingml") ||
                     contentType.includes("docx") ||
                     contentType.includes("document") ||
                     disposition.toLowerCase().includes(".docx");
      const ext = isDocx ? ".docx" : ".pdf";

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const clientName = (activeClient?.full_name || activeClient?.name || "Client").replace(/[^a-zA-Z0-9_-]/g, "_");
      link.href = url;
      link.setAttribute("download", `${docType.toUpperCase()}_${clientName}${ext}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(`${docLabel} (${fmtLabel}) downloaded successfully!`, { id: toastId });
    } catch (err) {
      toast.error(formatApiError(err) || `Failed to generate ${docLabel}`, { id: toastId });
    } finally {
      setGeneratingDoc(null);
    }
  };

  const availableDocs = [
    { type: "wcr", title: "WCR (Work Completion Report)", desc: "Complete 3-Page WCR with 28-row technical observation table, structural declaration, CMC certificate & Aadhaar box.", bg: "border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50", badge: "3-Page Official WCR", formats: ["pdf", "docx"] },
    { type: "sldr", title: "SLDR (Single Line Diagram)", desc: "Electrical DC/AC protection layout, surge arresters, net meter & earthing pit certifications.", bg: "border-amber-500 bg-amber-50/40 hover:bg-amber-50", badge: "Single Line Diagram", formats: ["pdf"] },
    { type: "meter_testing_request", title: "Meter Testing Request", desc: "Formal DISCOM meter lab testing request letter with customer, location & meter details.", bg: "border-rose-500 bg-rose-50/40 hover:bg-rose-50", badge: "DISCOM Lab Request", formats: ["pdf", "docx"] },
    { type: "net_meter_agreement", title: "Net Meter Agreement", desc: "DISCOM grid synchronization terms, bi-directional meter parameters & tariff compliance.", bg: "border-sky-500 bg-sky-50/40 hover:bg-sky-50", badge: "DISCOM Compliance", formats: ["pdf", "docx"] },
    { type: "vendor_agreement", title: "Vendor Agreement", desc: "Installation agreement, quality assurances, 5-year maintenance contract & warranty terms.", bg: "border-purple-500 bg-purple-50/40 hover:bg-purple-50", badge: "Legal Agreement", formats: ["pdf", "docx"] },
    { type: "annexure", title: "Annexure", desc: "Material & site specifications, panel/inverter serials and BOM component verification details.", bg: "border-blue-500 bg-blue-50/40 hover:bg-blue-50", badge: "Material Specs", formats: ["docx"] },
  ];

  const handleScrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="p-5 space-y-5 max-w-7xl mx-auto font-sans" data-testid="documents-engine-container">
      {/* ─── 1. HEADER ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <PageHeader
            title="Document Templates"
            subtitle="Generate and manage project-specific Solar EPC documents from one workspace."
            badge="Client Workspace"
          />
        </div>
        {activeClient && (
          <div className="bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 flex items-center gap-2 text-xs">
            <User className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="font-bold text-slate-900">{activeClient.full_name || activeClient.name}</span>
            <span className="text-blue-700 font-mono font-medium">({activeClient.sol_id || activeClient.client_code || "SOL ID"})</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ─── 2. LEFT CLIENT SEARCH & SELECTOR ──────────────────────────────── */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="shadow-2xs border-slate-200 bg-white">
            <CardHeader className="p-4 pb-3 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <User className="w-4 h-4 text-blue-600" /> Client Selector
                </span>
                <Badge variant="secondary" className="bg-slate-100 text-slate-700 text-[10px]">
                  {filteredClients.length} Total
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-1">
                Search by Name, SOL ID, Mobile, or Consumer Number
              </CardDescription>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search client..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 text-xs h-8 bg-slate-50 border-slate-200 focus:bg-white"
                  data-testid="client-search-input"
                />
              </div>
            </CardHeader>

            <CardContent className="p-0 max-h-[640px] overflow-y-auto divide-y divide-slate-100">
              {loadingClients ? (
                <div className="p-6 text-center text-xs text-slate-400 italic">Loading client workspace list...</div>
              ) : filteredClients.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">No matching clients found</div>
              ) : (
                filteredClients.map((client) => {
                  const cid = client.id || client.sol_id || client._id;
                  const isSelected = selectedClientId === cid || selectedClientId === client.sol_id || selectedClientId === client.id;
                  return (
                    <div
                      key={cid}
                      onClick={() => setSelectedClientId(cid)}
                      className={`p-3 cursor-pointer transition-all flex items-center justify-between border-l-4 ${
                        isSelected
                          ? "bg-blue-50/90 border-blue-600 shadow-2xs"
                          : "border-transparent hover:bg-slate-50"
                      }`}
                      data-testid={`client-card-${cid}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {client.full_name || client.name || "Unnamed Client"}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5 font-mono">
                          <span className="text-blue-700 font-semibold">{client.sol_id || client.client_code || "—"}</span>
                          <span>•</span>
                          <span>{client.mobile || "—"}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
                          <span>Consumer: {client.consumer_number || "—"}</span>
                          {client.system_kw && (
                            <span className="font-semibold text-slate-700 bg-slate-100 px-1 py-0.2 rounded">
                              {client.system_kw} kW
                            </span>
                          )}
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 ml-2" />}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* ─── RIGHT MAIN CLIENT DOCUMENT & PROJECT WORKSPACE ──────────────── */}
        <div className="lg:col-span-8 space-y-5">
          {!selectedClientId || !activeClient ? (
            <Card className="border-dashed border-2 border-slate-200 shadow-none bg-white">
              <CardContent className="p-12 text-center text-slate-500 space-y-3">
                <FileText className="w-12 h-12 text-slate-300 mx-auto" />
                <h3 className="text-base font-bold text-slate-800">No Client Selected</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Select a client from the left list to load their onboarding details, system specifications, and generate official documents.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* ─── 3. CLIENT OVERVIEW HEADER CARD ──────────────────────────── */}
              <Card className="shadow-2xs border-blue-200 bg-white">
                <CardHeader className="bg-slate-50/80 p-4 border-b border-slate-100">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg font-bold text-slate-900">
                          {activeClient?.full_name || activeClient?.name || "Client Overview"}
                        </CardTitle>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-mono">
                          {activeClient?.sol_id || activeClient?.client_code || "SOL ID"}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-3">
                        <span>Consumer No: <strong className="text-slate-800 font-mono">{activeClient?.consumer_number || "—"}</strong></span>
                        <span>•</span>
                        <span>Mobile: <strong className="text-slate-800 font-mono">{activeClient?.mobile || "—"}</strong></span>
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge className="bg-emerald-600 text-white font-bold text-xs px-2.5 py-1">
                        {activeClient?.system_kw ? `${activeClient.system_kw} kW System` : "Solar Project"}
                      </Badge>
                      <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 text-xs">
                        {activeClient?.status || activeClient?.project_status || "Active Project"}
                      </Badge>
                    </div>
                  </div>

                  {/* ─── QUICK ACTIONS BAR ─────────────────────────────────── */}
                  <div className="flex flex-wrap items-center gap-2 pt-3 mt-2 border-t border-slate-200/80">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Quick Actions:</span>
                    <Button
                      size="xs"
                      onClick={() => handleScrollTo("doc-generation-section")}
                      className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1 rounded-md px-2.5"
                    >
                      <FileText className="w-3.5 h-3.5" /> Generate Documents
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => navigate(`/clients?client_id=${selectedClientId}`)}
                      className="h-7 text-xs border-slate-300 text-slate-700 hover:bg-slate-100 gap-1 rounded-md px-2.5"
                    >
                      <ExternalLink className="w-3 h-3 text-slate-500" /> View Client
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => navigate(`/receivables?client_id=${selectedClientId}`)}
                      className="h-7 text-xs border-slate-300 text-slate-700 hover:bg-slate-100 gap-1 rounded-md px-2.5"
                    >
                      <ExternalLink className="w-3 h-3 text-slate-500" /> Open Project
                    </Button>
                  </div>
                </CardHeader>
              </Card>

              {/* ─── 4. COMPACT INFORMATION CARDS (3 COLUMNS) ────────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* CARD 1: CLIENT & SITE */}
                <Card className="border-slate-200 shadow-2xs bg-white">
                  <CardContent className="p-3.5 space-y-2 text-xs">
                    <div className="font-bold text-slate-900 text-xs uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-blue-600" /> Client & Site Details
                    </div>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between"><span className="text-slate-500">Name:</span> <span className="font-semibold text-slate-900 truncate max-w-[150px]">{activeClient?.full_name || activeClient?.name || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Mobile:</span> <span className="font-mono font-medium text-slate-900">{activeClient?.mobile || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Consumer No:</span> <span className="font-mono font-medium text-slate-900">{activeClient?.consumer_number || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Address:</span> <span className="font-medium text-slate-900 truncate max-w-[150px]">{activeClient?.address || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Site Address:</span> <span className="font-medium text-slate-900 truncate max-w-[150px]">{activeClient?.site_address || activeClient?.address || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">City:</span> <span className="font-medium text-slate-900">{activeClient?.city || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Section No:</span> <span className="font-medium text-slate-900">{activeClient?.sanction_number || activeClient?.sanction_no || activeClient?.section_number || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Category:</span> <span className="font-medium text-slate-900">{activeClient?.consumer_type || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Aadhaar:</span> <span className="font-mono font-medium text-slate-900">{activeClient?.aadhaar || activeClient?.aadhaar_number || "—"}</span></div>
                    </div>
                  </CardContent>
                </Card>

                {/* CARD 2: SOLAR SYSTEM */}
                <Card className="border-slate-200 shadow-2xs bg-white">
                  <CardContent className="p-3.5 space-y-2 text-xs">
                    <div className="font-bold text-slate-900 text-xs uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-600" /> Solar System Specs
                    </div>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between"><span className="text-slate-500">Capacity:</span> <span className="font-bold text-slate-900">{activeClient?.system_kw ? `${activeClient.system_kw} kW` : "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Phase:</span> <span className="font-medium text-slate-900">{activeClient?.phase_type || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Panel Brand:</span> <span className="font-medium text-slate-900">{activeClient?.panel_brand || activeClient?.panel_make || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Panel Tech:</span> <span className="font-medium text-slate-900">{activeClient?.panel_technology || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Panel Wattage:</span> <span className="font-medium text-slate-900">{activeClient?.panel_wattage ? `${activeClient.panel_wattage}Wp` : "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">No. of Panels:</span> <span className="font-medium text-slate-900">{activeClient?.num_panels ? `${activeClient.num_panels} Nos` : "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Inverter Brand:</span> <span className="font-medium text-slate-900">{activeClient?.inverter_brand || activeClient?.inverter_make || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Inverter Model:</span> <span className="font-medium text-slate-900">{activeClient?.inverter_model || activeClient?.inverter_capacity || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Inverter Serial:</span> <span className="font-mono text-slate-900 truncate max-w-[120px]">{activeClient?.inverter_serial || "—"}</span></div>
                    </div>
                  </CardContent>
                </Card>

                {/* CARD 3: COMPANY / INSTALLER */}
                <Card className="border-slate-200 shadow-2xs bg-white">
                  <CardContent className="p-3.5 space-y-2 text-xs">
                    <div className="font-bold text-slate-900 text-xs uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-purple-600" /> Installer / Company
                    </div>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between"><span className="text-slate-500">Vendor/Installer:</span> <span className="font-bold text-slate-900 truncate max-w-[140px]">{company.company_name || "Installer"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">GSTIN:</span> <span className="font-mono font-medium text-slate-900">{company.gst_number || company.gst || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Phone:</span> <span className="font-mono font-medium text-slate-900">{company.mobile || company.phone || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Email:</span> <span className="font-medium text-slate-900 truncate max-w-[140px]">{company.email || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Address:</span> <span className="font-medium text-slate-900 truncate max-w-[140px]">{company.address || "—"}</span></div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* ─── 5. PROJECT SNAPSHOT (VISUAL STRONG CARDS) ───────────────── */}
              <Card className="border-slate-200 shadow-2xs bg-white">
                <CardHeader className="p-3.5 pb-2 border-b border-slate-100">
                  <CardTitle className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-blue-600" /> Project Snapshot
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3.5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs font-mono">
                    <div className="bg-blue-50/60 p-2.5 rounded-lg border border-blue-100">
                      <div className="text-[10px] text-blue-700 font-sans font-medium">Capacity</div>
                      <div className="text-sm font-bold text-blue-900 mt-0.5">{activeClient?.system_kw ? `${activeClient.system_kw} kW` : "—"}</div>
                    </div>

                    <div className="bg-amber-50/60 p-2.5 rounded-lg border border-amber-100">
                      <div className="text-[10px] text-amber-700 font-sans font-medium">Panels</div>
                      <div className="text-sm font-bold text-amber-900 mt-0.5">
                        {activeClient?.panel_wattage ? `${activeClient.panel_wattage}W` : ""} {activeClient?.num_panels ? `× ${activeClient.num_panels}` : "—"}
                      </div>
                    </div>

                    <div className="bg-purple-50/60 p-2.5 rounded-lg border border-purple-100">
                      <div className="text-[10px] text-purple-700 font-sans font-medium">Panel Tech</div>
                      <div className="text-xs font-bold text-purple-900 mt-0.5 truncate">{activeClient?.panel_technology || "—"}</div>
                    </div>

                    <div className="bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-100">
                      <div className="text-[10px] text-emerald-700 font-sans font-medium">Inverter</div>
                      <div className="text-xs font-bold text-emerald-900 mt-0.5 truncate">
                        {activeClient?.inverter_brand || activeClient?.inverter_make || "—"} {activeClient?.inverter_capacity || ""}
                      </div>
                    </div>

                    <div className="bg-indigo-50/60 p-2.5 rounded-lg border border-indigo-100">
                      <div className="text-[10px] text-indigo-700 font-sans font-medium">Project Status</div>
                      <div className="text-xs font-bold text-indigo-900 mt-0.5">{activeClient?.status || activeClient?.project_status || "Active"}</div>
                    </div>

                    <div className="bg-slate-100 p-2.5 rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-600 font-sans font-medium">Installation Year</div>
                      <div className="text-xs font-bold text-slate-800 mt-0.5">{activeClient?.inverter_year || (activeClient?.created_at || "").slice(0, 4) || "—"}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ─── 6. PROJECT DOCUMENTS & GENERATION ──────────────────────── */}
              <Card className="shadow-2xs border-slate-200 bg-white" id="doc-generation-section">
                <CardHeader className="p-4 pb-3 border-b border-slate-100">
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Layers className="w-5 h-5 text-blue-600" />
                      Generate Project Documents
                    </span>
                    <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                      Official PDF & Word Reports
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    Generate official Solar EPC compliance & technical documents pre-filled with this client's mapped parameters.
                  </CardDescription>
                </CardHeader>

                <CardContent className="p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {availableDocs.map((doc) => {
                      const isGenPdf = generatingDoc === `${doc.type}:pdf`;
                      const isGenDocx = generatingDoc === `${doc.type}:docx`;
                      const anyGenerating = !!generatingDoc;
                      return (
                        <div
                          key={doc.type}
                          className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between space-y-3 ${doc.bg}`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-sm text-slate-900">{doc.title}</span>
                              <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 border-slate-300 bg-white">
                                {doc.badge}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed">{doc.desc}</p>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/60 shrink-0">
                            {doc.formats.includes("pdf") && (
                              <Button
                                disabled={anyGenerating || loadingDetail}
                                onClick={() => handleGeneratePdf(doc.type, doc.title, "pdf")}
                                className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-8 px-3"
                                data-testid={`generate-${doc.type}-pdf-btn`}
                              >
                                <Download className="w-3.5 h-3.5 mr-1" />
                                {isGenPdf ? "Generating..." : "PDF"}
                              </Button>
                            )}
                            {doc.formats.includes("docx") && (
                              <Button
                                disabled={anyGenerating || loadingDetail}
                                onClick={() => handleGeneratePdf(doc.type, doc.title, "docx")}
                                variant="outline"
                                className="border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs h-8 px-3"
                                data-testid={`generate-${doc.type}-docx-btn`}
                              >
                                <FileText className="w-3.5 h-3.5 mr-1" />
                                {isGenDocx ? "Generating..." : "Word"}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
