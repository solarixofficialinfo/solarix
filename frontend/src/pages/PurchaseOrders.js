import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError, fileUrl } from "../lib/api";
import PortalCombobox from "../components/PortalCombobox";
import { ProductAutocompleteInput, UNIT_OPTIONS } from "../components/Inventory/_shared";
import {
  FileText, Plus, Search, ArrowLeft, Download, Trash2, Pencil, Save,
  Truck, Building2, Package, Eye, UserPlus, Edit3, Check, X, ShieldAlert,
  CreditCard, Calendar, MapPin, Hash, DollarSign
} from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import dayjs from "dayjs";

const createEmptyPoItem = () => ({
  id: `po_item_${Math.random().toString(36).substr(2, 9)}`,
  product_id: "",
  product_name: "",
  description: "",
  hsn_sac: "",
  specification: "",
  size: "",
  quantity: "",
  unit: "Nos",
  unit_price: "",
  discount: "0",
  gst_rate: "18",
  taxable_amount: 0,
  cgst: 0,
  sgst: 0,
  igst: 0,
  amount: 0
});

const generateDefaultPoNumber = () => {
  return `PO${dayjs().format("YY")}-${dayjs().format("MMM").toUpperCase()}${Math.floor(100 + Math.random() * 900)}`;
};

