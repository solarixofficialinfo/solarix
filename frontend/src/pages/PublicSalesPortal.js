import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API } from "@/lib/api";
import { searchLocations, getCurrentLocationDetails } from "@/lib/locationService";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Sun, CheckCircle2, MapPin, Phone, Mail, Building2, Home, Factory,
  UploadCloud, FileText, X, ArrowRight, ArrowLeft, Loader2, Check,
  AlertCircle, ShieldCheck, Zap, Navigation, Image as ImageIcon,
  CheckCircle, FileCheck, RefreshCw, Eye
} from "lucide-react";

export default function PublicSalesPortal() {
  const { token } = useParams();
  const [brandingLoading, setBrandingLoading] = useState(true);
  const [brandingError, setBrandingError] = useState(null);
  const [branding, setBranding] = useState(null);
  const [logoFailed, setLogoFailed] = useState(false);

  // Form Step: 1 = Customer Details, 2 = Solar Requirement, 3 = Documents & Submit, 4 = Success
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submittedLead, setSubmittedLead] = useState(null);

  // Step 1: Customer Details
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [customerType, setCustomerType] = useState("Residential");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [pincode, setPincode] = useState("");
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);

  // Location Autocomplete & GPS State
  const [locSuggestions, setLocSuggestions] = useState([]);
  const [locLoading, setLocLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const searchTimeoutRef = useRef(null);

  // Step 2: Solar Requirement
  const [systemRequirement, setSystemRequirement] = useState("Full Solar System");
  const [systemKw, setSystemKw] = useState("5");
  const [customKw, setCustomKw] = useState("");
  const [isCustomCapacity, setIsCustomCapacity] = useState(false);
  const [monthlyBill, setMonthlyBill] = useState("");
  const [consumerNumber, setConsumerNumber] = useState("");
  const [connectionType, setConnectionType] = useState("Single Phase");
  const [roofType, setRoofType] = useState("RCC Flat");
  const [offeringAmount, setOfferingAmount] = useState("");
  const [additionalMessage, setAdditionalMessage] = useState("");

  // Step 3: Documents Uploads & Progress
  // Array of: { id, file_id, name, size, content_type, progress, uploaded, uploading, error, blobUrl }
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // 1. Fetch Company Branding on Mount
  useEffect(() => {
    let isMounted = true;
    const fetchBranding = async () => {
      setBrandingLoading(true);
      setBrandingError(null);
      try {
        const res = await axios.get(`${API}/public/sales/${token}`);
        if (isMounted) {
          setBranding(res.data);
          if (res.data?.state) setStateName(res.data.state);
        }
      } catch (err) {
        if (isMounted) {
          const detail = err.response?.data?.detail || "Sales link is invalid or expired.";
          setBrandingError(detail);
        }
      } finally {
        if (isMounted) setBrandingLoading(false);
      }
    };
    if (token) fetchBranding();
    return () => { isMounted = false; };
  }, [token]);

  // Address Autocomplete Search
  const handleAddressChange = (val) => {
    setAddress(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!val || val.trim().length < 2) {
      setLocSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      setLocLoading(true);
      try {
        const results = await searchLocations(val.trim());
        setLocSuggestions(results || []);
        setShowSuggestions(true);
      } catch (e) {
        setLocSuggestions([]);
      } finally {
        setLocLoading(false);
      }
    }, 300);
  };

  const handleSelectLocation = (loc) => {
    setAddress(loc.address || loc.description || loc.name || address);
    if (loc.city) setCity(loc.city);
    if (loc.state) setStateName(loc.state);
    if (loc.pincode) setPincode(loc.pincode);
    if (loc.lat && loc.lng) {
      setLatitude(loc.lat);
      setLongitude(loc.lng);
    }
    setShowSuggestions(false);
  };

  // GPS Current Location Detection
  const handleUseCurrentLocation = async () => {
    setGpsLoading(true);
    try {
      const loc = await getCurrentLocationDetails();
      if (loc.address) setAddress(loc.address);
      if (loc.city) setCity(loc.city);
      if (loc.state) setStateName(loc.state);
      if (loc.pincode) setPincode(loc.pincode);
      if (loc.latitude) setLatitude(loc.latitude);
      if (loc.longitude) setLongitude(loc.longitude);
      toast.success("Location detected from GPS successfully!");
    } catch (err) {
      toast.error(err.message || "Could not detect GPS location.");
    } finally {
      setGpsLoading(false);
    }
  };

  // Capacity selection
  const standardCapacities = ["3", "5", "8", "10", "15", "25", "50", "100"];
  const handleSelectCapacity = (kw) => {
    setIsCustomCapacity(false);
    setSystemKw(kw);
    setCustomKw("");
  };
  const handleCustomCapacityChange = (val) => {
    setIsCustomCapacity(true);
    setCustomKw(val);
    setSystemKw(val);
  };

  // Immediate Document Upload Handler
  const uploadSingleFile = async (fileItem) => {
    const formData = new FormData();
    formData.append("file", fileItem.rawFile);

    try {
      const res = await axios.post(`${API}/public/sales/${token}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadedFiles((prev) =>
              prev.map((f) => (f.tempKey === fileItem.tempKey ? { ...f, progress: percent } : f))
            );
          }
        },
      });

      const data = res.data;
      const finalId = data.id || data.file_id;
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.tempKey === fileItem.tempKey
            ? {
                ...f,
                id: finalId,
                file_id: finalId,
                name: data.filename || data.original_filename || f.name,
                size: data.size || f.size,
                content_type: data.content_type || f.content_type,
                progress: 100,
                uploaded: true,
                uploading: false,
              }
            : f
        )
      );
    } catch (err) {
      console.error("File upload error:", err);
      const errMsg = err.response?.data?.detail || "Upload failed";
      setUploadedFiles((prev) =>
        prev.map((f) =>
          f.tempKey === fileItem.tempKey
            ? { ...f, error: errMsg, uploading: false }
            : f
        )
      );
      toast.error(`Failed to upload ${fileItem.name}: ${errMsg}`);
    }
  };

  const handleFilesAdded = (filesList) => {
    const files = Array.from(filesList || []);
    if (!files.length) return;

    const newItems = files.map((file) => {
      const tempKey = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const blobUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
      return {
        tempKey,
        rawFile: file,
        name: file.name,
        size: file.size,
        content_type: file.type || "application/octet-stream",
        progress: 0,
        uploaded: false,
        uploading: true,
        error: null,
        blobUrl,
      };
    });

    setUploadedFiles((prev) => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = "";

    // Trigger upload for each new file
    newItems.forEach((item) => {
      uploadSingleFile(item);
    });
  };

  // Remove uploaded file & call backend DELETE to prevent orphan storage
  const handleRemoveUploadedFile = async (indexToRemove) => {
    const target = uploadedFiles[indexToRemove];
    if (!target) return;

    // Remove from UI immediately
    setUploadedFiles((prev) => prev.filter((_, i) => i !== indexToRemove));

    // If already stored on server, invoke delete endpoint to clean up staged file
    const fileId = target.id || target.file_id;
    if (fileId) {
      try {
        await axios.delete(`${API}/public/sales/${token}/upload/${fileId}`);
      } catch (e) {
        console.warn("Could not delete staged file from server:", e);
      }
    }
    if (target.blobUrl) {
      try { URL.revokeObjectURL(target.blobUrl); } catch (_) {}
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer && e.dataTransfer.files) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  // Step 1 Validation & Next
  const handleStep1Next = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter your full name");
      return;
    }
    const cleanMobile = mobile.replace(/\D/g, "");
    if (!cleanMobile || cleanMobile.length < 10) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }
    setCurrentStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Step 2 Validation & Next
  const handleStep2Next = (e) => {
    e.preventDefault();
    const kwNum = Number(systemKw);
    if (!kwNum || kwNum <= 0) {
      toast.error("Please select or enter a valid solar system capacity (kW)");
      return;
    }
    setCurrentStep(3);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Step 3 Final Submission
  const handleSubmitEnquiry = async (e) => {
    e.preventDefault();

    // Check if any file is still actively uploading
    const stillUploading = uploadedFiles.some((f) => f.uploading);
    if (stillUploading) {
      toast.error("Please wait for all documents to finish uploading before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      // Collect valid uploaded document IDs & metadata
      const documentIds = [];
      const documentsMeta = [];

      uploadedFiles.forEach((f) => {
        const fId = f.id || f.file_id;
        if (fId && f.uploaded) {
          documentIds.push(fId);
          documentsMeta.push({
            id: fId,
            file_id: fId,
            filename: f.name,
            original_filename: f.name,
            content_type: f.content_type,
            size: f.size,
          });
        }
      });

      const payload = {
        name: name.trim(),
        mobile: mobile.trim(),
        email: email.trim() || undefined,
        customer_type: customerType,
        system_requirement: systemRequirement,
        solar_capacity_kw: Number(systemKw) || 0,
        monthly_bill: Number(monthlyBill) || 0,
        consumer_number: consumerNumber.trim() || undefined,
        connection_type: connectionType,
        roof_type: roofType,
        project_address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: stateName.trim() || undefined,
        pincode: pincode.trim() || undefined,
        latitude: latitude || undefined,
        longitude: longitude || undefined,
        offering_amount: Number(offeringAmount) || undefined,
        additional_message: additionalMessage.trim() || undefined,
        document_ids: documentIds,
        documents: documentsMeta,
      };

      const res = await axios.post(`${API}/public/sales/${token}/lead`, payload);
      setSubmittedLead(res.data?.lead || { lead_no: "CONFIRMED", name });
      setCurrentStep(4);
      toast.success("Solar enquiry submitted successfully!");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("Lead submission error:", err);
      const detail = err.response?.data?.detail || "Failed to submit solar inquiry. Please check details and try again.";
      toast.error(detail);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetForNewEnquiry = () => {
    setName("");
    setMobile("");
    setEmail("");
    setCustomerType("Residential");
    setAddress("");
    setCity("");
    setStateName(branding?.state || "");
    setPincode("");
    setLatitude(null);
    setLongitude(null);
    setSystemRequirement("Full Solar System");
    setSystemKw("5");
    setCustomKw("");
    setIsCustomCapacity(false);
    setMonthlyBill("");
    setConsumerNumber("");
    setConnectionType("Single Phase");
    setRoofType("RCC Flat");
    setOfferingAmount("");
    setAdditionalMessage("");
    setUploadedFiles([]);
    setSubmittedLead(null);
    setCurrentStep(1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Helper formatting for file size
  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return "0 KB";
    const k = 1024;
    if (bytes < k * k) {
      return `${(bytes / k).toFixed(1)} KB`;
    }
    return `${(bytes / (k * k)).toFixed(1)} MB`;
  };

  // Loading State
  if (brandingLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-600">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-3" />
        <p className="text-xs font-semibold tracking-wide uppercase text-slate-500">Loading Solar Quotation Portal...</p>
      </div>
    );
  }

  // Error State
  if (brandingError || !branding) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 mb-1">Inquiry Portal Unavailable</h1>
        <p className="text-xs text-slate-500 max-w-sm mb-5">
          {brandingError || "This solar inquiry link has expired or is no longer active. Please contact the solar company directly."}
        </p>
      </div>
    );
  }

  const companyName = branding.company_name || "Solar EPC Solutions";
  const logoUrl = branding.logo_url ? `${API}${branding.logo_url}` : null;
  const initialLetter = companyName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans antialiased py-6 px-3 sm:px-6">
      <div className="max-w-4xl mx-auto">

        {/* ─── COMPACT COMPANY HEADER (ZERO SOLARIX BRANDING) ──────────────────── */}
        <header className="bg-white border border-slate-200/80 rounded-2xl p-4 sm:p-5 shadow-xs mb-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3.5 min-w-0">
              {/* Logo / Monogram */}
              {logoUrl && !logoFailed ? (
                <img
                  src={logoUrl}
                  alt={companyName}
                  onError={() => setLogoFailed(true)}
                  className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl object-contain border border-slate-100 p-0.5 bg-white shrink-0"
                />
              ) : (
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shrink-0 shadow-xs">
                  {initialLetter}
                </div>
              )}

              {/* Company Info */}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate">
                    {companyName}
                  </h1>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    <ShieldCheck className="w-3 h-3" /> Verified EPC
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5 flex-wrap">
                  {(branding.city || branding.state) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      {[branding.city, branding.state].filter(Boolean).join(", ")}
                    </span>
                  )}
                  {branding.mobile && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400" />
                      {branding.mobile}
                    </span>
                  )}
                  {branding.email && (
                    <span className="hidden md:flex items-center gap-1">
                      <Mail className="w-3 h-3 text-slate-400" />
                      {branding.email}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Portal Action Tag */}
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Direct Portal</span>
              <span className="text-xs font-semibold text-emerald-800">Solar Quotation Request</span>
            </div>
          </div>
        </header>

        {/* ─── SUCCESS SCREEN (STEP 4) ───────────────────────────────────────── */}
        {currentStep === 4 && (
          <Card className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 shadow-xs text-center">
            {/* Logo / Monogram */}
            <div className="flex justify-center mb-4">
              {logoUrl && !logoFailed ? (
                <img
                  src={logoUrl}
                  alt={companyName}
                  className="w-14 h-14 rounded-2xl object-contain border border-slate-100 p-1 bg-white"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold text-2xl shadow-xs">
                  {initialLetter}
                </div>
              )}
            </div>

            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mb-1">
              Thank you, {submittedLead?.name || name}!
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto mb-5">
              Your solar quotation enquiry has been submitted directly to <strong className="font-semibold text-slate-800">{companyName}</strong>. Our engineering team will review your site specifications and contact you shortly.
            </p>

            {/* Reference Badge */}
            <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 mb-6">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Enquiry Reference:</span>
              <span className="text-xs font-mono font-bold text-slate-900">
                {submittedLead?.lead_no || "CONFIRMED"}
              </span>
            </div>

            {/* Submitted Summary Grid */}
            <div className="max-w-md mx-auto bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 text-left text-xs mb-6 space-y-2">
              <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                <span className="text-slate-500">System Capacity</span>
                <span className="font-semibold text-slate-900">{systemKw} kW ({systemRequirement})</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                <span className="text-slate-500">Customer Type</span>
                <span className="font-semibold text-slate-900">{customerType}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 pb-1.5">
                <span className="text-slate-500">Installation Location</span>
                <span className="font-semibold text-slate-900 truncate max-w-[240px]">
                  {[city, stateName].filter(Boolean).join(", ") || address || "Provided"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Documents Attached</span>
                <span className="font-semibold text-slate-900">
                  {uploadedFiles.filter((f) => f.uploaded).length} file(s)
                </span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handleResetForNewEnquiry}
              className="text-xs font-semibold h-10 px-5 border-slate-300 hover:bg-slate-50"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Submit Another Enquiry
            </Button>
          </Card>
        )}

        {/* ─── ACTIVE FORM STEPS (1, 2, 3) ───────────────────────────────────── */}
        {currentStep <= 3 && (
          <div className="space-y-5">
            {/* ─── PROGRESS STEPPER ────────────────────────────────────────────── */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-3 sm:p-4 shadow-xs">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                {/* Step 1 */}
                <div
                  onClick={() => setCurrentStep(1)}
                  className={`flex items-center justify-center gap-2 p-2 rounded-xl transition-all cursor-pointer ${
                    currentStep === 1
                      ? "bg-emerald-50 text-emerald-800 font-bold border border-emerald-200/60"
                      : currentStep > 1
                      ? "text-slate-700 font-medium hover:bg-slate-50"
                      : "text-slate-400"
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] shrink-0 ${
                    currentStep > 1 ? "bg-emerald-600 text-white font-bold" : currentStep === 1 ? "bg-emerald-600 text-white font-bold" : "bg-slate-100 text-slate-500"
                  }`}>
                    {currentStep > 1 ? "✓" : "1"}
                  </span>
                  <span className="truncate">01 Customer</span>
                </div>

                {/* Step 2 */}
                <div
                  onClick={() => {
                    if (name.trim() && mobile.replace(/\D/g, "").length >= 10) {
                      setCurrentStep(2);
                    } else {
                      toast.error("Please complete Name and 10-digit Mobile in Step 1 first");
                    }
                  }}
                  className={`flex items-center justify-center gap-2 p-2 rounded-xl transition-all cursor-pointer ${
                    currentStep === 2
                      ? "bg-emerald-50 text-emerald-800 font-bold border border-emerald-200/60"
                      : currentStep > 2
                      ? "text-slate-700 font-medium hover:bg-slate-50"
                      : "text-slate-400"
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] shrink-0 ${
                    currentStep > 2 ? "bg-emerald-600 text-white font-bold" : currentStep === 2 ? "bg-emerald-600 text-white font-bold" : "bg-slate-100 text-slate-500"
                  }`}>
                    {currentStep > 2 ? "✓" : "2"}
                  </span>
                  <span className="truncate">02 Solar Requirement</span>
                </div>

                {/* Step 3 */}
                <div
                  onClick={() => {
                    if (name.trim() && mobile.replace(/\D/g, "").length >= 10 && Number(systemKw) > 0) {
                      setCurrentStep(3);
                    } else {
                      toast.error("Please verify Customer & Solar Requirement steps first");
                    }
                  }}
                  className={`flex items-center justify-center gap-2 p-2 rounded-xl transition-all cursor-pointer ${
                    currentStep === 3
                      ? "bg-emerald-50 text-emerald-800 font-bold border border-emerald-200/60"
                      : "text-slate-400"
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] shrink-0 ${
                    currentStep === 3 ? "bg-emerald-600 text-white font-bold" : "bg-slate-100 text-slate-500"
                  }`}>
                    3
                  </span>
                  <span className="truncate">03 Documents & Submit</span>
                </div>
              </div>
            </div>

            {/* ─── STEP 1: CUSTOMER DETAILS ────────────────────────────────────── */}
            {currentStep === 1 && (
              <Card className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-7 shadow-xs">
                <div className="mb-5 pb-3 border-b border-slate-100">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                    Step 1: Customer Details & Site Location
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Provide your contact details and where the solar system will be installed.
                  </p>
                </div>

                <form onSubmit={handleStep1Next} className="space-y-4">
                  {/* Row 1: Full Name & Mobile Number */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                        Full Name <span className="text-rose-500">*</span>
                      </Label>
                      <Input
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Rajesh Sharma"
                        className="mt-1 h-10 text-xs text-slate-900 border-slate-200 focus:border-emerald-600"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                        Mobile Number <span className="text-rose-500">*</span>
                      </Label>
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-2.5 text-xs font-semibold text-slate-500 select-none">
                          +91
                        </span>
                        <Input
                          required
                          type="tel"
                          maxLength={10}
                          value={mobile}
                          onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
                          placeholder="9876543210"
                          className="pl-11 h-10 text-xs font-mono text-slate-900 border-slate-200 focus:border-emerald-600"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Email & Customer Type */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">
                        Email Address <span className="text-slate-400 text-[10px] font-normal">(Optional)</span>
                      </Label>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="rajesh@example.com"
                        className="mt-1 h-10 text-xs text-slate-900 border-slate-200 focus:border-emerald-600"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold text-slate-700 mb-1 block">
                        Customer / Property Type <span className="text-rose-500">*</span>
                      </Label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: "Residential", label: "Residential", icon: Home },
                          { id: "Commercial", label: "Commercial", icon: Building2 },
                          { id: "Industrial", label: "Industrial", icon: Factory },
                        ].map((t) => {
                          const IconComp = t.icon;
                          const active = customerType === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setCustomerType(t.id)}
                              className={`h-10 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                                active
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-500 shadow-2xs"
                                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                              }`}
                            >
                              <IconComp className={`w-3.5 h-3.5 ${active ? "text-emerald-600" : "text-slate-400"}`} />
                              <span className="truncate">{t.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* ─── PROJECT LOCATION SECTION ───────────────────────────────── */}
                  <div className="pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <Label className="text-xs font-semibold text-slate-700">
                        Project Site Address <span className="text-slate-400 text-[10px] font-normal">(Search or enter)</span>
                      </Label>
                      <button
                        type="button"
                        onClick={handleUseCurrentLocation}
                        disabled={gpsLoading}
                        className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 transition-colors"
                      >
                        {gpsLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Navigation className="w-3 h-3" />
                        )}
                        Use Current Location
                      </button>
                    </div>

                    <div className="relative">
                      <Input
                        value={address}
                        onChange={(e) => handleAddressChange(e.target.value)}
                        onFocus={() => { if (locSuggestions.length > 0) setShowSuggestions(true); }}
                        placeholder="Search landmark, building, society, or enter address..."
                        className="h-10 text-xs text-slate-900 border-slate-200 focus:border-emerald-600 pr-8"
                      />
                      {locLoading && (
                        <div className="absolute right-2.5 top-3 text-slate-400">
                          <Loader2 className="w-4 h-4 animate-spin" />
                        </div>
                      )}

                      {/* Autocomplete Dropdown */}
                      {showSuggestions && locSuggestions.length > 0 && (
                        <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-slate-200 max-h-48 overflow-y-auto divide-y divide-slate-100">
                          {locSuggestions.map((item, idx) => (
                            <div
                              key={idx}
                              onClick={() => handleSelectLocation(item)}
                              className="p-2.5 text-xs text-slate-700 hover:bg-emerald-50/50 hover:text-emerald-900 cursor-pointer flex items-center gap-2"
                            >
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{item.address || item.description || item.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Compact City, State, PIN Code Row */}
                    <div className="grid grid-cols-3 gap-3 mt-3">
                      <div>
                        <Label className="text-[11px] font-medium text-slate-600">City</Label>
                        <Input
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="e.g. Surat"
                          className="mt-1 h-9 text-xs text-slate-900 border-slate-200"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] font-medium text-slate-600">State</Label>
                        <Input
                          value={stateName}
                          onChange={(e) => setStateName(e.target.value)}
                          placeholder="e.g. Gujarat"
                          className="mt-1 h-9 text-xs text-slate-900 border-slate-200"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] font-medium text-slate-600">PIN Code</Label>
                        <Input
                          maxLength={6}
                          value={pincode}
                          onChange={(e) => setPincode(e.target.value.replace(/\D/g, ""))}
                          placeholder="e.g. 395007"
                          className="mt-1 h-9 text-xs font-mono text-slate-900 border-slate-200"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Step 1 Actions */}
                  <div className="pt-4 flex justify-end">
                    <Button
                      type="submit"
                      className="h-10 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center gap-1.5"
                    >
                      Continue to Solar Requirement <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {/* ─── STEP 2: SOLAR REQUIREMENT ───────────────────────────────────── */}
            {currentStep === 2 && (
              <Card className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-7 shadow-xs">
                <div className="mb-5 pb-3 border-b border-slate-100">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                    Step 2: Solar System Specifications
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select your desired capacity and system details to help us size your plant.
                  </p>
                </div>

                <form onSubmit={handleStep2Next} className="space-y-4">
                  {/* Scope / Requirement */}
                  <div>
                    <Label className="text-xs font-semibold text-slate-700 mb-1.5 block">
                      Scope / Requirement
                    </Label>
                    <div className="grid grid-cols-2 gap-2.5">
                      {[
                        { id: "Full Solar System", label: "Full Solar System", sub: "Turnkey EPC (Supply, Installation & Net Metering)" },
                        { id: "Equipment Supply Only", label: "Equipment Supply Only", sub: "Modules, Inverters & BOS supply only" },
                      ].map((s) => {
                        const active = systemRequirement === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSystemRequirement(s.id)}
                            className={`p-3 rounded-xl text-left border transition-all ${
                              active
                                ? "bg-emerald-50 text-emerald-950 border-emerald-500 shadow-2xs"
                                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                            }`}
                          >
                            <div className="text-xs font-bold">{s.label}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">{s.sub}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* System Capacity Quick Values Chips */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <Label className="text-xs font-semibold text-slate-700">
                        System Capacity <span className="text-rose-500">*</span>
                      </Label>
                      <span className="text-[11px] font-bold text-emerald-700 font-mono">
                        Selected: {systemKw || 0} kW
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {standardCapacities.map((kw) => {
                        const active = !isCustomCapacity && systemKw === kw;
                        return (
                          <button
                            key={kw}
                            type="button"
                            onClick={() => handleSelectCapacity(kw)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                              active
                                ? "bg-emerald-600 text-white border-emerald-600 shadow-2xs"
                                : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-white hover:border-slate-300"
                            }`}
                          >
                            {kw} kW
                          </button>
                        );
                      })}
                      <div className="inline-flex items-center gap-1">
                        <Input
                          type="number"
                          step="0.5"
                          min="1"
                          max="10000"
                          value={isCustomCapacity ? customKw : ""}
                          onChange={(e) => handleCustomCapacityChange(e.target.value)}
                          placeholder="Custom kW"
                          className={`w-24 h-8 text-xs font-mono border-slate-200 ${
                            isCustomCapacity ? "border-emerald-600 bg-emerald-50/50 font-bold" : ""
                          }`}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Clean Grid of Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    {/* Monthly Bill */}
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">
                        Monthly Electricity Bill (₹)
                      </Label>
                      <Input
                        type="number"
                        step="100"
                        min="0"
                        value={monthlyBill}
                        onChange={(e) => setMonthlyBill(e.target.value)}
                        placeholder="e.g. 4500"
                        className="mt-1 h-10 text-xs font-mono text-slate-900 border-slate-200 focus:border-emerald-600"
                      />
                    </div>

                    {/* Consumer Number */}
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">
                        Consumer / CA Number <span className="text-slate-400 text-[10px] font-normal">(From electricity bill)</span>
                      </Label>
                      <Input
                        value={consumerNumber}
                        onChange={(e) => setConsumerNumber(e.target.value)}
                        placeholder="e.g. 012345678901"
                        className="mt-1 h-10 text-xs font-mono text-slate-900 border-slate-200 focus:border-emerald-600"
                      />
                    </div>

                    {/* Electrical Phase */}
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">
                        Electrical Connection Phase
                      </Label>
                      <select
                        value={connectionType}
                        onChange={(e) => setConnectionType(e.target.value)}
                        className="mt-1 w-full h-10 px-3 bg-white text-xs text-slate-900 border border-slate-200 rounded-xl focus:border-emerald-600 outline-none"
                      >
                        <option value="Single Phase">Single Phase (1-Phase)</option>
                        <option value="Three Phase">Three Phase (3-Phase)</option>
                        <option value="HT Connection">HT Connection (11kV / 33kV)</option>
                      </select>
                    </div>

                    {/* Roof / Site Construction */}
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">
                        Roof / Site Construction
                      </Label>
                      <select
                        value={roofType}
                        onChange={(e) => setRoofType(e.target.value)}
                        className="mt-1 w-full h-10 px-3 bg-white text-xs text-slate-900 border border-slate-200 rounded-xl focus:border-emerald-600 outline-none"
                      >
                        <option value="RCC Flat">RCC Flat Roof</option>
                        <option value="Industrial Metal Shed">Industrial Metal Shed (Tin / Trapezoidal)</option>
                        <option value="Tiled Roof">Tiled / Sloped Roof</option>
                        <option value="Ground Mount">Ground Mount System</option>
                        <option value="Carport / Canopy">Carport / Canopy Structure</option>
                        <option value="Other">Other / Special Construction</option>
                      </select>
                    </div>

                    {/* Target Budget / Offering Amount */}
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">
                        Target Budget / Offering Amount (₹) <span className="text-slate-400 text-[10px] font-normal">(Optional)</span>
                      </Label>
                      <Input
                        type="number"
                        step="5000"
                        min="0"
                        value={offeringAmount}
                        onChange={(e) => setOfferingAmount(e.target.value)}
                        placeholder="e.g. 250000"
                        className="mt-1 h-10 text-xs font-mono text-slate-900 border-slate-200 focus:border-emerald-600"
                      />
                    </div>

                    {/* Additional Requirements */}
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">
                        Special Requirements / Notes
                      </Label>
                      <Textarea
                        rows={1}
                        value={additionalMessage}
                        onChange={(e) => setAdditionalMessage(e.target.value)}
                        placeholder="e.g. Battery backup needed, rooftop shadow after 4 PM"
                        className="mt-1 min-h-[40px] text-xs text-slate-900 border-slate-200 focus:border-emerald-600 resize-none"
                      />
                    </div>
                  </div>

                  {/* Step 2 Actions */}
                  <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCurrentStep(1)}
                      className="h-10 px-4 text-xs text-slate-700 rounded-xl border-slate-200"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
                    </Button>
                    <Button
                      type="submit"
                      className="h-10 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center gap-1.5"
                    >
                      Continue to Documents & Submit <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {/* ─── STEP 3: DOCUMENTS, REVIEW & SUBMIT ─────────────────────────── */}
            {currentStep === 3 && (
              <div className="space-y-5">
                {/* ─── SECTION 1: DOCUMENTS & PHOTOS ─── */}
                <Card className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-7 shadow-xs">
                  <div className="mb-4">
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                      Documents & Photos
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Upload electricity bills, roof photos, sanction letters or other documents that help us prepare your quotation.
                    </p>
                  </div>

                  {/* Clean Upload Dropzone */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                      isDragging
                        ? "border-emerald-500 bg-emerald-50/40 scale-[0.99]"
                        : "border-slate-200 hover:border-emerald-500 bg-slate-50/50 hover:bg-emerald-50/10"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png,.webp,image/*,application/pdf"
                      onChange={(e) => handleFilesAdded(e.target.files)}
                      className="hidden"
                    />
                    <div className="w-10 h-10 rounded-full bg-white shadow-2xs text-emerald-600 flex items-center justify-center mx-auto mb-2">
                      <UploadCloud className="w-5 h-5" />
                    </div>
                    <div className="text-xs font-bold text-slate-800">
                      + Add Documents
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Drop files here or click to browse
                    </p>
                    <div className="text-[10px] text-slate-400 font-medium mt-1">
                      PDF, JPG, PNG, WEBP • Up to 10 MB per file • No file-count limit
                    </div>
                  </div>

                  {/* Uploaded Files Listing */}
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2 mt-4">
                      {uploadedFiles.map((fileItem, idx) => {
                        const isImage = fileItem.content_type?.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(fileItem.name);
                        const isPdf = fileItem.content_type?.includes("pdf") || /\.pdf$/i.test(fileItem.name);

                        return (
                          <div
                            key={fileItem.tempKey || idx}
                            className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs hover:border-slate-300 transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                isPdf ? "bg-rose-50 text-rose-600" : isImage ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-600"
                              }`}>
                                {isImage ? <ImageIcon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                              </div>

                              <div className="min-w-0">
                                <span className="font-semibold text-slate-900 truncate block">
                                  {fileItem.name}
                                </span>
                                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                                  <span>{formatFileSize(fileItem.size)}</span>
                                  <span>•</span>
                                  {fileItem.uploading ? (
                                    <span className="text-emerald-700 flex items-center gap-1 font-semibold">
                                      <Loader2 className="w-3 h-3 animate-spin" /> Uploading {fileItem.progress}%
                                    </span>
                                  ) : fileItem.uploaded ? (
                                    <span className="text-emerald-700 flex items-center gap-1 font-semibold">
                                      <Check className="w-3 h-3 text-emerald-600" /> Uploaded
                                    </span>
                                  ) : fileItem.error ? (
                                    <span className="text-rose-600 font-semibold">Error: {fileItem.error}</span>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {fileItem.blobUrl && (
                                <a
                                  href={fileItem.blobUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-slate-50 rounded-lg text-[11px] font-medium inline-flex items-center gap-1"
                                  title="Preview file"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveUploadedFile(idx)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Remove file"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>

                {/* ─── SECTION 2: REVIEW BEFORE SUBMIT ─── */}
                <Card className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                      Review Enquiry Summary
                    </h3>
                    <span className="text-[11px] text-slate-400 font-medium">Verify before submitting</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 text-xs">
                    {/* Customer */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Customer</span>
                      <div className="font-bold text-slate-900 truncate">{name}</div>
                      <div className="text-slate-600 font-mono text-[11px]">{mobile}</div>
                      <div className="text-slate-500 text-[11px]">{customerType}</div>
                    </div>

                    {/* Location */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Site Location</span>
                      <div className="font-semibold text-slate-800 truncate">
                        {[city, stateName].filter(Boolean).join(", ") || "Location Specified"}
                      </div>
                      <div className="text-slate-500 text-[11px] truncate">{address || "No street address"}</div>
                      {pincode && <div className="text-slate-400 text-[11px] font-mono">PIN: {pincode}</div>}
                    </div>

                    {/* Solar Requirement */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Solar Requirement</span>
                      <div className="font-bold text-emerald-800">{systemKw} kW Capacity</div>
                      <div className="text-slate-600 text-[11px] truncate">{systemRequirement}</div>
                      <div className="text-slate-500 text-[11px]">{roofType} • {connectionType}</div>
                    </div>

                    {/* Commercials & Docs */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Commercials & Docs</span>
                      {offeringAmount ? (
                        <div className="font-bold text-slate-900">Budget: ₹{Number(offeringAmount).toLocaleString("en-IN")}</div>
                      ) : (
                        <div className="text-slate-500 text-[11px]">Budget: Standard EPC</div>
                      )}
                      {monthlyBill && (
                        <div className="text-slate-600 text-[11px]">Bill: ₹{Number(monthlyBill).toLocaleString("en-IN")}/mo</div>
                      )}
                      <div className="text-emerald-700 font-semibold text-[11px]">
                        {uploadedFiles.filter((f) => f.uploaded).length} Document(s) Attached
                      </div>
                    </div>
                  </div>

                  {/* Submit Action Buttons */}
                  <div className="pt-4 flex items-center justify-between border-t border-slate-100 mt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCurrentStep(2)}
                      disabled={submitting}
                      className="h-10 px-4 text-xs text-slate-700 rounded-xl border-slate-200"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
                    </Button>

                    <Button
                      type="button"
                      onClick={handleSubmitEnquiry}
                      disabled={submitting}
                      className="h-11 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-sm flex items-center gap-2"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Submitting Enquiry...
                        </>
                      ) : (
                        <>
                          Submit Enquiry to {companyName} <Check className="w-4 h-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* ─── FOOTER TRUST NOTE ─────────────────────────────────────────────── */}
        <footer className="text-center text-[11px] text-slate-400 py-6 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Your contact details and site data are submitted directly to {companyName}.</span>
        </footer>

      </div>
    </div>
  );
}
