import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  PackagePlus,
  Building2,
  User,
  Phone,
  Layers,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  FileCheck2,
  Clock,
  Send,
  Boxes
} from "lucide-react";

// Standard inventory units
const STANDARD_UNITS = [
  "Nos", "Mtr", "Set", "Kg", "Box", "Pkt", "Bundle", "Roll", "Sq.Ft", "Ltr", "Pairs"
];

function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function PublicMaterialRequest() {
  const { token } = useParams();
  const cleanToken = (token || "").trim().split("?")[0].split("#")[0].replace(/\/+$/, "");

  // Link state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [linkData, setLinkData] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isWakingServer, setIsWakingServer] = useState(false);

  // Form State
  const [requesterName, setRequesterName] = useState("");
  const [requesterPhone, setRequesterPhone] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [honeypot, setHoneypot] = useState("");

  // Items State: Array of { id, product, size, unit, quantity, remarks, showSuggestions }
  const [items, setItems] = useState([
    { id: generateUUID(), product: "", size: "", unit: "Nos", quantity: "1", remarks: "" }
  ]);

  // Idempotency Key (persisted per form session)
  const [idempotencyKey, setIdempotencyKey] = useState(generateUUID);

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [submittedResult, setSubmittedResult] = useState(null);

  const projectDropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target)) {
        setShowProjectDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch link info with Render cold-start retry loop
  useEffect(() => {
    let isMounted = true;
    let cancelSource = axios.CancelToken.source();

    const fetchLinkMetadata = async (attempt = 1) => {
      setLoading(true);
      setError(null);
      if (attempt > 1) {
        setIsWakingServer(true);
        setRetryCount(attempt);
      }

      try {
        const res = await axios.get(`${API}/public/material-requests/link/${cleanToken}`, {
          cancelToken: cancelSource.token,
          timeout: 45000,
        });

        if (isMounted) {
          setLinkData(res.data);
          setIsWakingServer(false);
          setLoading(false);
        }
      } catch (err) {
        if (!isMounted) return;

        const isNetworkOrTimeout =
          !err.response ||
          err.code === "ECONNABORTED" ||
          err.message?.includes("Network Error") ||
          [502, 503, 504].includes(err.response?.status);

        if (isNetworkOrTimeout && attempt < 5) {
          setIsWakingServer(true);
          const backoff = Math.min(1500 * Math.pow(1.5, attempt - 1), 6000);
          setTimeout(() => {
            if (isMounted) {
              fetchLinkMetadata(attempt + 1);
            }
          }, backoff);
        } else {
          setIsWakingServer(false);
          setLoading(false);
          const detail = err.response?.data?.detail || "This material request link is invalid, expired, or deactivated.";
          setError(detail);
        }
      }
    };

    if (cleanToken) {
      fetchLinkMetadata(1);
    } else {
      setLoading(false);
      setError("No request token specified in URL.");
    }

    return () => {
      isMounted = false;
      cancelSource.cancel("Component unmounted");
    };
  }, [cleanToken]);

  // Product helper
  const handleProductSelect = (index, productObj) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        product: productObj.name || productObj.item_name || "",
        size: productObj.size || productObj.rating || copy[index].size,
        unit: productObj.unit || copy[index].unit || "Nos",
        showSuggestions: false
      };
      return copy;
    });
  };

  const handleItemChange = (index, field, value) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const addItemRow = () => {
    setItems((prev) => [
      ...prev,
      { id: generateUUID(), product: "", size: "", unit: "Nos", quantity: "1", remarks: "" }
    ]);
  };

  const removeItemRow = (index) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Filter projects by search
  const filteredProjects = (linkData?.projects || []).filter((p) => {
    if (!projectSearch.trim()) return true;
    const query = projectSearch.toLowerCase();
    const nameMatch = (p.full_name || "").toLowerCase().includes(query);
    const solMatch = (p.sol_id || "").toLowerCase().includes(query);
    const cityMatch = (p.city || "").toLowerCase().includes(query);
    return nameMatch || solMatch || cityMatch;
  });

  const selectedProject = (linkData?.projects || []).find((p) => p.id === selectedClientId);

  // Form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Honeypot anti-spam check
    if (honeypot && honeypot.trim()) {
      toast.success("Request submitted successfully!");
      return;
    }

    if (!requesterName.trim()) {
      toast.error("Please enter your name");
      return;
    }

    if (!selectedClientId) {
      toast.error("Please select a project / site");
      return;
    }

    // Filter valid items
    const validItems = items
      .map((it) => ({
        product: it.product.trim(),
        size: it.size.trim(),
        unit: it.unit || "Nos",
        quantity: parseFloat(it.quantity) || 0,
        remarks: it.remarks.trim(),
      }))
      .filter((it) => it.product && it.quantity > 0);

    if (validItems.length === 0) {
      toast.error("Please enter at least one item with a valid product name and quantity greater than 0");
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        token: cleanToken,
        requester_name: requesterName.trim(),
        requester_phone: requesterPhone.trim(),
        client_id: selectedClientId,
        items: validItems,
        remarks: remarks.trim(),
        idempotency_key: idempotencyKey,
        honeypot: honeypot,
      };

      const res = await axios.post(`${API}/public/material-requests/submit`, payload, {
        timeout: 45000,
      });

      if (res.data?.status === "success" || res.data?.request) {
        setSubmittedResult({
          request: res.data.request,
          is_duplicate: res.data.is_duplicate,
          client: selectedProject,
        });
        toast.success(res.data.message || "Material request submitted successfully!");
      } else {
        toast.error("Unexpected response from server. Please verify submission.");
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || "Submission failed. Please check your connection and try again.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetForNew = () => {
    setSubmittedResult(null);
    setRequesterName("");
    setRequesterPhone("");
    setSelectedClientId("");
    setProjectSearch("");
    setRemarks("");
    setItems([{ id: generateUUID(), product: "", size: "", unit: "Nos", quantity: "1", remarks: "" }]);
    setIdempotencyKey(generateUUID());
  };

  // ─── Loading View with Cold-Start Resilience ───────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center border-slate-200 shadow-md bg-white">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center animate-pulse">
              <Boxes className="w-7 h-7" />
            </div>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">Loading Material Request Portal</h2>
          <p className="text-xs text-slate-500 mb-6">Connecting securely to Solarix inventory system...</p>

          <div className="flex items-center justify-center gap-2 text-sm text-blue-600 font-medium">
            <Loader2 className="w-5 h-5 animate-spin" />
            {isWakingServer ? `Waking server... (Attempt ${retryCount}/5)` : "Validating link..."}
          </div>

          {isWakingServer && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-left">
              <div className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  The cloud backend is spinning up from idle state. This usually takes 10 to 20 seconds. Please hold on!
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>
    );
  }

  // ─── Error View ─────────────────────────────────────────────
  if (error || !linkData) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center border-red-200 shadow-md bg-white">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center">
              <AlertCircle className="w-7 h-7" />
            </div>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">Link Inactive or Unavailable</h2>
          <p className="text-xs text-slate-600 mb-6 leading-relaxed">
            {error || "This material request link is not valid or has been revoked by the administrator."}
          </p>
          <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-500 mb-6 text-left">
            <p className="font-semibold text-slate-700 mb-1">What can I do?</p>
            <ul className="list-disc list-inside space-y-1 text-[11px]">
              <li>Verify that you copied the complete link URL.</li>
              <li>Ask your project manager or team administrator to provide an updated link.</li>
            </ul>
          </div>
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="w-full text-xs font-semibold gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh & Try Again
          </Button>
        </Card>
      </div>
    );
  }

  // ─── Success Confirmation View ──────────────────────────────
  if (submittedResult) {
    const req = submittedResult.request;
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100 py-8 px-4 sm:px-6">
        <div className="max-w-xl mx-auto space-y-4">
          <Card className="p-6 sm:p-8 border-emerald-200 bg-white shadow-lg text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-inner">
                <CheckCircle2 className="w-9 h-9" />
              </div>
            </div>

            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 mb-2 font-medium px-3 py-0.5">
              Request Logged Successfully
            </Badge>

            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              Material Request Submitted
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Your request has been forwarded directly to the inventory & operations team.
            </p>

            <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200 text-left space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Request No</span>
                <span className="font-mono text-sm font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">
                  {req.request_no || "MR-PENDING"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500 block">Project / Site:</span>
                  <span className="font-medium text-slate-900 block truncate">
                    {req.client_name || submittedResult.client?.full_name}
                  </span>
                  {req.sol_id && (
                    <span className="text-[10px] text-blue-600 font-mono">({req.sol_id})</span>
                  )}
                </div>
                <div>
                  <span className="text-slate-500 block">Assigned Handler:</span>
                  <span className="font-medium text-slate-900 block">
                    {req.requested_by_name || linkData.assigned_team_member_name}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200">
                <span className="text-xs font-semibold text-slate-700 block mb-2">Requested Items ({req.items?.length || 0}):</span>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {(req.items || []).map((it, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded bg-white border border-slate-200 text-xs">
                      <div>
                        <span className="font-semibold text-slate-900">{it.product}</span>
                        {it.size && <span className="text-slate-500 ml-1.5 text-[11px]">({it.size})</span>}
                        {it.remarks && <p className="text-[10px] text-slate-400 italic">{it.remarks}</p>}
                      </div>
                      <span className="font-mono font-bold text-slate-800 shrink-0 ml-2">
                        {it.quantity} {it.unit || "Nos"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleResetForNew}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-sm gap-1.5"
              >
                <Plus className="w-4 h-4" /> Submit Another Request
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // ─── Main Public Request Form ───────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100 py-6 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Brand & Member Header */}
        <Card className="border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-blue-700 to-indigo-800 px-6 py-5 text-white">
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold tracking-widest uppercase opacity-80 block">
                  {linkData.company_name || "SOLARIX"}
                </span>
                <h1 className="text-lg sm:text-xl font-bold tracking-tight">Material Request Portal</h1>
              </div>
              <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center text-white shrink-0 border border-white/20">
                <Boxes className="w-5 h-5" />
              </div>
            </div>
          </div>

          <div className="px-6 py-3.5 bg-blue-50/70 border-b border-blue-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-700">
              <User className="w-4 h-4 text-blue-600" />
              <span>Assigned Team Member:</span>
              <strong className="text-slate-900 font-semibold">
                {linkData.assigned_team_member_name}
              </strong>
              {linkData.assigned_team_member_role && (
                <Badge variant="outline" className="text-[10px] py-0 px-2 bg-white text-slate-600 border-slate-300">
                  {linkData.assigned_team_member_role}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Verified Link
            </div>
          </div>
        </Card>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Honeypot field (hidden from legitimate users) */}
          <div style={{ display: "none" }} aria-hidden="true">
            <input
              type="text"
              name="website_url_check"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          {/* Section 1: Requester & Site Details */}
          <Card className="p-5 border-slate-200 bg-white shadow-sm space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 pb-2 border-b border-slate-100">
              <Building2 className="w-4 h-4 text-blue-600" /> Requester & Site Information
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  Your Full Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={requesterName}
                  onChange={(e) => setRequesterName(e.target.value)}
                  className="text-xs h-9 bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  Contact Number (WhatsApp/Phone)
                </Label>
                <Input
                  placeholder="e.g. 9876543210"
                  value={requesterPhone}
                  onChange={(e) => setRequesterPhone(e.target.value)}
                  className="text-xs h-9 bg-white"
                />
              </div>
            </div>

            {/* Project / Site Selection */}
            <div className="space-y-1.5 relative" ref={projectDropdownRef}>
              <Label className="text-xs font-semibold text-slate-700">
                Select Project / Site <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  placeholder={selectedProject ? `${selectedProject.full_name} (${selectedProject.sol_id || "No SOL ID"})` : "Search project by name, SOL ID, or city..."}
                  value={selectedProject && !showProjectDropdown ? `${selectedProject.full_name} ${selectedProject.sol_id ? `(${selectedProject.sol_id})` : ""}` : projectSearch}
                  onFocus={() => {
                    setShowProjectDropdown(true);
                    setProjectSearch("");
                  }}
                  onChange={(e) => {
                    setProjectSearch(e.target.value);
                    setShowProjectDropdown(true);
                  }}
                  className="text-xs h-9 bg-white pr-8 font-medium cursor-pointer"
                />
                {selectedClientId && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClientId("");
                      setProjectSearch("");
                      setShowProjectDropdown(true);
                    }}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {showProjectDropdown && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl p-1 text-xs">
                  {filteredProjects.length === 0 ? (
                    <div className="p-3 text-center text-slate-400 text-xs">No matching projects found</div>
                  ) : (
                    filteredProjects.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => {
                          setSelectedClientId(p.id);
                          setProjectSearch("");
                          setShowProjectDropdown(false);
                        }}
                        className={`w-full text-left p-2 rounded hover:bg-blue-50 transition-colors flex items-center justify-between ${
                          selectedClientId === p.id ? "bg-blue-50 font-semibold text-blue-900" : "text-slate-700"
                        }`}
                      >
                        <div>
                          <div className="font-medium text-slate-900">{p.full_name}</div>
                          {p.city && <div className="text-[11px] text-slate-400">{p.city}</div>}
                        </div>
                        {p.sol_id && (
                          <span className="text-[11px] font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                            {p.sol_id}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Section 2: Material Items */}
          <Card className="p-5 border-slate-200 bg-white shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-600" /> Requested Materials ({items.length})
              </h2>
              <span className="text-[11px] text-slate-400">At least 1 item required</span>
            </div>

            <div className="space-y-3">
              {items.map((row, idx) => {
                // Filter matching products for autocomplete
                const matchingProducts = (linkData.products || []).filter((prod) => {
                  if (!row.product || !row.showSuggestions) return false;
                  const query = row.product.toLowerCase().trim();
                  if (query.length < 1) return false;
                  const pName = (prod.name || prod.item_name || "").toLowerCase();
                  return pName.includes(query);
                });

                return (
                  <div
                    key={row.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 relative space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                      <span>Item #{idx + 1}</span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          className="text-red-500 hover:text-red-700 flex items-center gap-1 text-[11px]"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Remove
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                      {/* Product Name with Suggestion Popup */}
                      <div className="sm:col-span-6 relative">
                        <Label className="text-[11px] font-semibold text-slate-700">
                          Product Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          required
                          placeholder="e.g. Solar Cable 4 sq mm / MC4 / Earthing"
                          value={row.product}
                          onFocus={() => handleItemChange(idx, "showSuggestions", true)}
                          onChange={(e) => {
                            handleItemChange(idx, "product", e.target.value);
                            handleItemChange(idx, "showSuggestions", true);
                          }}
                          className="text-xs h-8 bg-white"
                        />

                        {row.showSuggestions && matchingProducts.length > 0 && (
                          <div className="absolute z-20 top-full left-0 right-0 mt-1 max-h-44 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl p-1 text-xs">
                            {matchingProducts.slice(0, 10).map((prod, pIdx) => (
                              <button
                                type="button"
                                key={pIdx}
                                onClick={() => handleProductSelect(idx, prod)}
                                className="w-full text-left p-1.5 rounded hover:bg-blue-50 text-slate-800 transition-colors flex items-center justify-between text-xs"
                              >
                                <span>{prod.name || prod.item_name}</span>
                                {prod.size && (
                                  <span className="text-[10px] text-slate-400 font-mono ml-2">
                                    {prod.size}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Size / Rating */}
                      <div className="sm:col-span-3">
                        <Label className="text-[11px] font-semibold text-slate-700">Size / Spec</Label>
                        <Input
                          placeholder="e.g. 4 sq mm / 100A"
                          value={row.size}
                          onChange={(e) => handleItemChange(idx, "size", e.target.value)}
                          className="text-xs h-8 bg-white"
                        />
                      </div>

                      {/* Quantity */}
                      <div className="sm:col-span-3">
                        <Label className="text-[11px] font-semibold text-slate-700">
                          Qty & Unit <span className="text-red-500">*</span>
                        </Label>
                        <div className="flex gap-1.5">
                          <Input
                            required
                            type="number"
                            min="0.01"
                            step="any"
                            placeholder="Qty"
                            value={row.quantity}
                            onChange={(e) => handleItemChange(idx, "quantity", e.target.value)}
                            className="text-xs h-8 bg-white w-20 font-bold"
                          />
                          <select
                            value={row.unit}
                            onChange={(e) => handleItemChange(idx, "unit", e.target.value)}
                            className="text-xs h-8 bg-white border border-slate-200 rounded px-1.5 flex-1 text-slate-700"
                          >
                            {STANDARD_UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Item Remarks / Urgency */}
                    <div>
                      <Input
                        placeholder="Item note / urgency (e.g. required for ACDB connection tomorrow morning)"
                        value={row.remarks}
                        onChange={(e) => handleItemChange(idx, "remarks", e.target.value)}
                        className="text-[11px] h-7 bg-white text-slate-600"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={addItemRow}
              className="w-full text-xs font-semibold gap-1.5 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/50"
            >
              <Plus className="w-3.5 h-3.5" /> Add Another Item
            </Button>
          </Card>

          {/* Section 3: Overall Remarks */}
          <Card className="p-5 border-slate-200 bg-white shadow-sm space-y-2">
            <Label className="text-xs font-semibold text-slate-700">
              Additional Delivery Instructions / Site Notes
            </Label>
            <Textarea
              placeholder="e.g. Please deliver to Site Gate #2. Call site engineer before dispatch."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="text-xs bg-white min-h-[64px]"
            />
          </Card>

          {/* Submit Action */}
          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm py-2.5 h-11 shadow-md gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Submitting Request...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" /> Submit Material Request
              </>
            )}
          </Button>

          <p className="text-[11px] text-center text-slate-400">
            Powered by Solarix Cloud Inventory Management System
          </p>
        </form>
      </div>
    </div>
  );
}