export default function PurchaseOrders() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState("list"); // "list" | "form"
  const [searchTerm, setSearchTerm] = useState("");
  const [editingPoId, setEditingPoId] = useState(null);

  // View PO Detail Modal State
  const [viewModalPo, setViewModalPo] = useState(null);

  // New Vendor Modal State
  const [newVendorModalOpen, setNewVendorModalOpen] = useState(false);
  const [newVendorForm, setNewVendorForm] = useState({
    name: "",
    contact_person: "",
    address: "",
    gstin: "",
    phone: "",
    email: "",
    notes: ""
  });

  // Edit Vendor Modal State
  const [editVendorModalOpen, setEditVendorModalOpen] = useState(false);
  const [editVendorForm, setEditVendorForm] = useState({
    id: "",
    name: "",
    contact_person: "",
    address: "",
    gstin: "",
    phone: "",
    email: "",
    notes: ""
  });

  // Form State
  const [saveVendorMaster, setSaveVendorMaster] = useState(false);
  const [poForm, setPoForm] = useState({
    id: "",
    po_number: generateDefaultPoNumber(),
    po_date: dayjs().format("YYYY-MM-DD"),
    vendor_reference_number: "",
    vendor_reference_date: "",

    // Project reference
    project_id: "",
    project_number: "",
    sol_id: "",
    client_name: "",
    consumer_number: "",

    // Vendor details
    vendor_id: "",
    vendor_name: "",
    vendor_contact_person: "",
    vendor_address: "",
    vendor_phone: "",
    vendor_email: "",
    vendor_gstin: "",

    // Bill To
    billing_name: "",
    billing_address: "",
    billing_state: "",
    billing_pincode: "",
    billing_gstin: "",

    // Ship To
    ship_to_type: "company", // "company" | "project" | "custom"
    ship_to_name: "",
    site_address: "",
    site_city: "",
    site_district: "",
    site_state: "",
    site_pincode: "",

    // Shipping & Delivery
    ship_via: "FOR",
    shipping_method: "PAID",
    shipping_term: "DOOR DELIVERY",
    delivery_date: dayjs().add(14, "day").format("YYYY-MM-DD"),
    transporter_name: "",
    expected_dispatch_date: "",
    delivery_instructions: "",

    // Commercial & Payment
    quotation_number: "",
    quotation_date: "",
    payment_terms: "Due on Delivery",
    advance_percentage: "0",
    advance_amount: "0",
    balance_payment_terms: "",
    commercial_terms: "",

    // Items & Notes
    items: [createEmptyPoItem()],
    notes: "DELIVERY WILL BE F.O.R. ON-SITE\\nLOCATION OF SITE WILL BE PROVIDED AT THE TIME OF DISPATCH",

    // Taxes & Totals
    tax_type: "auto", // "auto" | "intra" | "inter" | "exempt"
    order_discount: "0",
    freight: "0",
    other_charges: "0",
    round_off: "0",
    status: "Created"
  });

  // ── Fetch Master Vendors ───────────────────────────────────────────────
  const { data: vendorsData, refetch: refetchVendors } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const res = await api.get("/vendors");
      return res.data?.vendors || (Array.isArray(res.data) ? res.data : []);
    }
  });
  const vendors = useMemo(() => {
    if (Array.isArray(vendorsData)) return vendorsData;
    if (vendorsData?.vendors && Array.isArray(vendorsData.vendors)) return vendorsData.vendors;
    return [];
  }, [vendorsData]);

  // ── Fetch Master Products ──────────────────────────────────────────────
  const { data: productsData } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const res = await api.get("/inventory/products");
      return res.data?.products || (Array.isArray(res.data) ? res.data : []);
    }
  });
  const products = useMemo(() => {
    if (Array.isArray(productsData)) return productsData;
    if (productsData?.products && Array.isArray(productsData.products)) return productsData.products;
    return [];
  }, [productsData]);

  // ── Fetch Projects / Clients ───────────────────────────────────────────
  const { data: clientsData } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await api.get("/clients");
      return res.data?.clients || (Array.isArray(res.data) ? res.data : []);
    }
  });
  const projects = useMemo(() => {
    if (Array.isArray(clientsData)) return clientsData;
    if (clientsData?.clients && Array.isArray(clientsData.clients)) return clientsData.clients;
    return [];
  }, [clientsData]);

  // ── Fetch Company Profile ──────────────────────────────────────────────
  const { data: companyRaw } = useQuery({
    queryKey: ["company"],
    queryFn: async () => {
      const res = await api.get("/company");
      return res.data || {};
    }
  });
  const company = companyRaw || {};

  // ── Fetch Purchase Orders List ─────────────────────────────────────────
  const { data: poResponse, refetch: refetchPoList, isLoading: loadingPo } = useQuery({
    queryKey: ["purchase_orders"],
    queryFn: async () => {
      const res = await api.get("/purchase-orders");
      return res.data?.purchase_orders || [];
    }
  });
  const poListData = useMemo(() => (Array.isArray(poResponse) ? poResponse : []), [poResponse]);

  // Options for Vendor PortalCombobox
  const vendorOptions = useMemo(() => {
    if (!Array.isArray(vendors)) return [];
    return vendors.map((v) => ({
      value: v.id || v.name,
      label: `${v.name}${v.gstin ? ` (${v.gstin})` : ""}${v.contact_person ? ` - ${v.contact_person}` : ""}`,
      raw: v
    }));
  }, [vendors]);

  // Options for Project PortalCombobox
  const projectOptions = useMemo(() => {
    if (!Array.isArray(projects)) return [];
    return projects.map((c) => ({
      value: c.id,
      label: `${c.sol_id ? `[${c.sol_id}] ` : ""}${c.full_name || c.name || "Client"}${c.city ? ` (${c.city})` : ""}`,
      raw: c
    }));
  }, [projects]);

  // Handle Vendor Selection
  const handleSelectVendor = (selectedVal) => {
    const matchedVendor = vendors.find((v) => v.id === selectedVal || v.name === selectedVal);
    if (matchedVendor) {
      setPoForm((prev) => ({
        ...prev,
        vendor_id: matchedVendor.id || "",
        vendor_name: matchedVendor.name || "",
        vendor_contact_person: matchedVendor.contact_person || prev.vendor_contact_person || "",
        vendor_address: matchedVendor.address || prev.vendor_address || "",
        vendor_phone: matchedVendor.phone || prev.vendor_phone || "",
        vendor_email: matchedVendor.email || prev.vendor_email || "",
        vendor_gstin: matchedVendor.gstin || prev.vendor_gstin || "",
        payment_terms: matchedVendor.payment_terms || prev.payment_terms || "Due on Delivery"
      }));
    } else {
      setPoForm((prev) => ({
        ...prev,
        vendor_id: "",
        vendor_name: selectedVal
      }));
    }
  };

  // Handle Project Selection
  const handleSelectProject = (selectedVal) => {
    if (!selectedVal) {
      setPoForm((prev) => ({
        ...prev,
        project_id: "",
        project_number: "",
        sol_id: "",
        client_name: "",
        consumer_number: ""
      }));
      return;
    }
    const matched = projects.find((c) => c.id === selectedVal || c.sol_id === selectedVal);
    if (matched) {
      const sol = matched.sol_id || "";
      const cName = matched.full_name || matched.name || "";
      const sAddr = matched.site_address || matched.address || "";
      setPoForm((prev) => {
        const isProjShip = prev.ship_to_type === "project";
        return {
          ...prev,
          project_id: matched.id,
          project_number: sol,
          sol_id: sol,
          client_name: cName,
          consumer_number: matched.consumer_number || "",
          ship_to_name: isProjShip ? `${cName} (Site)` : prev.ship_to_name,
          site_address: isProjShip ? sAddr : prev.site_address,
          site_city: isProjShip ? (matched.city || "") : prev.site_city,
          site_district: isProjShip ? (matched.district || "") : prev.site_district,
          site_state: isProjShip ? (matched.state || company.state || "Maharashtra") : prev.site_state,
          site_pincode: isProjShip ? (matched.pincode || "") : prev.site_pincode
        };
      });
    }
  };

  // Handle Ship To Mode Change
  const handleShipToModeChange = (mode) => {
    setPoForm((prev) => {
      if (mode === "company") {
        return {
          ...prev,
          ship_to_type: "company",
          ship_to_name: company.company_name || company.name || "GVP SOLAR ENERGY",
          site_address: company.address || "",
          site_city: company.city || "",
          site_district: company.district || "",
          site_state: company.state || "Maharashtra",
          site_pincode: company.pincode || ""
        };
      } else if (mode === "project") {
        const matched = projects.find((c) => c.id === prev.project_id);
        return {
          ...prev,
          ship_to_type: "project",
          ship_to_name: prev.client_name ? `${prev.client_name} (Site)` : "",
          site_address: matched?.site_address || matched?.address || "",
          site_city: matched?.city || "",
          site_district: matched?.district || "",
          site_state: matched?.state || company.state || "Maharashtra",
          site_pincode: matched?.pincode || ""
        };
      } else {
        return {
          ...prev,
          ship_to_type: "custom"
        };
      }
    });
  };

  // Create Vendor Mutation
  const createVendorMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post("/vendors", payload);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success("New vendor saved to Vendor Master!");
      refetchVendors();
      const newV = data?.vendor || data;
      if (newV) {
        setPoForm((prev) => ({
          ...prev,
          vendor_id: newV.id || "",
          vendor_name: newV.name || "",
          vendor_contact_person: newV.contact_person || "",
          vendor_address: newV.address || "",
          vendor_phone: newV.phone || "",
          vendor_email: newV.email || "",
          vendor_gstin: newV.gstin || ""
        }));
      }
      setNewVendorModalOpen(false);
      setNewVendorForm({ name: "", contact_person: "", address: "", gstin: "", phone: "", email: "", notes: "" });
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  // Edit Vendor Mutation
  const updateVendorMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.put(`/vendors/${payload.id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Vendor Master updated!");
      refetchVendors();
      setPoForm((prev) => ({
        ...prev,
        vendor_name: editVendorForm.name,
        vendor_contact_person: editVendorForm.contact_person,
        vendor_address: editVendorForm.address,
        vendor_phone: editVendorForm.phone,
        vendor_email: editVendorForm.email,
        vendor_gstin: editVendorForm.gstin
      }));
      setEditVendorModalOpen(false);
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  // Determine Effective Tax Type (Auto / Intra / Inter / Exempt)
  const effectiveTaxType = useMemo(() => {
    if (poForm.tax_type === "intra" || poForm.tax_type === "inter" || poForm.tax_type === "exempt") {
      return poForm.tax_type;
    }
    const vGst = (poForm.vendor_gstin || "").trim();
    const cGst = (company.gst_number || company.gstin || "").trim();
    const vStateCode = vGst.length >= 2 && !isNaN(vGst.substring(0, 2)) ? vGst.substring(0, 2) : "";
    const cStateCode = cGst.length >= 2 && !isNaN(cGst.substring(0, 2)) ? cGst.substring(0, 2) : "";

    if (vStateCode && cStateCode) {
      return vStateCode === cStateCode ? "intra" : "inter";
    }
    const cState = (company.state || "Maharashtra").toLowerCase();
    const vAddr = (poForm.vendor_address || "").toLowerCase();
    if (vAddr && cState && vAddr.includes(cState)) {
      return "intra";
    }
    return "intra";
  }, [poForm.tax_type, poForm.vendor_gstin, poForm.vendor_address, company.gst_number, company.gstin, company.state]);

  // Line Item Updates
  const updateItem = (idx, field, val) => {
    const newItems = [...poForm.items];
    const item = { ...newItems[idx], [field]: val };

    if (field === "product_name") {
      let pName = "";
      if (typeof val === "object" && val !== null) {
        pName = (val.name || "").toUpperCase();
        item.product_id = val.id || item.product_id || "";
        item.size = val.size || item.size || "";
        item.specification = val.size || item.specification || "";
        item.unit = val.unit || item.unit || "Nos";
        item.hsn_sac = val.hsn_sac || val.hsn || item.hsn_sac || "";
        if (val.selling_price || val.rate) {
          item.unit_price = String(val.selling_price || val.rate);
        }
        if (val.gst_rate || val.gst) {
          item.gst_rate = String(val.gst_rate || val.gst);
        }
      } else {
        pName = String(val || "").toUpperCase();
        const matched = products.find((p) => (p.name || "").toUpperCase() === pName);
        if (matched) {
          item.product_id = matched.id || item.product_id || "";
          item.size = matched.size || item.size || "";
          item.specification = matched.size || item.specification || "";
          item.unit = matched.unit || item.unit || "Nos";
          item.hsn_sac = matched.hsn_sac || matched.hsn || item.hsn_sac || "";
          if (matched.selling_price || matched.rate) {
            item.unit_price = String(matched.selling_price || matched.rate);
          }
          if (matched.gst_rate || matched.gst) {
            item.gst_rate = String(matched.gst_rate || matched.gst);
          }
        }
      }
      item.product_name = pName;
    }

    const q = Number(item.quantity || 0);
    const r = Number(item.unit_price || 0);
    const d = Number(item.discount || 0);
    const taxable = Math.max(0, (q * r) - d);
    const gstRate = Number(item.gst_rate || 0);

    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (effectiveTaxType === "exempt" || gstRate === 0) {
      cgst = 0;
      sgst = 0;
      igst = 0;
    } else if (effectiveTaxType === "inter") {
      igst = Math.round(taxable * (gstRate / 100) * 100) / 100;
    } else {
      cgst = Math.round(taxable * (gstRate / 200) * 100) / 100;
      sgst = Math.round(taxable * (gstRate / 200) * 100) / 100;
    }

    item.taxable_amount = taxable;
    item.cgst = cgst;
    item.sgst = sgst;
    item.igst = igst;
    item.amount = Math.round((taxable + cgst + sgst + igst) * 100) / 100;

    newItems[idx] = item;
    setPoForm((prev) => ({ ...prev, items: newItems }));
  };

  const addItem = () => {
    setPoForm((prev) => ({ ...prev, items: [...prev.items, createEmptyPoItem()] }));
  };

  const removeItem = (idx) => {
    if (poForm.items.length === 1) {
      toast.error("Purchase Order must contain at least one line item");
      return;
    }
    setPoForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));
  };

  // Calculations Summary
  const subtotal = useMemo(() => {
    return poForm.items.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.unit_price || 0)), 0);
  }, [poForm.items]);

  const itemDiscounts = useMemo(() => {
    return poForm.items.reduce((sum, item) => sum + Number(item.discount || 0), 0);
  }, [poForm.items]);

  const totalDiscount = useMemo(() => {
    return itemDiscounts + Number(poForm.order_discount || 0);
  }, [itemDiscounts, poForm.order_discount]);

  const taxableAmount = useMemo(() => {
    return Math.max(0, subtotal - totalDiscount);
  }, [subtotal, totalDiscount]);

  const cgstAmount = useMemo(() => {
    return poForm.items.reduce((sum, item) => sum + Number(item.cgst || 0), 0);
  }, [poForm.items]);

  const sgstAmount = useMemo(() => {
    return poForm.items.reduce((sum, item) => sum + Number(item.sgst || 0), 0);
  }, [poForm.items]);

  const igstAmount = useMemo(() => {
    return poForm.items.reduce((sum, item) => sum + Number(item.igst || 0), 0);
  }, [poForm.items]);

  const freightVal = useMemo(() => Number(poForm.freight || 0), [poForm.freight]);
  const otherChargesVal = useMemo(() => Number(poForm.other_charges || 0), [poForm.other_charges]);

  const calculatedTotalBeforeRound = useMemo(() => {
    return taxableAmount + cgstAmount + sgstAmount + igstAmount + freightVal + otherChargesVal;
  }, [taxableAmount, cgstAmount, sgstAmount, igstAmount, freightVal, otherChargesVal]);

  const roundOffVal = useMemo(() => {
    return Math.round(calculatedTotalBeforeRound) - calculatedTotalBeforeRound;
  }, [calculatedTotalBeforeRound]);

  const grandTotal = useMemo(() => {
    return Math.round(calculatedTotalBeforeRound);
  }, [calculatedTotalBeforeRound]);

  // Save Purchase Order Mutation
  const savePoMutation = useMutation({
    mutationFn: async (targetStatus = null) => {
      if (!poForm.vendor_name?.trim()) {
        throw new Error("Vendor name is required");
      }
      if (!poForm.po_number?.trim()) {
        throw new Error("PO number is required");
      }
      const validItems = poForm.items.filter((i) => i.product_name?.trim());
      if (validItems.length === 0) {
        throw new Error("At least one product item with a valid name is required");
      }

      const statusToSave = targetStatus || poForm.status || "Created";

      const payload = {
        ...poForm,
        status: statusToSave,
        save_vendor_master: saveVendorMaster,
        tax_type: effectiveTaxType,
        subtotal,
        discount: totalDiscount,
        taxable_amount: taxableAmount,
        cgst_amount: cgstAmount,
        sgst_amount: sgstAmount,
        igst_amount: igstAmount,
        freight: freightVal,
        other_charges: otherChargesVal,
        round_off: roundOffVal,
        grand_total: grandTotal,
        items: validItems
      };
      const res = await api.post("/purchase-orders", payload);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success("Purchase Order saved successfully!");
      refetchPoList();
      refetchVendors();
      setViewMode("list");
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  // Generate PO Document Mutation (PDF / DOCX)
  const generatePoMutation = useMutation({
    mutationFn: async (format = "pdf") => {
      if (!poForm.vendor_name?.trim()) {
        throw new Error("Vendor name is required");
      }
      const validItems = poForm.items.filter((i) => i.product_name?.trim());
      if (validItems.length === 0) {
        throw new Error("At least one item is required");
      }

      const payload = {
        doc_type: "purchase_order",
        format: format,
        doc_data: {
          ...poForm,
          tax_type: effectiveTaxType,
          subtotal,
          discount: totalDiscount,
          taxable_amount: taxableAmount,
          cgst_amount: cgstAmount,
          sgst_amount: sgstAmount,
          igst_amount: igstAmount,
          freight: freightVal,
          other_charges: otherChargesVal,
          round_off: roundOffVal,
          grand_total: grandTotal,
          items: validItems
        }
      };
      const res = await api.post("/documents/generate", payload);
      return { data: res.data, format };
    },
    onSuccess: ({ data, format }) => {
      const isDocx = format === "docx";
      const fmtLabel = isDocx ? "Word document" : "PDF";
      toast.success(`Purchase Order ${fmtLabel} generated!`);
      const fileId = data?.id || data?.file_id;
      const filename = data?.filename || (isDocx ? "PurchaseOrder.docx" : "PurchaseOrder.pdf");
      if (fileId) {
        if (isDocx) {
          const a = document.createElement("a");
          a.href = `${fileUrl(fileId)}&download=1`;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } else {
          const win = window.open(fileUrl(fileId), "_blank");
          if (!win || win.closed || typeof win.closed === "undefined") {
            const a = document.createElement("a");
            a.href = fileUrl(fileId);
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
        }
      } else {
        toast.error("Failed to retrieve document file ID");
      }
      refetchPoList();
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  // Direct PDF Generation helper for saved POs
  const generatePdfForPo = async (po) => {
    try {
      toast.info("Generating Purchase Order PDF...");
      const payload = {
        doc_type: "purchase_order",
        format: "pdf",
        doc_data: po
      };
      const res = await api.post("/documents/generate", payload);
      const fileId = res.data?.id || res.data?.file_id;
      if (fileId) {
        toast.success("Purchase Order PDF generated!");
        const win = window.open(fileUrl(fileId), "_blank");
        if (!win || win.closed || typeof win.closed === "undefined") {
          const a = document.createElement("a");
          a.href = fileUrl(fileId);
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } else {
        toast.error("Failed to retrieve generated PDF ID");
      }
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  // Direct Word (.docx) Generation helper for saved POs
  const generateWordForPo = async (po) => {
    try {
      toast.info("Generating Purchase Order Word document...");
      const payload = {
        doc_type: "purchase_order",
        format: "docx",
        doc_data: po
      };
      const res = await api.post("/documents/generate", payload);
      const fileId = res.data?.id || res.data?.file_id;
      if (fileId) {
        toast.success("Purchase Order Word document generated!");
        const a = document.createElement("a");
        a.href = `${fileUrl(fileId)}&download=1`;
        a.download = res.data?.filename || "PurchaseOrder.docx";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        toast.error("Failed to retrieve generated Word document ID");
      }
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  // Filter Purchase Orders
  const filteredPos = useMemo(() => {
    if (!searchTerm) return poListData;
    const s = searchTerm.toLowerCase();
    return poListData.filter((po) =>
      (po.po_number || "").toLowerCase().includes(s) ||
      (po.vendor_name || "").toLowerCase().includes(s) ||
      (po.sol_id || po.project_number || "").toLowerCase().includes(s) ||
      (po.client_name || "").toLowerCase().includes(s) ||
      (po.items || []).some((i) => (i.product_name || i.product || "").toLowerCase().includes(s))
    );
  }, [poListData, searchTerm]);

  const startCreatePo = () => {
    setPoForm({
      id: "",
      po_number: generateDefaultPoNumber(),
      po_date: dayjs().format("YYYY-MM-DD"),
      vendor_reference_number: "",
      vendor_reference_date: "",

      // Project reference
      project_id: "",
      project_number: "",
      sol_id: "",
      client_name: "",
      consumer_number: "",

      // Vendor details
      vendor_id: "",
      vendor_name: "",
      vendor_contact_person: "",
      vendor_address: "",
      vendor_phone: "",
      vendor_email: "",
      vendor_gstin: "",

      // Bill To
      billing_name: company.company_name || company.name || "GVP SOLAR ENERGY",
      billing_address: company.address || "",
      billing_state: company.state || "Maharashtra",
      billing_pincode: company.pincode || "",
      billing_gstin: company.gst_number || company.gstin || "",

      // Ship To
      ship_to_type: "company",
      ship_to_name: company.company_name || company.name || "GVP SOLAR ENERGY",
      site_address: company.address || "",
      site_city: company.city || "",
      site_district: company.district || "",
      site_state: company.state || "Maharashtra",
      site_pincode: company.pincode || "",

      // Shipping & Delivery
      ship_via: "FOR",
      shipping_method: "PAID",
      shipping_term: "DOOR DELIVERY",
      delivery_date: dayjs().add(14, "day").format("YYYY-MM-DD"),
      transporter_name: "",
      expected_dispatch_date: "",
      delivery_instructions: "",

      // Commercial & Payment
      quotation_number: "",
      quotation_date: "",
      payment_terms: "Due on Delivery",
      advance_percentage: "0",
      advance_amount: "0",
      balance_payment_terms: "",
      commercial_terms: "",

      // Items & Notes
      items: [createEmptyPoItem()],
      notes: "DELIVERY WILL BE F.O.R. ON-SITE\\nLOCATION OF SITE WILL BE PROVIDED AT THE TIME OF DISPATCH",

      // Taxes & Charges
      tax_type: "auto",
      order_discount: "0",
      freight: "0",
      other_charges: "0",
      round_off: "0",
      status: "Created"
    });
    setSaveVendorMaster(false);
    setEditingPoId(null);
    setViewMode("form");
  };

  const startEditPo = (po) => {
    setEditingPoId(po.id);
    const pItems = Array.isArray(po.items) && po.items.length > 0
      ? po.items.map((i) => ({
          id: i.id || `po_item_${Math.random().toString(36).substr(2, 9)}`,
          product_id: i.product_id || "",
          product_name: i.product_name || i.product || "",
          description: i.description || "",
          hsn_sac: i.hsn_sac || i.hsn || "",
          specification: i.specification || i.spec || i.size || "",
          size: i.size || i.specification || "",
          quantity: String(i.quantity ?? ""),
          unit: i.unit || "Nos",
          unit_price: String(i.unit_price ?? i.rate ?? ""),
          discount: String(i.discount ?? "0"),
          gst_rate: String(i.gst_rate ?? (po.cgst_rate ? Number(po.cgst_rate) * 2 : 18)),
          taxable_amount: Number(i.taxable_amount || 0),
          cgst: Number(i.cgst || 0),
          sgst: Number(i.sgst || 0),
          igst: Number(i.igst || 0),
          amount: Number(i.amount || 0)
        }))
      : [createEmptyPoItem()];

    setPoForm({
      id: po.id || "",
      po_number: po.po_number || generateDefaultPoNumber(),
      po_date: po.po_date || dayjs().format("YYYY-MM-DD"),
      vendor_reference_number: po.vendor_reference_number || "",
      vendor_reference_date: po.vendor_reference_date || "",

      // Project reference
      project_id: po.project_id || po.client_id || "",
      project_number: po.project_number || po.sol_id || "",
      sol_id: po.sol_id || po.project_number || "",
      client_name: po.client_name || "",
      consumer_number: po.consumer_number || "",

      // Vendor details
      vendor_id: po.vendor_id || "",
      vendor_name: po.vendor_name || "",
      vendor_contact_person: po.vendor_contact_person || "",
      vendor_address: po.vendor_address || "",
      vendor_phone: po.vendor_phone || "",
      vendor_email: po.vendor_email || "",
      vendor_gstin: po.vendor_gstin || "",

      // Bill To
      billing_name: po.billing_name || company.company_name || company.name || "GVP SOLAR ENERGY",
      billing_address: po.billing_address || company.address || "",
      billing_state: po.billing_state || company.state || "Maharashtra",
      billing_pincode: po.billing_pincode || company.pincode || "",
      billing_gstin: po.billing_gstin || company.gst_number || company.gstin || "",

      // Ship To
      ship_to_type: po.ship_to_type || (po.project_id ? "project" : "company"),
      ship_to_name: po.ship_to_name || (po.client_name ? `${po.client_name} (Site)` : (company.company_name || "GVP SOLAR ENERGY")),
      site_address: po.site_address || "",
      site_city: po.site_city || "",
      site_district: po.site_district || "",
      site_state: po.site_state || company.state || "Maharashtra",
      site_pincode: po.site_pincode || "",

      // Shipping & Delivery
      ship_via: po.ship_via || "FOR",
      shipping_method: po.shipping_method || "PAID",
      shipping_term: po.shipping_term || "DOOR DELIVERY",
      delivery_date: po.delivery_date || dayjs().add(14, "day").format("YYYY-MM-DD"),
      transporter_name: po.transporter_name || "",
      expected_dispatch_date: po.expected_dispatch_date || "",
      delivery_instructions: po.delivery_instructions || "",

      // Commercial & Payment
      quotation_number: po.quotation_number || "",
      quotation_date: po.quotation_date || "",
      payment_terms: po.payment_terms || "Due on Delivery",
      advance_percentage: String(po.advance_percentage ?? "0"),
      advance_amount: String(po.advance_amount ?? "0"),
      balance_payment_terms: po.balance_payment_terms || "",
      commercial_terms: po.commercial_terms || "",

      // Items & Notes
      items: pItems,
      notes: po.notes || "DELIVERY WILL BE F.O.R. ON-SITE\\nLOCATION OF SITE WILL BE PROVIDED AT THE TIME OF DISPATCH",

      // Taxes & Charges
      tax_type: po.tax_type || "auto",
      order_discount: String(po.discount ? Math.max(0, Number(po.discount) - pItems.reduce((acc, it) => acc + Number(it.discount || 0), 0)) : "0"),
      freight: String(po.freight ?? "0"),
      other_charges: String(po.other_charges ?? "0"),
      round_off: String(po.round_off ?? "0"),
      status: po.status || "Created"
    });
    setSaveVendorMaster(false);
    setViewMode("form");
  };

  const handleDeletePo = async (poId) => {
    if (!window.confirm("Are you sure you want to delete this Purchase Order?")) return;
    try {
      await api.delete(`/purchase-orders/${poId}`);
      toast.success("Purchase Order deleted successfully");
      refetchPoList();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const getStatusBadgeVariant = (st) => {
    switch ((st || "").toLowerCase()) {
      case "approved":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "issued":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "draft":
        return "bg-slate-100 text-slate-700 border-slate-300";
      case "cancelled":
        return "bg-rose-50 text-rose-700 border-rose-200";
      case "closed":
        return "bg-purple-50 text-purple-700 border-purple-200";
      default:
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW MODE 1: PURCHASE ORDERS LIST & SEARCH
  // ──────────────────────────────────────────────────────────────────────────
  if (viewMode === "list") {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
              <FileText className="w-7 h-7 text-indigo-600" /> Purchase Orders
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Create, view, and manage supplier Purchase Orders (POs) for Solarix solar procurement.
            </p>
          </div>

          <Button
            onClick={startCreatePo}
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-1.5 shadow-sm h-9"
          >
            <Plus className="w-4 h-4" /> + New Purchase Order
          </Button>
        </div>

        {/* Search & Stats Bar */}
        <Card className="border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-96">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <Input
                placeholder="Search PO number, vendor, project/SOL ID, product..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-xs h-9 bg-white"
              />
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-600 font-semibold">
              <span>Total POs: <strong>{filteredPos.length}</strong></span>
              <span>•</span>
              <span>Total Value: <strong>₹{filteredPos.reduce((acc, po) => acc + Number(po.grand_total || po.subtotal || 0), 0).toLocaleString("en-IN")}</strong></span>
            </div>
          </CardContent>
        </Card>

        {/* Purchase Orders Table */}
        <Card className="border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-0">
            {loadingPo ? (
              <div className="p-8 text-center text-xs text-slate-400 italic">Loading purchase orders...</div>
            ) : filteredPos.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No Purchase Orders found. Click <strong>"+ New Purchase Order"</strong> to create one.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                    <tr>
                      <th className="p-3 font-mono">PO No.</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Project / SOL ID</th>
                      <th className="p-3">Vendor</th>
                      <th className="p-3">Line Items</th>
                      <th className="p-3 text-right font-mono">Total (₹)</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {filteredPos.map((po) => (
                      <tr key={po.id} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-indigo-600">{po.po_number || po.id}</td>
                        <td className="p-3 font-sans text-slate-700">{po.po_date || "—"}</td>
                        <td className="p-3 font-sans">
                          {po.sol_id || po.project_number ? (
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px] border border-emerald-200">
                              {po.sol_id || po.project_number}
                              {po.client_name && <span className="font-normal text-slate-600">({po.client_name})</span>}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </td>
                        <td className="p-3 font-sans">
                          <div className="font-bold text-slate-900">{po.vendor_name || "—"}</div>
                          {po.vendor_contact_person && (
                            <div className="text-[10px] text-slate-500">{po.vendor_contact_person}</div>
                          )}
                        </td>
                        <td className="p-3 font-sans text-slate-600 max-w-[200px] truncate">
                          {(po.items || []).map((i) => i.product_name || i.product).join(", ") || "Solar Material"}
                        </td>
                        <td className="p-3 text-right font-bold text-slate-900">
                          ₹{Number(po.grand_total || po.subtotal || 0).toLocaleString("en-IN")}
                        </td>
                        <td className="p-3 text-center font-sans">
                          <Badge variant="outline" className={`text-[10px] ${getStatusBadgeVariant(po.status)}`}>
                            {po.status || "Created"}
                          </Badge>
                        </td>
                        <td className="p-3 text-center font-sans">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => setViewModalPo(po)}
                              className="text-[11px] text-slate-600 hover:text-indigo-700 h-7 w-7 p-0"
                              title="View Details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => startEditPo(po)}
                              className="text-[11px] border-slate-200 text-blue-600 hover:bg-blue-50 h-7 gap-1 px-2"
                              title="Edit PO"
                            >
                              <Pencil className="w-3 h-3" /> Edit
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => generatePdfForPo(po)}
                              className="text-[11px] border-indigo-200 text-indigo-700 hover:bg-indigo-50 h-7 gap-1 px-2"
                              title="Download PDF"
                            >
                              <Download className="w-3 h-3 text-indigo-600" /> PDF
                            </Button>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => generateWordForPo(po)}
                              className="text-[11px] border-blue-200 text-blue-700 hover:bg-blue-50 h-7 gap-1 px-2"
                              title="Download Word (.docx)"
                            >
                              <FileText className="w-3 h-3 text-blue-600" /> Word
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => handleDeletePo(po.id)}
                              className="text-[11px] text-slate-400 hover:text-rose-600 h-7 w-7 p-0"
                              title="Delete PO"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* PO Details Modal */}
        {viewModalPo && (
          <Dialog open={!!viewModalPo} onOpenChange={() => setViewModalPo(null)}>
            <DialogContent className="max-w-3xl rounded-xl p-6 font-sans max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-indigo-600" /> Purchase Order: {viewModalPo.po_number || viewModalPo.id}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                      Date: {viewModalPo.po_date} • Status: <span className="font-semibold text-indigo-700">{viewModalPo.status || "Created"}</span>
                    </DialogDescription>
                  </div>
                  <Badge variant="outline" className={`text-xs ${getStatusBadgeVariant(viewModalPo.status)}`}>
                    {viewModalPo.status || "Created"}
                  </Badge>
                </div>
              </DialogHeader>

              <div className="py-3 space-y-4 text-xs">
                {/* Project / SOL ID Block */}
                {(viewModalPo.sol_id || viewModalPo.project_number || viewModalPo.client_name) && (
                  <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-lg flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-indigo-900 uppercase tracking-wider text-[11px]">Linked Project:</span>{" "}
                      <span className="font-mono font-bold text-indigo-700">{viewModalPo.sol_id || viewModalPo.project_number}</span>{" "}
                      {viewModalPo.client_name && <span className="text-slate-700">({viewModalPo.client_name})</span>}
                    </div>
                    {viewModalPo.consumer_number && (
                      <div className="text-slate-600">Consumer No: <strong>{viewModalPo.consumer_number}</strong></div>
                    )}
                  </div>
                )}

                {/* Parties Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                    <div className="font-bold text-slate-900 uppercase text-[11px] text-indigo-900">Vendor Details</div>
                    <div className="font-semibold text-slate-800">{viewModalPo.vendor_name || "—"}</div>
                    {viewModalPo.vendor_contact_person && <div>Contact: {viewModalPo.vendor_contact_person}</div>}
                    {viewModalPo.vendor_gstin && <div>GSTIN: {viewModalPo.vendor_gstin}</div>}
                    {viewModalPo.vendor_phone && <div>Phone: {viewModalPo.vendor_phone}</div>}
                    {viewModalPo.vendor_email && <div>Email: {viewModalPo.vendor_email}</div>}
                    {viewModalPo.vendor_address && <div className="text-slate-600">{viewModalPo.vendor_address}</div>}
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                    <div className="font-bold text-slate-900 uppercase text-[11px] text-indigo-900">Ship To / Site Details</div>
                    <div className="font-semibold text-slate-800">{viewModalPo.ship_to_name || company.company_name || "GVP SOLAR ENERGY"}</div>
                    {viewModalPo.site_address && <div className="text-slate-600">{viewModalPo.site_address}</div>}
                    <div className="text-slate-600">
                      {[viewModalPo.site_city, viewModalPo.site_district, viewModalPo.site_state, viewModalPo.site_pincode].filter(Boolean).join(", ")}
                    </div>
                    <div className="pt-1 text-[11px] text-slate-500">
                      Via: <strong>{viewModalPo.ship_via || "FOR"}</strong> | Term: <strong>{viewModalPo.shipping_term || "DOOR DELIVERY"}</strong> | Delivery: <strong>{viewModalPo.delivery_date || "—"}</strong>
                    </div>
                  </div>
                </div>

                {/* Items Table */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-900 text-white font-semibold">
                      <tr>
                        <th className="p-2 w-8 text-center">#</th>
                        <th className="p-2">Product Description</th>
                        <th className="p-2 text-center">HSN/SAC</th>
                        <th className="p-2 text-center">Qty</th>
                        <th className="p-2 text-right">Rate (₹)</th>
                        <th className="p-2 text-center">GST %</th>
                        <th className="p-2 text-right">Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {(viewModalPo.items || []).map((it, i) => (
                        <tr key={it.id || i} className="hover:bg-slate-50">
                          <td className="p-2 text-center text-slate-400">{i + 1}</td>
                          <td className="p-2 font-sans font-medium text-slate-900">
                            {it.product_name || it.product}
                            {it.specification && <span className="text-slate-500 text-[10px] block">{it.specification}</span>}
                          </td>
                          <td className="p-2 text-center text-slate-600">{it.hsn_sac || "—"}</td>
                          <td className="p-2 text-center font-bold">{it.quantity} {it.unit}</td>
                          <td className="p-2 text-right">₹{Number(it.unit_price || it.rate || 0).toLocaleString("en-IN")}</td>
                          <td className="p-2 text-center">{it.gst_rate || 18}%</td>
                          <td className="p-2 text-right font-bold">₹{Number(it.amount || 0).toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals & Notes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    {viewModalPo.notes && (
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="font-bold text-slate-900 text-[10px] uppercase">Notes & Instructions:</div>
                        <div className="text-slate-600 whitespace-pre-line mt-1">{viewModalPo.notes}</div>
                      </div>
                    )}
                    {viewModalPo.payment_terms && (
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="font-bold text-slate-900 text-[10px] uppercase">Commercial & Payment Terms:</div>
                        <div className="text-slate-700 mt-1">Payment: <strong>{viewModalPo.payment_terms}</strong></div>
                        {viewModalPo.quotation_number && <div>Quotation Ref: <strong>{viewModalPo.quotation_number}</strong></div>}
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 font-mono space-y-1.5">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal:</span>
                      <span className="font-bold text-slate-900">₹{Number(viewModalPo.subtotal || 0).toLocaleString("en-IN")}</span>
                    </div>
                    {Number(viewModalPo.discount || 0) > 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>Discount:</span>
                        <span>-₹{Number(viewModalPo.discount).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {Number(viewModalPo.taxable_amount || 0) > 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>Taxable Amount:</span>
                        <span>₹{Number(viewModalPo.taxable_amount).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {(Number(viewModalPo.cgst_amount || 0) > 0 || Number(viewModalPo.cgst_rate || 0) > 0) && (
                      <div className="flex justify-between text-slate-600">
                        <span>CGST:</span>
                        <span>₹{Number(viewModalPo.cgst_amount || 0).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {(Number(viewModalPo.sgst_amount || 0) > 0 || Number(viewModalPo.sgst_rate || 0) > 0) && (
                      <div className="flex justify-between text-slate-600">
                        <span>SGST:</span>
                        <span>₹{Number(viewModalPo.sgst_amount || 0).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {(Number(viewModalPo.igst_amount || 0) > 0 || Number(viewModalPo.igst_rate || 0) > 0) && (
                      <div className="flex justify-between text-slate-600">
                        <span>IGST:</span>
                        <span>₹{Number(viewModalPo.igst_amount || 0).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {Number(viewModalPo.freight || 0) > 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>Freight / S&H:</span>
                        <span>₹{Number(viewModalPo.freight).toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                      <span>Grand Total:</span>
                      <span className="text-indigo-700 text-base">₹{Number(viewModalPo.grand_total || viewModalPo.subtotal || 0).toLocaleString("en-IN")}</span>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 pt-2 border-t border-slate-100">
                <Button variant="outline" size="sm" onClick={() => setViewModalPo(null)}>Close</Button>
                <Button
                  size="sm"
                  onClick={() => generateWordForPo(viewModalPo)}
                  className="bg-blue-600 hover:bg-blue-700 text-white gap-1"
                >
                  <FileText className="w-4 h-4" /> Download Word
                </Button>
                <Button
                  size="sm"
                  onClick={() => generatePdfForPo(viewModalPo)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1"
                >
                  <Download className="w-4 h-4" /> Download PDF
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VIEW MODE 2: NEW / EDIT PURCHASE ORDER FORM (10-SECTION UPGRADED STRUCTURE)
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto pb-16 font-sans">
      {/* Back Button & Top Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setViewMode("list")}
          className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-bold"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Purchase Orders
        </button>
        <div className="flex items-center gap-2">
          <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-xs font-semibold">
            {editingPoId ? "EDIT PURCHASE ORDER" : "NEW PURCHASE ORDER"}
          </Badge>
          <Badge variant="outline" className={`text-xs ${getStatusBadgeVariant(poForm.status)}`}>
            Status: {poForm.status || "Created"}
          </Badge>
        </div>
      </div>

      {/* Main PO Document Container */}
      <Card className="border-slate-300 shadow-md bg-white rounded-2xl overflow-hidden">
        {/* Header Title Bar */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {(company?.logo_file_id || company?.logo_url) && fileUrl(company?.logo_file_id || company?.logo_url) ? (
              <img
                src={fileUrl(company?.logo_file_id || company?.logo_url)}
                alt="Logo"
                className="h-14 max-w-[160px] object-contain"
                onError={(e) => { e.target.style.display = "none"; }}
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center text-sm">
                {(company?.company_name || company?.name || "GVP").slice(0, 3).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="font-bold text-base tracking-tight text-white" style={{ fontFamily: "Outfit" }}>
                {company?.company_name || company?.name || "GVP SOLAR ENERGY"}
              </h2>
              <div className="text-[10px] text-slate-300 font-mono">
                GSTIN: {company?.gst_number || company?.gstin || "27AKMPD5407A1ZM"}
              </div>
            </div>
          </div>

          <div className="text-right font-mono">
            <h3 className="text-lg font-bold text-indigo-300 uppercase">PURCHASE ORDER</h3>
            <div className="text-xs text-slate-300">Date: {poForm.po_date}</div>
          </div>
        </div>

        <CardContent className="p-6 space-y-6 text-xs">
          {/* SECTION 1 & 2: PO INFORMATION & PROJECT REFERENCE */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            {/* PO Info */}
            <div className="lg:col-span-6 space-y-3">
              <div className="text-xs font-bold text-slate-900 uppercase flex items-center gap-1.5 text-indigo-900">
                <Hash className="w-4 h-4 text-indigo-600" /> 1. PO Information
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] font-semibold">PO Number *</Label>
                  <Input
                    value={poForm.po_number}
                    onChange={(e) => setPoForm({ ...poForm, po_number: e.target.value })}
                    className="h-8 text-xs bg-white font-mono font-bold text-indigo-700 mt-1"
                    required
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold">PO Date *</Label>
                  <Input
                    type="date"
                    value={poForm.po_date}
                    onChange={(e) => setPoForm({ ...poForm, po_date: e.target.value })}
                    className="h-8 text-xs bg-white font-mono mt-1"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">Vendor Quotation / Ref #</Label>
                  <Input
                    value={poForm.vendor_reference_number}
                    onChange={(e) => setPoForm({ ...poForm, vendor_reference_number: e.target.value })}
                    placeholder="e.g. QT-2026-99"
                    className="h-8 text-xs bg-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">Vendor Ref Date</Label>
                  <Input
                    type="date"
                    value={poForm.vendor_reference_date}
                    onChange={(e) => setPoForm({ ...poForm, vendor_reference_date: e.target.value })}
                    className="h-8 text-xs bg-white font-mono mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Project Reference */}
            <div className="lg:col-span-6 space-y-3 lg:border-l lg:border-slate-200 lg:pl-4">
              <div className="text-xs font-bold text-slate-900 uppercase flex items-center justify-between text-indigo-900">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-emerald-600" /> 2. Project Reference (Optional)
                </span>
                {poForm.project_id && (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => handleSelectProject(null)}
                    className="h-5 text-[10px] text-rose-600 hover:bg-rose-50"
                  >
                    Clear Project
                  </Button>
                )}
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Link to Solarix Installation Project</Label>
                <PortalCombobox
                  value={poForm.project_id}
                  onChange={handleSelectProject}
                  options={projectOptions}
                  placeholder="Search project SOL ID or client name..."
                  searchPlaceholder="Search SOL ID or client..."
                  className="w-full mt-1 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <Label className="text-[10px] font-semibold text-slate-500">SOL / Project ID</Label>
                  <Input
                    value={poForm.sol_id || poForm.project_number}
                    onChange={(e) => setPoForm({ ...poForm, sol_id: e.target.value, project_number: e.target.value })}
                    placeholder="e.g. SOL-2026-0001"
                    className="h-8 text-xs bg-white font-mono font-bold text-emerald-700 mt-0.5"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-semibold text-slate-500">Client / Site Name</Label>
                  <Input
                    value={poForm.client_name}
                    onChange={(e) => setPoForm({ ...poForm, client_name: e.target.value })}
                    placeholder="e.g. Shubham Jadhav"
                    className="h-8 text-xs bg-white font-semibold mt-0.5"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3 & 4: VENDOR DETAILS & BILL TO */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Vendor Details */}
            <div className="lg:col-span-6 space-y-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 text-indigo-900">
                  <Truck className="w-4 h-4 text-indigo-600" /> 3. Vendor Details *
                </Label>
                <div className="flex items-center gap-1.5">
                  {poForm.vendor_id && (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        const v = vendors.find((x) => x.id === poForm.vendor_id);
                        setEditVendorForm({
                          id: poForm.vendor_id,
                          name: poForm.vendor_name || v?.name || "",
                          contact_person: poForm.vendor_contact_person || v?.contact_person || "",
                          address: poForm.vendor_address || v?.address || "",
                          gstin: poForm.vendor_gstin || v?.gstin || "",
                          phone: poForm.vendor_phone || v?.phone || "",
                          email: poForm.vendor_email || v?.email || "",
                          notes: v?.notes || ""
                        });
                        setEditVendorModalOpen(true);
                      }}
                      className="h-6 text-[11px] text-blue-600 hover:bg-blue-50 gap-1 px-1.5"
                    >
                      <Edit3 className="w-3 h-3" /> Edit
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => setNewVendorModalOpen(true)}
                    className="h-6 text-[11px] border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-1 px-2"
                  >
                    <UserPlus className="w-3 h-3" /> + New Vendor
                  </Button>
                </div>
              </div>

              {/* Vendor Search Dropdown */}
              <div>
                <Label className="text-[11px] font-semibold text-slate-600">Select From Vendor Directory</Label>
                <PortalCombobox
                  value={poForm.vendor_id || poForm.vendor_name}
                  onChange={handleSelectVendor}
                  options={vendorOptions}
                  placeholder="Search saved vendor name, GSTIN, person..."
                  searchPlaceholder="Search vendor name, GSTIN..."
                  className="w-full mt-1 text-xs"
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                <div>
                  <Label className="text-[10px] font-semibold text-slate-600">Vendor Company Name *</Label>
                  <Input
                    value={poForm.vendor_name}
                    onChange={(e) => setPoForm({ ...poForm, vendor_name: e.target.value })}
                    placeholder="Vendor company name"
                    className="h-8 text-xs bg-white font-semibold"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] font-semibold text-slate-600">Contact Person</Label>
                    <Input
                      value={poForm.vendor_contact_person}
                      onChange={(e) => setPoForm({ ...poForm, vendor_contact_person: e.target.value })}
                      placeholder="Contact person"
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] font-semibold text-slate-600">Vendor GSTIN</Label>
                    <Input
                      value={poForm.vendor_gstin}
                      onChange={(e) => setPoForm({ ...poForm, vendor_gstin: e.target.value })}
                      placeholder="GSTIN"
                      className="h-8 text-xs bg-white font-mono uppercase"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[10px] font-semibold text-slate-600">Vendor Address</Label>
                  <Input
                    value={poForm.vendor_address}
                    onChange={(e) => setPoForm({ ...poForm, vendor_address: e.target.value })}
                    placeholder="Street, City, State, PIN"
                    className="h-8 text-xs bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] font-semibold text-slate-600">Phone</Label>
                    <Input
                      value={poForm.vendor_phone}
                      onChange={(e) => setPoForm({ ...poForm, vendor_phone: e.target.value })}
                      placeholder="Contact phone"
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] font-semibold text-slate-600">Email</Label>
                    <Input
                      type="email"
                      value={poForm.vendor_email}
                      onChange={(e) => setPoForm({ ...poForm, vendor_email: e.target.value })}
                      placeholder="vendor@company.com"
                      className="h-8 text-xs bg-white"
                    />
                  </div>
                </div>

                {/* Save to Vendor Master Checkbox */}
                <div className="pt-2 flex items-center gap-2 font-sans text-xs">
                  <input
                    type="checkbox"
                    id="save_vendor_master_check"
                    checked={saveVendorMaster}
                    onChange={(e) => setSaveVendorMaster(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <label htmlFor="save_vendor_master_check" className="font-semibold text-slate-800 cursor-pointer">
                    Save/Update this vendor in Vendor Master directory
                  </label>
                </div>
              </div>
            </div>

            {/* Bill To Details */}
            <div className="lg:col-span-6 space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <Label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 text-indigo-900">
                <Building2 className="w-4 h-4 text-indigo-600" /> 4. Bill To (Buyer Details)
              </Label>

              <div className="space-y-1.5 text-xs text-slate-700 font-mono bg-white p-3 rounded-lg border border-slate-200">
                <div className="font-bold text-slate-900 text-sm">{poForm.billing_name || company.company_name || "GVP SOLAR ENERGY"}</div>
                <div>{poForm.billing_address || company.address || "Kapad Market, Ichalkaranji"}</div>
                <div>State: <strong>{poForm.billing_state || company.state || "Maharashtra"}</strong> {poForm.billing_pincode ? `(PIN: ${poForm.billing_pincode})` : ""}</div>
                <div className="text-indigo-700 font-bold">GSTIN: {poForm.billing_gstin || company.gst_number || "27AKMPD5407A1ZM"}</div>
                <div>Email: {company.email || "solarixofficial.info@gmail.com"} | Phone: {company.mobile || company.phone || "99999999"}</div>
              </div>

              {/* Tax Mode Selection Indicator */}
              <div className="p-3 bg-indigo-50/50 rounded-lg border border-indigo-100 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-bold text-indigo-950 uppercase">GST Tax Resolution</Label>
                  <Badge variant="outline" className="text-[10px] bg-white text-indigo-800 border-indigo-300 font-mono uppercase">
                    Current: {effectiveTaxType === "intra" ? "INTRA-STATE (CGST + SGST)" : (effectiveTaxType === "inter" ? "INTER-STATE (IGST)" : "EXEMPT / NIL")}
                  </Badge>
                </div>
                <Select
                  value={poForm.tax_type}
                  onValueChange={(val) => setPoForm({ ...poForm, tax_type: val })}
                >
                  <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-Detect (Intra/Inter-State based on GSTIN)</SelectItem>
                    <SelectItem value="intra">Intra-State (CGST 50% + SGST 50%)</SelectItem>
                    <SelectItem value="inter">Inter-State (IGST 100%)</SelectItem>
                    <SelectItem value="exempt">Exempt / Nil (0% GST)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* SECTION 5: SHIP TO / SITE DETAILS */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <Label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 text-indigo-900">
                <MapPin className="w-4 h-4 text-indigo-600" /> 5. Ship To / Delivery Site
              </Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="xs"
                  variant={poForm.ship_to_type === "company" ? "default" : "outline"}
                  onClick={() => handleShipToModeChange("company")}
                  className={`text-[11px] h-7 ${poForm.ship_to_type === "company" ? "bg-indigo-600 text-white" : "text-slate-600"}`}
                >
                  Company Office
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={poForm.ship_to_type === "project" ? "default" : "outline"}
                  onClick={() => handleShipToModeChange("project")}
                  className={`text-[11px] h-7 ${poForm.ship_to_type === "project" ? "bg-emerald-600 text-white" : "text-slate-600"}`}
                >
                  Project Installation Site
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant={poForm.ship_to_type === "custom" ? "default" : "outline"}
                  onClick={() => handleShipToModeChange("custom")}
                  className={`text-[11px] h-7 ${poForm.ship_to_type === "custom" ? "bg-slate-800 text-white" : "text-slate-600"}`}
                >
                  Custom Address
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-[10px] font-semibold text-slate-600">Site / Recipient Name</Label>
                <Input
                  value={poForm.ship_to_name}
                  onChange={(e) => setPoForm({ ...poForm, ship_to_name: e.target.value })}
                  placeholder="e.g. Shubham Jadhav (Site)"
                  className="h-8 text-xs bg-white mt-1"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-[10px] font-semibold text-slate-600">Site Address</Label>
                <Input
                  value={poForm.site_address}
                  onChange={(e) => setPoForm({ ...poForm, site_address: e.target.value })}
                  placeholder="Plot/Survey No, Street, Landmark"
                  className="h-8 text-xs bg-white mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <Label className="text-[10px] font-semibold text-slate-600">City</Label>
                <Input
                  value={poForm.site_city}
                  onChange={(e) => setPoForm({ ...poForm, site_city: e.target.value })}
                  placeholder="City"
                  className="h-8 text-xs bg-white mt-1"
                />
              </div>
              <div>
                <Label className="text-[10px] font-semibold text-slate-600">District</Label>
                <Input
                  value={poForm.site_district}
                  onChange={(e) => setPoForm({ ...poForm, site_district: e.target.value })}
                  placeholder="District"
                  className="h-8 text-xs bg-white mt-1"
                />
              </div>
              <div>
                <Label className="text-[10px] font-semibold text-slate-600">State</Label>
                <Input
                  value={poForm.site_state}
                  onChange={(e) => setPoForm({ ...poForm, site_state: e.target.value })}
                  placeholder="State"
                  className="h-8 text-xs bg-white mt-1"
                />
              </div>
              <div>
                <Label className="text-[10px] font-semibold text-slate-600">Pincode</Label>
                <Input
                  value={poForm.site_pincode}
                  onChange={(e) => setPoForm({ ...poForm, site_pincode: e.target.value })}
                  placeholder="Pincode"
                  className="h-8 text-xs bg-white mt-1 font-mono"
                />
              </div>
            </div>
          </div>

          {/* SECTION 6 & 7: SHIPPING TERMS & PAYMENT TERMS */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Shipping Details */}
            <div className="lg:col-span-7 bg-slate-100 p-3.5 rounded-xl border border-slate-200 space-y-3">
              <Label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 text-indigo-900">
                <Truck className="w-4 h-4 text-indigo-600" /> 6. Shipping & Logistics
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <Label className="text-[10px] font-semibold uppercase">SHIP VIA</Label>
                  <Input
                    value={poForm.ship_via}
                    onChange={(e) => setPoForm({ ...poForm, ship_via: e.target.value })}
                    placeholder="FOR"
                    className="h-8 text-xs bg-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-semibold uppercase">SHIPPING METHOD</Label>
                  <Input
                    value={poForm.shipping_method}
                    onChange={(e) => setPoForm({ ...poForm, shipping_method: e.target.value })}
                    placeholder="PAID"
                    className="h-8 text-xs bg-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-semibold uppercase">SHIPPING TERM</Label>
                  <Input
                    value={poForm.shipping_term}
                    onChange={(e) => setPoForm({ ...poForm, shipping_term: e.target.value })}
                    placeholder="DOOR DELIVERY"
                    className="h-8 text-xs bg-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-semibold uppercase">DELIVERY DATE</Label>
                  <Input
                    type="date"
                    value={poForm.delivery_date}
                    onChange={(e) => setPoForm({ ...poForm, delivery_date: e.target.value })}
                    className="h-8 text-xs bg-white font-mono mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div>
                  <Label className="text-[10px] font-semibold text-slate-600">Transporter Name (Optional)</Label>
                  <Input
                    value={poForm.transporter_name}
                    onChange={(e) => setPoForm({ ...poForm, transporter_name: e.target.value })}
                    placeholder="e.g. VRL Logistics, Navata"
                    className="h-8 text-xs bg-white mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-semibold text-slate-600">Expected Dispatch Date</Label>
                  <Input
                    type="date"
                    value={poForm.expected_dispatch_date}
                    onChange={(e) => setPoForm({ ...poForm, expected_dispatch_date: e.target.value })}
                    className="h-8 text-xs bg-white font-mono mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Commercial & Payment Terms */}
            <div className="lg:col-span-5 bg-slate-100 p-3.5 rounded-xl border border-slate-200 space-y-3">
              <Label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 text-indigo-900">
                <CreditCard className="w-4 h-4 text-indigo-600" /> 7. Commercial & Payment Terms
              </Label>
              <div>
                <Label className="text-[10px] font-semibold text-slate-600">Payment Terms</Label>
                <Input
                  value={poForm.payment_terms}
                  onChange={(e) => setPoForm({ ...poForm, payment_terms: e.target.value })}
                  placeholder="e.g. 20% Advance, 80% on Delivery"
                  className="h-8 text-xs bg-white mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] font-semibold text-slate-600">Advance %</Label>
                  <Input
                    type="number"
                    value={poForm.advance_percentage}
                    onChange={(e) => setPoForm({ ...poForm, advance_percentage: e.target.value })}
                    placeholder="0"
                    className="h-8 text-xs bg-white mt-1 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-[10px] font-semibold text-slate-600">Quotation Ref #</Label>
                  <Input
                    value={poForm.quotation_number}
                    onChange={(e) => setPoForm({ ...poForm, quotation_number: e.target.value })}
                    placeholder="e.g. QT-102"
                    className="h-8 text-xs bg-white mt-1"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 8: MATERIAL / LINE ITEMS TABLE */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 text-indigo-900">
                <Package className="w-4 h-4 text-indigo-600" /> 8. Material & Procurement Line Items *
              </Label>
              <Button
                type="button"
                size="sm"
                onClick={addItem}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold gap-1 h-8"
              >
                <Plus className="w-4 h-4" /> Add Item
              </Button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
              <table className="w-full text-xs text-left min-w-[950px]">
                <thead className="bg-slate-900 text-white font-semibold text-[11px]">
                  <tr>
                    <th className="p-2.5 w-10 text-center">S.NO</th>
                    <th className="p-2.5 min-w-[260px]">DESCRIPTION OF GOODS / SERVICES</th>
                    <th className="p-2.5 w-24 text-center">HSN/SAC</th>
                    <th className="p-2.5 w-28 text-center">SPEC / SIZE</th>
                    <th className="p-2.5 w-20 text-center">QTY</th>
                    <th className="p-2.5 w-20 text-center">UNIT</th>
                    <th className="p-2.5 w-24 text-right">RATE (₹)</th>
                    <th className="p-2.5 w-20 text-right">DISC (₹)</th>
                    <th className="p-2.5 w-20 text-center">GST %</th>
                    <th className="p-2.5 w-28 text-right">TOTAL (₹)</th>
                    <th className="p-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {poForm.items.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="p-2 text-center font-bold text-slate-400">{idx + 1}</td>
                      <td className="p-2 font-sans space-y-1">
                        <ProductAutocompleteInput
                          value={item.product_name}
                          onChange={(v) => updateItem(idx, "product_name", v)}
                          products={products}
                          placeholder="Search Product Master or type custom name..."
                        />
                        <Input
                          value={item.description}
                          onChange={(e) => updateItem(idx, "description", e.target.value)}
                          placeholder="Extra specifications, batch, brand details (optional)..."
                          className="h-6 text-[11px] bg-slate-50 text-slate-600 border-slate-200"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={item.hsn_sac}
                          onChange={(e) => updateItem(idx, "hsn_sac", e.target.value)}
                          placeholder="HSN"
                          className="h-8 text-xs text-center font-mono bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={item.size}
                          onChange={(e) => updateItem(idx, "size", e.target.value)}
                          placeholder="e.g. 550W"
                          className="h-8 text-xs text-center bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                          placeholder="0"
                          className="h-8 text-xs text-center font-bold bg-white"
                        />
                      </td>
                      <td className="p-2 font-sans">
                        <Select
                          value={item.unit || "Nos"}
                          onValueChange={(v) => updateItem(idx, "unit", v)}
                        >
                          <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {UNIT_OPTIONS.map((u) => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          value={item.unit_price}
                          onChange={(e) => updateItem(idx, "unit_price", e.target.value)}
                          placeholder="0.00"
                          className="h-8 text-xs text-right font-bold bg-white"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          value={item.discount}
                          onChange={(e) => updateItem(idx, "discount", e.target.value)}
                          placeholder="0"
                          className="h-8 text-xs text-right bg-white text-slate-600"
                        />
                      </td>
                      <td className="p-2">
                        <Select
                          value={String(item.gst_rate ?? "18")}
                          onValueChange={(v) => updateItem(idx, "gst_rate", v)}
                        >
                          <SelectTrigger className="h-8 text-xs bg-white font-mono text-center"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">0%</SelectItem>
                            <SelectItem value="5">5%</SelectItem>
                            <SelectItem value="12">12%</SelectItem>
                            <SelectItem value="18">18%</SelectItem>
                            <SelectItem value="28">28%</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2 text-right font-bold text-slate-900">
                        ₹{Number(item.amount || 0).toLocaleString("en-IN")}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="text-slate-400 hover:text-rose-600 transition"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 9 & 10: NOTES & COMMERCIAL TOTALS */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-4 border-t border-slate-200">
            <div className="lg:col-span-7 space-y-3">
              <Label className="text-xs font-bold text-slate-900 uppercase tracking-wider text-indigo-900">
                9. Notes and Delivery Instructions
              </Label>
              <Textarea
                value={poForm.notes}
                onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })}
                placeholder="Enter delivery instructions, dispatch terms, site contacts..."
                className="h-36 text-xs bg-white"
              />
            </div>

            <div className="lg:col-span-5 bg-slate-50 p-4 rounded-xl border border-slate-200 font-mono text-xs space-y-2">
              <div className="text-xs font-bold text-slate-900 uppercase tracking-wider font-sans border-b pb-1 text-indigo-900">
                10. Commercial Totals
              </div>

              <div className="flex justify-between text-slate-600 pt-1">
                <span>SUBTOTAL:</span>
                <span className="font-bold text-slate-900">₹{subtotal.toLocaleString("en-IN")}</span>
              </div>

              {totalDiscount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>DISCOUNT:</span>
                  <span className="text-rose-600">-₹{totalDiscount.toLocaleString("en-IN")}</span>
                </div>
              )}

              <div className="flex justify-between text-slate-700 font-semibold border-b border-slate-200 pb-1.5">
                <span>TAXABLE AMOUNT:</span>
                <span>₹{taxableAmount.toLocaleString("en-IN")}</span>
              </div>

              {effectiveTaxType === "intra" ? (
                <>
                  <div className="flex justify-between items-center text-slate-600">
                    <span className="font-sans text-[11px]">CGST:</span>
                    <span>₹{cgstAmount.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600">
                    <span className="font-sans text-[11px]">SGST:</span>
                    <span>₹{sgstAmount.toLocaleString("en-IN")}</span>
                  </div>
                </>
              ) : effectiveTaxType === "inter" ? (
                <div className="flex justify-between items-center text-slate-600">
                  <span className="font-sans text-[11px]">IGST:</span>
                  <span>₹{igstAmount.toLocaleString("en-IN")}</span>
                </div>
              ) : (
                <div className="flex justify-between items-center text-slate-500 italic">
                  <span className="font-sans text-[11px]">GST:</span>
                  <span>EXEMPT / NIL</span>
                </div>
              )}

              <div className="flex justify-between items-center text-slate-600">
                <span className="flex items-center gap-1 font-sans text-[11px]">
                  FREIGHT / S&H (₹):
                  <Input
                    type="number"
                    value={poForm.freight}
                    onChange={(e) => setPoForm({ ...poForm, freight: e.target.value })}
                    className="w-24 h-6 text-xs text-right p-1 bg-white font-mono"
                  />
                </span>
                <span>₹{freightVal.toLocaleString("en-IN")}</span>
              </div>

              <div className="flex justify-between items-center text-slate-600 border-b border-slate-200 pb-2">
                <span className="flex items-center gap-1 font-sans text-[11px]">
                  OTHER CHARGES (₹):
                  <Input
                    type="number"
                    value={poForm.other_charges}
                    onChange={(e) => setPoForm({ ...poForm, other_charges: e.target.value })}
                    className="w-24 h-6 text-xs text-right p-1 bg-white font-mono"
                  />
                </span>
                <span>₹{otherChargesVal.toLocaleString("en-IN")}</span>
              </div>

              <div className="flex justify-between items-center text-sm font-bold text-slate-900 pt-1">
                <span>GRAND TOTAL:</span>
                <span className="text-indigo-700 text-base">₹{grandTotal.toLocaleString("en-IN")}</span>
              </div>
            </div>
          </div>

          {/* SECTION 11: ACTION BUTTONS */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-slate-200">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode("list")}
                className="text-xs"
              >
                Cancel
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => savePoMutation.mutate("Draft")}
                disabled={savePoMutation.isPending}
                className="border-slate-300 text-slate-700 text-xs font-semibold h-9 shadow-xs"
              >
                Save as Draft
              </Button>
              <Button
                type="button"
                onClick={() => savePoMutation.mutate("Issued")}
                disabled={savePoMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 h-9 shadow-sm gap-1.5"
              >
                <Save className="w-4 h-4" />
                {savePoMutation.isPending ? "Saving..." : (editingPoId ? "Update Purchase Order" : "Save / Create PO")}
              </Button>
              <Button
                type="button"
                onClick={() => generatePoMutation.mutate("pdf")}
                disabled={generatePoMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 h-9 shadow-sm gap-1.5"
              >
                <Download className="w-4 h-4" />
                {generatePoMutation.isPending ? "Generating..." : "Generate PDF"}
              </Button>
              <Button
                type="button"
                onClick={() => generatePoMutation.mutate("docx")}
                disabled={generatePoMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 h-9 shadow-sm gap-1.5"
              >
                <FileText className="w-4 h-4" />
                {generatePoMutation.isPending ? "Generating..." : "Generate Word"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── NEW VENDOR MODAL ─────────────────────────────────────────────── */}
      {newVendorModalOpen && (
        <Dialog open={newVendorModalOpen} onOpenChange={setNewVendorModalOpen}>
          <DialogContent className="max-w-md rounded-xl p-5 font-sans">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <UserPlus className="w-5 h-5 text-indigo-600" /> Create New Vendor
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Save vendor details into Master Vendor directory for future procurement.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newVendorForm.name.trim()) {
                  toast.error("Vendor Name is required");
                  return;
                }
                createVendorMutation.mutate(newVendorForm);
              }}
              className="py-2 text-xs space-y-3"
            >
              <div>
                <Label className="text-xs font-semibold">Vendor Name *</Label>
                <Input
                  value={newVendorForm.name}
                  onChange={(e) => setNewVendorForm({ ...newVendorForm, name: e.target.value })}
                  placeholder="e.g. Waaree Energies Ltd"
                  className="mt-1 text-xs font-semibold"
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Contact Person</Label>
                <Input
                  value={newVendorForm.contact_person}
                  onChange={(e) => setNewVendorForm({ ...newVendorForm, contact_person: e.target.value })}
                  placeholder="e.g. Sales Manager"
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">GSTIN</Label>
                <Input
                  value={newVendorForm.gstin}
                  onChange={(e) => setNewVendorForm({ ...newVendorForm, gstin: e.target.value })}
                  placeholder="e.g. 27AAAAA0000A1Z5"
                  className="mt-1 font-mono text-xs uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Phone</Label>
                  <Input
                    value={newVendorForm.phone}
                    onChange={(e) => setNewVendorForm({ ...newVendorForm, phone: e.target.value })}
                    placeholder="Contact number"
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Email</Label>
                  <Input
                    type="email"
                    value={newVendorForm.email}
                    onChange={(e) => setNewVendorForm({ ...newVendorForm, email: e.target.value })}
                    placeholder="vendor@mail.com"
                    className="mt-1 text-xs"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Address</Label>
                <Textarea
                  value={newVendorForm.address}
                  onChange={(e) => setNewVendorForm({ ...newVendorForm, address: e.target.value })}
                  placeholder="Full vendor address"
                  className="mt-1 text-xs"
                  rows={2}
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setNewVendorModalOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={createVendorMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs">
                  {createVendorMutation.isPending ? "Saving..." : "Save Vendor"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── EDIT VENDOR MODAL ────────────────────────────────────────────── */}
      {editVendorModalOpen && (
        <Dialog open={editVendorModalOpen} onOpenChange={setEditVendorModalOpen}>
          <DialogContent className="max-w-md rounded-xl p-5 font-sans">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <Edit3 className="w-5 h-5 text-blue-600" /> Edit Vendor Master Details
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Update saved details for future POs. Existing saved PO snapshots remain unchanged.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!editVendorForm.name.trim()) {
                  toast.error("Vendor Name is required");
                  return;
                }
                updateVendorMutation.mutate(editVendorForm);
              }}
              className="py-2 text-xs space-y-3"
            >
              <div>
                <Label className="text-xs font-semibold">Vendor Name *</Label>
                <Input
                  value={editVendorForm.name}
                  onChange={(e) => setEditVendorForm({ ...editVendorForm, name: e.target.value })}
                  className="mt-1 text-xs font-semibold"
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Contact Person</Label>
                <Input
                  value={editVendorForm.contact_person}
                  onChange={(e) => setEditVendorForm({ ...editVendorForm, contact_person: e.target.value })}
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">GSTIN</Label>
                <Input
                  value={editVendorForm.gstin}
                  onChange={(e) => setEditVendorForm({ ...editVendorForm, gstin: e.target.value })}
                  className="mt-1 font-mono text-xs uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Phone</Label>
                  <Input
                    value={editVendorForm.phone}
                    onChange={(e) => setEditVendorForm({ ...editVendorForm, phone: e.target.value })}
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Email</Label>
                  <Input
                    type="email"
                    value={editVendorForm.email}
                    onChange={(e) => setEditVendorForm({ ...editVendorForm, email: e.target.value })}
                    className="mt-1 text-xs"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Address</Label>
                <Textarea
                  value={editVendorForm.address}
                  onChange={(e) => setEditVendorForm({ ...editVendorForm, address: e.target.value })}
                  className="mt-1 text-xs"
                  rows={2}
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditVendorModalOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={updateVendorMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs">
                  {updateVendorMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
