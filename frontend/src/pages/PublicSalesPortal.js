import React, { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
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
  AlertCircle, ShieldCheck, Zap, Sparkles, Navigation
} from "lucide-react";

export default function PublicSalesPortal() {
  const { token } = useParams();
  const [brandingLoading, setBrandingLoading] = useState(true);
  const [brandingError, setBrandingError] = useState(null);
  const [branding, setBranding] = useState(null);
  const [logoFailed, setLogoFailed] = useState(false);

  // Form State
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submittedLead, setSubmittedLead] = useState(null);

  // Step 1: Customer & Site Details
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

  // Location Autocomplete State
  const [locSuggestions, setLocSuggestions] = useState([]);
  const [locLoading, setLocLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const searchTimeoutRef = useRef(null);

  // Step 2: System Requirements & Commercials
  const [systemRequirement, setSystemRequirement] = useState("Full Solar System");
  const [systemKw, setSystemKw] = useState("5");
  const [monthlyBill, setMonthlyBill] = useState("");
  const [consumerNumber, setConsumerNumber] = useState("");
  const [connectionType, setConnectionType] = useState("Single Phase");
  const [roofType, setRoofType] = useState("RCC Flat");
  const [offeringAmount, setOfferingAmount] = useState("");
  const [additionalMessage, setAdditionalMessage] = useState("");

  // Document Uploads
  const [selectedFiles, setSelectedFiles] = useState([]); // [{ file, id, name, size, progress, uploaded, error }]
  const [uploadProgressOverall, setUploadProgressOverall] = useState(0);
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

  // File Upload Handlers (No artificial limit; 10MB per file infrastructure limit)
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newItems = files.map((file) => ({
      file,
      name: file.name,
      size: file.size,
      progress: 0,
      uploaded: false,
      uploadedFileId: null,
      error: null,
    }));
    setSelectedFiles((prev) => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Step 1 Validation & Next
  const handleStep1Next = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Please enter your name");
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

  // Final Submission
  const handleSubmitInquiry = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // 1. Upload files first if any
      const uploadedDocIds = [];
      const updatedFiles = [...selectedFiles];

      for (let i = 0; i < updatedFiles.length; i++) {
        const item = updatedFiles[i];
        if (item.uploaded && item.uploadedFileId) {
          uploadedDocIds.push(item.uploadedFileId);
          continue;
        }

        const formData = new FormData();
        formData.append("file", item.file);

        try {
          const upRes = await axios.post(`${API}/public/sales/${token}/upload`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
            onUploadProgress: (progressEvent) => {
              if (progressEvent.total) {
                const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                setSelectedFiles((current) =>
                  current.map((f, idx) => (idx === i ? { ...f, progress: percent } : f))
                );
              }
            },
          });
          const fileData = upRes.data;
          uploadedDocIds.push(fileData.id);
          setSelectedFiles((current) =>
            current.map((f, idx) =>
              idx === i ? { ...f, uploaded: true, uploadedFileId: fileData.id, progress: 100 } : f
            )
          );
        } catch (uploadErr) {
          console.error("Document upload error:", uploadErr);
          const msg = uploadErr.response?.data?.detail || "Upload failed";
          setSelectedFiles((current) =>
            current.map((f, idx) => (idx === i ? { ...f, error: msg } : f))
          );
          toast.error(`Failed to upload ${item.name}: ${msg}`);
          setSubmitting(false);
          return;
        }
      }

      // 2. Submit Lead
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
        document_ids: uploadedDocIds,
      };

      const res = await axios.post(`${API}/public/sales/${token}/lead`, payload);
      setSubmittedLead(res.data?.lead || { lead_no: "CONFIRMED", name });
      toast.success("Solar inquiry submitted successfully!");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      console.error("Lead submission error:", err);
      const detail = err.response?.data?.detail || "Failed to submit solar inquiry. Please try again.";
      toast.error(detail);
    } finally {
      setSubmitting(false);
    }
  };

  // Loading State
  if (brandingLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-white shadow-md flex items-center justify-center mb-4 border border-slate-100">
          <Loader2 className="w-7 h-7 text-emerald-600 animate-spin" />
        </div>
        <h2 className="text-base font-semibold text-slate-800">Connecting to Solar Portal...</h2>
        <p className="text-xs text-slate-500 mt-1 max-w-xs">Loading authorized company details & verified quotation form.</p>
      </div>
    );
  }

  // Error State: Invalid or Revoked Link
  if (brandingError || !branding) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
          Sales Link Unavailable
        </h1>
        <p className="text-sm text-slate-600 max-w-md mt-2">
          {brandingError || "This sales inquiry link is no longer active or the URL is incorrect."}
        </p>
        <p className="text-xs text-slate-400 mt-4">
          Please contact your solar installation provider directly to request an updated inquiry link.
        </p>
      </div>
    );
  }

  const companyName = branding.company_name || branding.name || "Authorized Solar EPC";
  const logoUrl = `${API}/public/sales/${token}/logo`;

  // Render Confirmation State
  if (submittedLead) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-emerald-50/20 to-slate-100 py-10 px-4 flex items-center justify-center">
        <div className="max-w-xl w-full">
          {/* Header Card */}
          <Card className="p-8 text-center border-slate-200/80 shadow-lg bg-white rounded-3xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600" />

            {/* Check Animation / Icon */}
            <div className="w-20 h-20 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-5 ring-8 ring-emerald-50/50">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 px-3 py-1 text-xs font-semibold uppercase tracking-wider mb-2">
              Inquiry Received Successfully
            </Badge>

            <h1 className="text-2xl font-bold text-slate-900 mt-2" style={{ fontFamily: "Outfit" }}>
              Thank You, {submittedLead.name}!
            </h1>

            <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto leading-relaxed">
              Your solar project inquiry has been securely submitted to <strong>{companyName}</strong>. Our engineering team is reviewing your requirements and will contact you at <strong>{submittedLead.mobile}</strong> shortly.
            </p>

            {/* Inquiry Summary Pill */}
            <div className="my-6 p-4 rounded-2xl bg-slate-50 border border-slate-100 text-left space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 pb-2 border-b border-slate-200/60">
                <span>Inquiry Reference</span>
                <span className="font-mono font-bold text-slate-900">{submittedLead.lead_no || "CONFIRMED"}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">System Capacity</span>
                  <span className="font-semibold text-slate-800">{submittedLead.system_kw || systemKw} kW Solar</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Customer Type</span>
                  <span className="font-semibold text-slate-800">{submittedLead.customer_type || customerType}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Location</span>
                  <span className="font-semibold text-slate-800 truncate block">
                    {submittedLead.city || city ? `${submittedLead.city || city}, ${submittedLead.state || stateName}` : "India"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Attached Docs</span>
                  <span className="font-semibold text-slate-800">
                    {selectedFiles.length} file{selectedFiles.length === 1 ? "" : "s"} uploaded
                  </span>
                </div>
              </div>
            </div>

            {/* Company Contact Information */}
            <div className="pt-4 border-t border-slate-100 flex flex-col items-center gap-2">
              <div className="text-xs text-slate-500 font-medium">Need immediate assistance? Reach our office directly:</div>
              <div className="flex items-center gap-4 flex-wrap justify-center text-xs">
                {branding.phone && (
                  <a href={`tel:${branding.phone}`} className="flex items-center gap-1.5 text-emerald-700 hover:underline font-semibold">
                    <Phone className="w-3.5 h-3.5" /> {branding.phone}
                  </a>
                )}
                {branding.email && (
                  <a href={`mailto:${branding.email}`} className="flex items-center gap-1.5 text-emerald-700 hover:underline">
                    <Mail className="w-3.5 h-3.5" /> {branding.email}
                  </a>
                )}
              </div>
            </div>

            <div className="mt-8">
              <Button
                variant="outline"
                onClick={() => {
                  setSubmittedLead(null);
                  setCurrentStep(1);
                  setSelectedFiles([]);
                  setName("");
                  setMobile("");
                  setEmail("");
                  setAddress("");
                }}
                className="text-xs text-slate-700 border-slate-200 hover:bg-slate-50 rounded-xl"
              >
                Submit Another Solar Inquiry
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-emerald-50/20 text-slate-800 py-8 px-4 font-sans">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* ─── COMPANY BRANDED HEADER (ZERO SOLAIX BRANDING) ─────────────────── */}
        <header className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm relative overflow-hidden">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
            {/* Company Logo or Initials Avatar */}
            {!logoFailed && branding.has_logo ? (
              <img
                src={logoUrl}
                alt={companyName}
                onError={() => setLogoFailed(true)}
                className="w-16 h-16 sm:w-20 sm:h-20 object-contain rounded-2xl p-1 bg-white border border-slate-100 shadow-2xs shrink-0"
              />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700 text-white flex items-center justify-center font-bold text-2xl shadow-sm shrink-0">
                {companyName.slice(0, 2).toUpperCase()}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap mb-1">
                <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] font-semibold flex items-center gap-1 py-0.5">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" /> Verified Solar EPC
                </Badge>
                {branding.city && (
                  <span className="text-slate-400 text-xs flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {branding.city}{branding.state ? `, ${branding.state}` : ""}
                  </span>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>
                {companyName}
              </h1>

              <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-lg">
                Request a custom solar rooftop assessment & engineering quotation. Free site survey & guaranteed DISCOM subsidy support.
              </p>

              {/* Direct Company Contact Bar */}
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-center sm:justify-start gap-4 flex-wrap text-xs text-slate-600">
                {branding.phone && (
                  <a href={`tel:${branding.phone}`} className="flex items-center gap-1.5 hover:text-emerald-700 font-medium">
                    <Phone className="w-3.5 h-3.5 text-emerald-600" /> {branding.phone}
                  </a>
                )}
                {branding.email && (
                  <a href={`mailto:${branding.email}`} className="flex items-center gap-1.5 hover:text-emerald-700">
                    <Mail className="w-3.5 h-3.5 text-emerald-600" /> {branding.email}
                  </a>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* ─── 2-STEP PROGRESS BAR ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-2">
          <button
            type="button"
            onClick={() => setCurrentStep(1)}
            className={`flex items-center gap-2 text-xs font-semibold transition ${currentStep === 1 ? "text-emerald-700" : "text-slate-500 hover:text-slate-800"}`}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${currentStep === 1 ? "bg-emerald-600 text-white" : "bg-emerald-100 text-emerald-800"}`}>
              {currentStep > 1 ? <Check className="w-3.5 h-3.5" /> : "1"}
            </div>
            <span>Step 1: Your Site Details</span>
          </button>

          <div className="h-0.5 flex-1 mx-4 bg-slate-200">
            <div className={`h-full bg-emerald-600 transition-all duration-300 ${currentStep === 2 ? "w-full" : "w-0"}`} />
          </div>

          <button
            type="button"
            onClick={() => {
              if (name && mobile) setCurrentStep(2);
            }}
            className={`flex items-center gap-2 text-xs font-semibold transition ${currentStep === 2 ? "text-emerald-700" : "text-slate-400"}`}
          >
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${currentStep === 2 ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}>
              2
            </div>
            <span>Step 2: Solar System & Docs</span>
          </button>
        </div>

        {/* ─── MAIN FORM CARD ─────────────────────────────────────────────────── */}
        <Card className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-8">

          {/* STEP 1: CUSTOMER & SITE DETAILS */}
          {currentStep === 1 && (
            <form onSubmit={handleStep1Next} className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                  Customer & Property Information
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tell us who you are and where the solar power plant is to be installed.
                </p>
              </div>

              {/* Customer Type Radio Cards */}
              <div>
                <Label className="text-xs font-bold text-slate-700 block mb-2">Customer / Property Type *</Label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: "Residential", label: "Residential", desc: "Home, Villa, Apartment", icon: Home },
                    { key: "Business", label: "Commercial", desc: "Office, Hospital, Shop", icon: Building2 },
                    { key: "Industry", label: "Industrial", desc: "Factory, Plant, Shed", icon: Factory },
                  ].map((t) => {
                    const Icon = t.icon;
                    const isSelected = customerType === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setCustomerType(t.key)}
                        className={`p-3.5 rounded-2xl text-left border-2 transition-all flex flex-col justify-between ${
                          isSelected
                            ? "border-emerald-600 bg-emerald-50/50 shadow-xs"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Icon className={`w-5 h-5 ${isSelected ? "text-emerald-700" : "text-slate-400"}`} />
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? "border-emerald-600 bg-emerald-600" : "border-slate-300"}`}>
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                        </div>
                        <div>
                          <div className={`text-xs font-bold ${isSelected ? "text-emerald-950" : "text-slate-800"}`}>
                            {t.label}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{t.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Personal Details */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Full Name *</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Ramesh Patil"
                    required
                    className="mt-1 h-11 text-sm rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Mobile Number * (10 Digits)</Label>
                  <div className="relative mt-1">
                    <span className="absolute left-3.5 top-3 text-xs font-semibold text-slate-400 select-none">
                      +91
                    </span>
                    <Input
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="9876543210"
                      maxLength={10}
                      required
                      className="h-11 pl-12 text-sm font-mono rounded-xl"
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs font-semibold text-slate-700">Email Address (Optional)</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. ramesh@example.com"
                    className="mt-1 h-11 text-sm rounded-xl"
                  />
                </div>
              </div>

              {/* Site Address & Location Auto-Fill */}
              <div className="space-y-2 relative">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-700">Site Installation Address</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={gpsLoading}
                    onClick={handleUseCurrentLocation}
                    className="h-7 px-2 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 font-semibold"
                  >
                    {gpsLoading ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    ) : (
                      <Navigation className="w-3.5 h-3.5 mr-1" />
                    )}
                    Use Current Location
                  </Button>
                </div>

                <div className="relative">
                  <Input
                    value={address}
                    onChange={(e) => handleAddressChange(e.target.value)}
                    onFocus={() => { if (locSuggestions.length > 0) setShowSuggestions(true); }}
                    placeholder="Type locality, street, PIN code or city to auto-detect..."
                    className="h-11 text-sm rounded-xl pr-8"
                  />
                  {locLoading && (
                    <div className="absolute right-3 top-3">
                      <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                    </div>
                  )}

                  {/* Autocomplete Dropdown */}
                  {showSuggestions && locSuggestions.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto">
                      {locSuggestions.map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectLocation(item)}
                          className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-slate-50 flex items-start gap-2 border-b border-slate-100 last:border-b-0 transition"
                        >
                          <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-semibold text-slate-800">
                              {item.title || item.city || item.name || item.description}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {[item.city, item.state, item.pincode].filter(Boolean).join(", ")}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  <div>
                    <Label className="text-[11px] text-slate-500 font-medium">City / District</Label>
                    <Input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. Pune"
                      className="mt-1 h-9 text-xs rounded-lg"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-500 font-medium">State</Label>
                    <Input
                      value={stateName}
                      onChange={(e) => setStateName(e.target.value)}
                      placeholder="e.g. Maharashtra"
                      className="mt-1 h-9 text-xs rounded-lg"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-slate-500 font-medium">PIN Code</Label>
                    <Input
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="e.g. 411001"
                      maxLength={6}
                      className="mt-1 h-9 text-xs font-mono rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Action */}
              <div className="pt-2">
                <Button
                  type="submit"
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md flex items-center justify-center gap-2"
                >
                  Continue to Solar Requirements <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </form>
          )}

          {/* STEP 2: SYSTEM REQUIREMENTS & DOCUMENTS */}
          {currentStep === 2 && (
            <form onSubmit={handleSubmitInquiry} className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                    Solar System & Energy Needs
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Specify your solar capacity requirement and attach relevant photos or bills.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentStep(1)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Edit Site Details
                </Button>
              </div>

              {/* System Requirement Choice */}
              <div>
                <Label className="text-xs font-bold text-slate-700 block mb-2">Scope of Work *</Label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {
                      key: "Full Solar System",
                      title: "Full Solar System (Turnkey EPC)",
                      desc: "Complete setup: panels, inverter, mounting structure, cabling, and DISCOM net-metering approvals.",
                    },
                    {
                      key: "KW System Only",
                      title: "Equipment Supply Only",
                      desc: "Supply of solar PV modules and inverter equipment for self-installation or sub-contractors.",
                    },
                  ].map((opt) => {
                    const isSelected = systemRequirement === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setSystemRequirement(opt.key)}
                        className={`p-3.5 rounded-2xl text-left border-2 transition-all flex flex-col justify-between ${
                          isSelected
                            ? "border-emerald-600 bg-emerald-50/50 shadow-xs"
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <Zap className={`w-4 h-4 ${isSelected ? "text-emerald-700" : "text-slate-400"}`} />
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? "border-emerald-600 bg-emerald-600" : "border-slate-300"}`}>
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                        </div>
                        <div>
                          <div className={`text-xs font-bold ${isSelected ? "text-emerald-950" : "text-slate-800"}`}>
                            {opt.title}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1 leading-snug">{opt.desc}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Solar Capacity Required (kW) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-xs font-bold text-slate-700">Solar Plant Capacity (kW) *</Label>
                  <span className="text-xs font-mono font-bold text-emerald-700">{systemKw} kW</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {["3", "5", "8", "10", "15", "25", "50", "100"].map((kw) => (
                    <Button
                      key={kw}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSystemKw(kw)}
                      className={`text-xs rounded-xl h-8 px-3 font-semibold ${
                        systemKw === kw
                          ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                          : "border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {kw} kW
                    </Button>
                  ))}
                </div>
                <Input
                  type="number"
                  step="0.5"
                  min="1"
                  value={systemKw}
                  onChange={(e) => setSystemKw(e.target.value)}
                  placeholder="Or enter custom kW size..."
                  className="h-10 text-sm font-mono rounded-xl"
                  required
                />
              </div>

              {/* Electricity Bill & Consumer Details */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Approx. Monthly Electricity Bill (₹)</Label>
                  <Input
                    type="number"
                    step="100"
                    min="0"
                    value={monthlyBill}
                    onChange={(e) => setMonthlyBill(e.target.value)}
                    placeholder="e.g. 4500"
                    className="mt-1 h-10 text-sm font-mono rounded-xl"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Used to calculate savings and payback period.</p>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Consumer / CA Number (Optional)</Label>
                  <Input
                    value={consumerNumber}
                    onChange={(e) => setConsumerNumber(e.target.value)}
                    placeholder="From electricity bill"
                    className="mt-1 h-10 text-sm font-mono rounded-xl"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">DISCOM connection account number.</p>
                </div>
              </div>

              {/* Connection Type & Roof Type */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Electrical Connection Phase</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {["Single Phase", "Three Phase"].map((ph) => (
                      <button
                        key={ph}
                        type="button"
                        onClick={() => setConnectionType(ph)}
                        className={`h-9 text-xs rounded-xl border font-semibold transition ${
                          connectionType === ph
                            ? "bg-emerald-50 text-emerald-800 border-emerald-500"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {ph}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">Roof / Site Construction</Label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {["RCC Flat", "Metal Sheet", "Slanted Tile", "Open Ground"].map((rf) => (
                      <button
                        key={rf}
                        type="button"
                        onClick={() => setRoofType(rf)}
                        className={`h-9 text-xs rounded-xl border font-semibold transition ${
                          roofType === rf
                            ? "bg-emerald-50 text-emerald-800 border-emerald-500"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {rf}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Budget / Offering & Notes */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Target Budget / Offering Price (₹)</Label>
                  <Input
                    type="number"
                    step="5000"
                    min="0"
                    value={offeringAmount}
                    onChange={(e) => setOfferingAmount(e.target.value)}
                    placeholder="e.g. 250000"
                    className="mt-1 h-10 text-sm font-mono rounded-xl"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Optional budget expectation for this installation.</p>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">Additional Site Notes / Remarks</Label>
                  <Textarea
                    rows={2}
                    value={additionalMessage}
                    onChange={(e) => setAdditionalMessage(e.target.value)}
                    placeholder="Any shadow obstacles, specific panel brands, or preferred installation timeline..."
                    className="mt-1 text-xs rounded-xl"
                  />
                </div>
              </div>

              {/* Multi-Document Upload (No artificial count limit) */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-800">
                    Upload Documents / Photos (No Limit)
                  </Label>
                  <span className="text-[11px] text-slate-400">Up to 10MB per file</span>
                </div>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-emerald-500 bg-slate-50/60 hover:bg-emerald-50/20 rounded-2xl p-6 text-center cursor-pointer transition-all group"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <div className="w-10 h-10 rounded-full bg-white shadow-2xs text-emerald-600 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  <div className="text-xs font-bold text-slate-800">
                    Click or Drag to Upload Files
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Attach electricity bills, roof photos, or sanction letters to expedite your quotation.
                  </p>
                </div>

                {/* Selected Files List */}
                {selectedFiles.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {selectedFiles.map((f, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-800 truncate block">
                              {f.name}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {(f.size / 1024).toFixed(1)} KB
                              {f.progress > 0 && f.progress < 100 && ` • Uploading: ${f.progress}%`}
                              {f.uploaded && " • Ready"}
                              {f.error && ` • Error: ${f.error}`}
                            </span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveFile(idx)}
                          className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCurrentStep(1)}
                  disabled={submitting}
                  className="h-12 px-5 text-xs text-slate-700 rounded-xl"
                >
                  <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-md flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Submitting Inquiry...
                    </>
                  ) : (
                    <>
                      Submit Solar Inquiry to {companyName} <Check className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}

        </Card>

        {/* ─── FOOTER TRUST NOTE ─────────────────────────────────────────────── */}
        <div className="text-center text-[11px] text-slate-400 py-4 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Your contact details and site data are submitted directly to {companyName}.</span>
        </div>

      </div>
    </div>
  );
}
