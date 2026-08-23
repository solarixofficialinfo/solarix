import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError, fileUrl, downloadFile } from "../lib/api";
import {
  DollarSign, ArrowDownLeft, Clock, Filter, Search, Plus, RefreshCw, Eye, Edit3, Trash2,
  TrendingUp, FolderPlus, Layers, User, Truck, Landmark, FileText, CheckCircle2, AlertCircle,
  XCircle, PieChart, ShieldCheck, ChevronRight, Download, CreditCard, Building, Check
} from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";

export default function Receivables() {
  const { company: companyProfile } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Project Financials Workspace Modal State
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  // New Project Dialog State
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  // Add/Edit Payment Modal State
  const [addPaymentOpen, setAddPaymentOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    payment_type: "Advance",
    amount: "",
    payment_date: new Date().toISOString().split("T")[0],
    payment_source: "Bank Transfer",
    ref_number: "",
    remarks: "",
    status: "Received"
  });

  // Client Search Dialog State
  const [changeClientModalOpen, setChangeClientModalOpen] = useState(false);
  const [clientSearchTerm, setClientSearchTerm] = useState("");

  // Product Search Dialog State
  const [productSearchModalOpen, setProductSearchModalOpen] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [activeItemIndexForProduct, setActiveItemIndexForProduct] = useState(null);

  // Full Invoice Detail View Dialog State
  const [selectedInvoiceDetail, setSelectedInvoiceDetail] = useState(null);
  const [invoiceDetailOpen, setInvoiceDetailOpen] = useState(false);

  // Create Invoice Modal State
  const [createInvoiceOpen, setCreateInvoiceOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    doc_type: "tax_invoice",
    project_id: "",
    client_id: "",
    client_name: "",
    project_name: "",
    invoice_number: "",
    invoice_date: new Date().toISOString().split("T")[0],
    payment_terms: "15 Days",
    due_date: new Date(Date.now() + 15 * 86400000).toISOString().split("T")[0],
    place_of_supply: "Maharashtra",
    reverse_charge: "No",
    seller_gstin: "",
    buyer_gstin: "",
    is_intra_state: true,
    original_invoice_number: "",
    reason: "",
    payment_mode: "Bank Transfer",
    ref_number: "",
    amount_received: "",
    items: [
      { product_name: "Solar System Installation & Supply", hsn_sac: "9954", size: "System", quantity: 1, unit: "Set", rate: 100000, discount: 0, gst_rate: 18, amount: 100000 }
    ],
    subtotal: 100000,
    discount: 0,
    taxable_amount: 100000,
    cgst_rate: 9,
    sgst_rate: 9,
    igst_rate: 0,
    freight: 0,
    round_off: 0,
    grand_total: 118000,
    notes: "Payment due within 15 days of invoice date.",
    terms: "Goods once sold will not be taken back.",
    status: "Sent",
    allocated_payment_ids: []
  });

  // Invoice Details & Apply Payment Modal State
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [applyPaymentOpen, setApplyPaymentOpen] = useState(false);
  const [selectedPaymentToApply, setSelectedPaymentToApply] = useState("");
  const [allocatedAmountInput, setAllocatedAmountInput] = useState("");
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);

  // Add/Edit Loan Modal State
  const [addLoanOpen, setAddLoanOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState(null);
  const [loanForm, setLoanForm] = useState({
    provider: "Tata Capital",
    loan_amount: "",
    approved_amount: "",
    approved_date: new Date().toISOString().split("T")[0],
    expected_disbursement_date: "",
    disbursed_amount: "0",
    loan_ref: "",
    status: "Approved",
    remarks: ""
  });

  // Add/Edit Expense Modal State
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [expenseForm, setExpenseForm] = useState({
    category: "Material",
    amount: "",
    expense_date: new Date().toISOString().split("T")[0],
    vendor_name: "",
    payment_mode: "Cash/UPI",
    ref_number: "",
    payment_status: "Paid",
    notes: ""
  });

  // Fetch Dashboard & Clients Data
  const { data: receivablesData, isLoading, refetch } = useQuery({
    queryKey: ["finance", "receivables"],
    queryFn: async () => {
      const res = await api.get("/finance/receivables");
      return res.data;
    }
  });

  // Fetch All Clients for New Project / Invoice Dropdown
  const { data: clientsList = [] } = useQuery({
    queryKey: ["clients", "list"],
    queryFn: async () => {
      const res = await api.get("/clients");
      return res.data || [];
    }
  });

  // Fetch Product Master for Invoice Line Items Autocomplete
  const { data: productMasterList = [] } = useQuery({
    queryKey: ["inventory", "products"],
    queryFn: async () => {
      const res = await api.get("/inventory/products");
      return res.data || [];
    }
  });

  // Fetch Specific Project Financial Details when Workspace Opened
  const { data: projectWorkspace, isLoading: loadingProject } = useQuery({
    queryKey: ["finance", "projects", activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return null;
      const res = await api.get(`/finance/projects/${activeProjectId}`);
      return res.data;
    },
    enabled: !!activeProjectId
  });

  const summary = receivablesData?.summary || {
    total_project_value: 0,
    total_invoiced: 0,
    total_received: 0,
    total_outstanding: 0,
    total_invoice_outstanding: 0,
    uninvoiced_value: 0,
    total_overdue: 0,
    total_loan_pending: 0,
    active_clients_count: 0
  };

  const clientItems = (receivablesData?.items || []).filter((client) => {
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !term ||
      client.full_name.toLowerCase().includes(term) ||
      client.sol_id.toLowerCase().includes(term) ||
      client.mobile.includes(term) ||
      (client.consumer_number && client.consumer_number.toLowerCase().includes(term)) ||
      client.projects.some((p) => p.project_name.toLowerCase().includes(term));

    if (!matchesSearch) return false;

    if (statusFilter === "all") return true;
    return client.projects.some((p) => {
      if (statusFilter === "paid") return p.status === "Paid";
      if (statusFilter === "partially_paid") return p.status === "Partially Paid";
      if (statusFilter === "pending") return p.status === "Pending";
      if (statusFilter === "overdue") return p.status === "Overdue";
      return true;
    });
  });

  // Mutations
  const createProjectMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post("/finance/projects", payload);
      return res.data;
    },
    onSuccess: () => {
      toast.success("New project created successfully");
      queryClient.invalidateQueries(["finance", "receivables"]);
      queryClient.invalidateQueries(["client"]);
      setNewProjectOpen(false);
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  const recordPaymentMutation = useMutation({
    mutationFn: async ({ projectId, payload }) => {
      if (editingPayment) {
        const res = await api.put(`/finance/payments/${editingPayment.id}`, payload);
        return res.data;
      } else {
        const res = await api.post(`/finance/projects/${projectId}/payments`, payload);
        return res.data;
      }
    },
    onSuccess: () => {
      toast.success(editingPayment ? "Payment record updated" : "Payment recorded successfully");
      queryClient.invalidateQueries(["finance", "receivables"]);
      queryClient.invalidateQueries(["finance", "projects", activeProjectId]);
      queryClient.invalidateQueries(["client"]);
      setAddPaymentOpen(false);
      setEditingPayment(null);
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  const deletePaymentMutation = useMutation({
    mutationFn: async (paymentId) => {
      const res = await api.delete(`/finance/payments/${paymentId}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Payment transaction deleted");
      queryClient.invalidateQueries(["finance", "receivables"]);
      queryClient.invalidateQueries(["finance", "projects", activeProjectId]);
      queryClient.invalidateQueries(["client"]);
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post("/finance/invoices", payload);
      return { ...res.data, isDraft: payload.status === "Draft" };
    },
    onSuccess: async (data) => {
      if (data?.isDraft) {
        toast.success("Draft invoice saved successfully");
      } else {
        toast.success("Tax Invoice created successfully");
      }
      queryClient.invalidateQueries(["finance", "receivables"]);
      queryClient.invalidateQueries(["finance", "projects", activeProjectId]);
      queryClient.invalidateQueries(["client"]);
      setCreateInvoiceOpen(false);
      const fileId = data?.file_id || data?.invoice?.file_id;
      if (fileId && !data?.isDraft) {
        const downloadFilename = `Invoice_${data?.invoice?.invoice_number || fileId}.pdf`;
        await downloadFile(fileId, downloadFilename);
      }
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  const applyPaymentMutation = useMutation({
    mutationFn: async ({ invoiceId, paymentId, allocatedAmount }) => {
      const res = await api.post(`/finance/invoices/${invoiceId}/apply-payment`, {
        payment_id: paymentId,
        allocated_amount: Number(allocatedAmount)
      });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || "Payment allocated successfully");
      queryClient.invalidateQueries(["finance", "receivables"]);
      queryClient.invalidateQueries(["finance", "projects", activeProjectId]);
      queryClient.invalidateQueries(["client"]);
      setApplyPaymentOpen(false);
      setSelectedInvoice(null);
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: async (invoiceId) => {
      const res = await api.delete(`/finance/invoices/${invoiceId}`);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data?.message || "Invoice deleted successfully");
      queryClient.invalidateQueries(["finance", "receivables"]);
      queryClient.invalidateQueries(["finance", "projects", activeProjectId]);
      queryClient.invalidateQueries(["client"]);
      queryClient.invalidateQueries(["invoices"]);
      setInvoiceDetailOpen(false);
      setSelectedInvoiceDetail(null);
      setInvoiceToDelete(null);
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  const recordLoanMutation = useMutation({
    mutationFn: async ({ projectId, payload }) => {
      if (editingLoan) {
        const res = await api.put(`/finance/loans/${editingLoan.id}`, payload);
        return res.data;
      } else {
        const res = await api.post(`/finance/projects/${projectId}/loans`, payload);
        return res.data;
      }
    },
    onSuccess: () => {
      toast.success(editingLoan ? "Loan record updated" : "Loan record logged successfully");
      queryClient.invalidateQueries(["finance", "receivables"]);
      queryClient.invalidateQueries(["finance", "projects", activeProjectId]);
      queryClient.invalidateQueries(["client"]);
      setAddLoanOpen(false);
      setEditingLoan(null);
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  const deleteLoanMutation = useMutation({
    mutationFn: async (loanId) => {
      const res = await api.delete(`/finance/loans/${loanId}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Loan record deleted");
      queryClient.invalidateQueries(["finance", "receivables"]);
      queryClient.invalidateQueries(["finance", "projects", activeProjectId]);
      queryClient.invalidateQueries(["client"]);
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  const recordExpenseMutation = useMutation({
    mutationFn: async ({ projectId, payload }) => {
      if (editingExpense) {
        const res = await api.put(`/finance/expenses/${editingExpense.id}`, payload);
        return res.data;
      } else {
        const res = await api.post(`/finance/projects/${projectId}/expenses`, payload);
        return res.data;
      }
    },
    onSuccess: () => {
      toast.success(editingExpense ? "Expense updated" : "Expense logged successfully");
      queryClient.invalidateQueries(["finance", "receivables"]);
      queryClient.invalidateQueries(["finance", "projects", activeProjectId]);
      queryClient.invalidateQueries(["client"]);
      setAddExpenseOpen(false);
      setEditingExpense(null);
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (expenseId) => {
      const res = await api.delete(`/finance/expenses/${expenseId}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success("Expense deleted");
      queryClient.invalidateQueries(["finance", "receivables"]);
      queryClient.invalidateQueries(["finance", "projects", activeProjectId]);
      queryClient.invalidateQueries(["client"]);
    },
    onError: (err) => toast.error(formatApiError(err))
  });

  // Modal Handlers
  const handleDownloadInvoiceDoc = async (inv, format = "pdf") => {
    if (!inv || !inv.id) {
      toast.error("Invoice record is missing or invalid");
      return;
    }
    const fmt = (format || "pdf").toLowerCase().trim();
    const ext = fmt === "docx" ? ".docx" : ".pdf";
    const defaultFilename = `Invoice_${(inv.invoice_number || inv.id).replace(/\s+/g, "_")}${ext}`;
    try {
      toast.info(`Generating ${fmt.toUpperCase()}...`);
      const res = await api.post(`/finance/invoices/${inv.id}/generate-doc`, { format: fmt });
      const targetFileId = res.data?.file_id || res.data?.id;
      const downloadFilename = res.data?.filename || defaultFilename;
      if (targetFileId) {
        const ok = await downloadFile(targetFileId, downloadFilename);
        if (ok) {
          toast.success(`${fmt.toUpperCase()} downloaded successfully`);
        }
      } else {
        toast.error("Could not generate document");
      }
    } catch (err) {
      console.error("Error generating invoice doc:", err);
      toast.error("Failed to generate document: " + formatApiError(err));
    }
  };

  const handleOpenAddPayment = (projId = null, prefillPayment = null) => {
    const targetProjId = projId || activeProjectId;
    setActiveProjectId(targetProjId);
    if (prefillPayment) {
      setEditingPayment(prefillPayment);
      setPaymentForm({
        payment_type: prefillPayment.payment_type || prefillPayment.milestone_name || "Advance",
        milestone_name: prefillPayment.milestone_name || prefillPayment.payment_type || "Advance",
        amount: String(prefillPayment.amount || ""),
        payment_date: prefillPayment.payment_date || new Date().toISOString().split("T")[0],
        payment_source: prefillPayment.payment_source || prefillPayment.payment_mode || "Bank Transfer",
        ref_number: prefillPayment.ref_number || prefillPayment.bank_utr || "",
        remarks: prefillPayment.remarks || prefillPayment.notes || "",
        status: prefillPayment.status || "Received",
        loan_id: prefillPayment.loan_id || ""
      });
    } else {
      setEditingPayment(null);
      setPaymentForm({
        payment_type: "Advance",
        milestone_name: "Advance",
        amount: "",
        payment_date: new Date().toISOString().split("T")[0],
        payment_source: "Bank Transfer",
        ref_number: "",
        remarks: "",
        status: "Received",
        loan_id: ""
      });
    }
    setAddPaymentOpen(true);
  };

  const handleConvertLoanToPayment = (loan) => {
    setActiveProjectId(loan.project_id || activeProjectId);
    setEditingPayment(null);
    const disbAmt = Number(loan.disbursed_amount || 0);
    const appAmt = Number(loan.approved_amount || loan.loan_amount || 0);
    const defaultAmt = disbAmt > 0 ? disbAmt : appAmt;
    setPaymentForm({
      payment_type: "Loan / Finance",
      milestone_name: `Loan / Finance (${loan.provider || "Finance"})`,
      amount: defaultAmt > 0 ? String(defaultAmt) : "",
      payment_date: loan.expected_disbursement_date || loan.approved_date || new Date().toISOString().split("T")[0],
      payment_source: loan.provider ? `Loan / Finance (${loan.provider})` : "Loan / Finance",
      ref_number: loan.loan_ref || "",
      remarks: `Disbursed Loan Receipt from ${loan.provider || "Finance"}`,
      status: "Received",
      loan_id: loan.id
    });
    setAddPaymentOpen(true);
  };

  const handleOpenEditPayment = (pay) => {
    setEditingPayment(pay);
    setPaymentForm({
      payment_type: pay.payment_type || "Advance",
      milestone_name: pay.milestone_name || pay.payment_type || "Advance",
      amount: String(pay.amount || ""),
      payment_date: pay.payment_date || (pay.created_at || "").slice(0, 10),
      payment_source: pay.payment_source || pay.payment_mode || "Bank Transfer",
      ref_number: pay.ref_number || pay.bank_utr || "",
      remarks: pay.remarks || pay.notes || "",
      status: pay.status || "Received",
      loan_id: pay.loan_id || ""
    });
    setAddPaymentOpen(true);
  };

  const handleOpenAddLoan = (projId) => {
    setActiveProjectId(projId);
    setEditingLoan(null);
    setLoanForm({
      provider: "Tata Capital",
      loan_amount: "",
      approved_amount: "",
      approved_date: new Date().toISOString().split("T")[0],
      expected_disbursement_date: "",
      disbursed_amount: "",
      loan_ref: "",
      status: "Applied",
      remarks: ""
    });
    setAddLoanOpen(true);
  };

  const handleOpenEditLoan = (loan) => {
    setEditingLoan(loan);
    setLoanForm({
      provider: loan.provider || "Tata Capital",
      loan_amount: String(loan.loan_amount || ""),
      approved_amount: String(loan.approved_amount || ""),
      approved_date: loan.approved_date || "",
      expected_disbursement_date: loan.expected_disbursement_date || "",
      disbursed_amount: String(loan.disbursed_amount || ""),
      loan_ref: loan.loan_ref || "",
      status: loan.status || "Applied",
      remarks: loan.remarks || ""
    });
    setAddLoanOpen(true);
  };

  const handleOpenAddExpense = (projId) => {
    setActiveProjectId(projId);
    setEditingExpense(null);
    setExpenseForm({
      category: "BOS Material",
      amount: "",
      expense_date: new Date().toISOString().split("T")[0],
      vendor_name: "",
      description: "",
      payment_mode: "Bank Transfer",
      ref_number: "",
      payment_status: "Paid",
      notes: ""
    });
    setAddExpenseOpen(true);
  };

  const handleOpenEditExpense = (exp) => {
    setEditingExpense(exp);
    setExpenseForm({
      category: exp.category || "BOS Material",
      amount: String(exp.amount || ""),
      expense_date: exp.expense_date || (exp.created_at || "").slice(0, 10),
      vendor_name: exp.vendor_name || "",
      description: exp.description || "",
      payment_mode: exp.payment_mode || "Bank Transfer",
      ref_number: exp.ref_number || "",
      payment_status: exp.payment_status || "Paid",
      notes: exp.notes || ""
    });
    setAddExpenseOpen(true);
  };

  const calculateInvoiceTotals = (
    items,
    disc = invoiceForm.discount,
    isIntra = invoiceForm.is_intra_state,
    cgstRate = invoiceForm.cgst_rate,
    sgstRate = invoiceForm.sgst_rate,
    igstRate = invoiceForm.igst_rate,
    frt = invoiceForm.freight,
    rnd = invoiceForm.round_off,
    gstApplicable = invoiceForm.gst_applicable !== undefined ? invoiceForm.gst_applicable : true
  ) => {
    const sub = items.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
    const taxable = Math.max(0, sub - Number(disc || 0));

    let cgstAmt = 0;
    let sgstAmt = 0;
    let igstAmt = 0;

    if (gstApplicable) {
      if (isIntra) {
        cgstAmt = (taxable * Number(cgstRate || 0)) / 100;
        sgstAmt = (taxable * Number(sgstRate || 0)) / 100;
      } else {
        igstAmt = (taxable * Number(igstRate || 0)) / 100;
      }
    }

    const grand = taxable + cgstAmt + sgstAmt + igstAmt + Number(frt || 0) + Number(rnd || 0);

    return {
      subtotal: sub,
      discount: Number(disc || 0),
      taxable_amount: taxable,
      cgst_rate: (gstApplicable && isIntra) ? Number(cgstRate || 0) : 0,
      sgst_rate: (gstApplicable && isIntra) ? Number(sgstRate || 0) : 0,
      igst_rate: (gstApplicable && !isIntra) ? Number(igstRate || 0) : 0,
      freight: Number(frt || 0),
      round_off: Number(rnd || 0),
      grand_total: grand
    };
  };

  const handleOpenCreateInvoice = (projId = null, docType = "tax_invoice", clientObj = null, projObj = null, existingInvoice = null) => {
    const targetProjId = projId || activeProjectId;
    
    let matchedClient = clientObj || null;
    let matchedProj = projObj || null;

    if (!matchedProj && targetProjId) {
      if (projectWorkspace?.project?.id === targetProjId) {
        matchedProj = projectWorkspace.project;
      } else if (receivablesData?.items) {
        for (const item of receivablesData.items) {
          const foundProj = item.projects?.find((p) => p.id === targetProjId);
          if (foundProj) {
            matchedProj = foundProj;
            if (!matchedClient) {
              matchedClient = clientsList.find((c) => c.id === item.client_id) || {
                id: item.client_id,
                full_name: item.full_name,
                mobile: item.mobile,
                sol_id: item.sol_id
              };
            }
            break;
          }
        }
      }
    }

    if (!matchedClient) {
      if (projectWorkspace?.client?.id) {
        matchedClient = projectWorkspace.client;
      } else if (targetProjId) {
        const rawCid = targetProjId.startsWith("proj_") ? targetProjId.replace("proj_", "") : targetProjId;
        matchedClient = clientsList.find((c) => c.id === rawCid || c.sol_id === rawCid) || null;
      }
    }

    const client = matchedClient;
    const proj = matchedProj;
    const cid = client?.id || proj?.client_id || "";

    if (existingInvoice) {
      setInvoiceForm({
        id: existingInvoice.id,
        doc_type: existingInvoice.doc_type || docType,
        project_id: existingInvoice.project_id || targetProjId || "",
        client_id: existingInvoice.client_id || client?.id || cid || "",
        client_name: existingInvoice.client_name || client?.full_name || proj?.client_name || "",
        project_name: existingInvoice.project_name || proj?.project_name || "Solar Project",
        invoice_number: existingInvoice.invoice_number,
        invoice_date: existingInvoice.invoice_date || new Date().toISOString().split("T")[0],
        payment_terms: existingInvoice.payment_terms || "15 Days",
        due_date: existingInvoice.due_date || "",
        place_of_supply: existingInvoice.place_of_supply || client?.state || "Maharashtra",
        reverse_charge: existingInvoice.reverse_charge || "No",
        seller_gstin: existingInvoice.seller_gstin || companyProfile?.gst_number || companyProfile?.gstin || companyProfile?.gst_no || "",
        buyer_gstin: existingInvoice.buyer_gstin || client?.gst_number || client?.gstin || "",
        is_intra_state: existingInvoice.igst_rate === 0 || existingInvoice.igst_rate === undefined,
        gst_applicable: (Number(existingInvoice.cgst_rate) > 0 || Number(existingInvoice.sgst_rate) > 0 || Number(existingInvoice.igst_rate) > 0),
        is_locked_client: true,
        original_invoice_number: existingInvoice.original_invoice_number || "",
        reason: existingInvoice.reason || "",
        payment_mode: existingInvoice.payment_mode || "Bank Transfer",
        ref_number: existingInvoice.ref_number || "",
        amount_received: existingInvoice.amount_received || existingInvoice.paid_amount || 0,
        items: (existingInvoice.items && existingInvoice.items.length > 0) ? existingInvoice.items.map(it => ({
          product_name: it.product_name || it.product || "Item",
          hsn_sac: it.hsn_sac || "",
          size: it.size || "",
          quantity: it.quantity !== undefined && it.quantity !== null ? it.quantity : 1,
          unit: it.unit || "Nos",
          rate: it.rate !== undefined && it.rate !== null ? it.rate : (it.unit_price !== undefined && it.unit_price !== null ? it.unit_price : 0),
          discount: it.discount !== undefined && it.discount !== null ? it.discount : 0,
          gst_rate: it.gst_rate !== undefined && it.gst_rate !== null ? it.gst_rate : (it.gst !== undefined && it.gst !== null ? it.gst : 18),
          amount: it.amount !== undefined && it.amount !== null ? it.amount : 0
        })) : [],
        subtotal: existingInvoice.subtotal || 0,
        discount: existingInvoice.discount || 0,
        taxable_amount: existingInvoice.taxable_amount || existingInvoice.subtotal || 0,
        cgst_rate: existingInvoice.cgst_rate !== undefined ? existingInvoice.cgst_rate : 9,
        cgst_amount: existingInvoice.cgst_amount || 0,
        sgst_rate: existingInvoice.sgst_rate !== undefined ? existingInvoice.sgst_rate : 9,
        sgst_amount: existingInvoice.sgst_amount || 0,
        igst_rate: existingInvoice.igst_rate !== undefined ? existingInvoice.igst_rate : 0,
        igst_amount: existingInvoice.igst_amount || 0,
        total_tax: (existingInvoice.cgst_amount || 0) + (existingInvoice.sgst_amount || 0) + (existingInvoice.igst_amount || 0),
        freight: existingInvoice.freight || 0,
        round_off: existingInvoice.round_off || 0,
        grand_total: existingInvoice.grand_total || 0,
        notes: existingInvoice.notes || "Payment due within 15 days of invoice date.",
        terms: existingInvoice.terms || "Goods once sold will not be taken back.",
        status: existingInvoice.status || "Draft",
        allocated_payment_ids: existingInvoice.allocated_payment_ids || []
      });
      setCreateInvoiceOpen(true);
      return;
    }

    const isLockedClient = !!(client || proj);
    const sysKw = proj?.capacity_kw || client?.system_kw || 0;
    const projVal = proj?.project_value || proj?.quotation_value || 100000;
    const defaultRate = projVal;

    const prefixMap = { tax_invoice: "INV", proforma: "PI", payment_receipt: "REC", credit_note: "CN", debit_note: "DN" };
    const prefix = prefixMap[docType] || "INV";
    const invNum = `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;

    const defaultItem = {
      product_name: `${sysKw ? sysKw + " kW " : ""}Solar System Installation & Supply`,
      hsn_sac: "9954",
      size: sysKw ? `${sysKw} kW` : "System",
      quantity: 1,
      unit: "Set",
      rate: defaultRate,
      discount: 0,
      gst_rate: 18,
      amount: defaultRate
    };

    const companyState = (companyProfile?.state || "Maharashtra").toLowerCase().trim();
    const clientState = (client?.state || "Maharashtra").toLowerCase().trim();
    const isIntra = companyState === clientState || !clientState;

    const totals = calculateInvoiceTotals([defaultItem], 0, isIntra, isIntra ? 9 : 0, isIntra ? 9 : 0, !isIntra ? 18 : 0, 0, 0, true);

    setInvoiceForm({
      doc_type: docType,
      project_id: proj?.project_id || targetProjId || "",
      client_id: client?.id || cid || "",
      client_name: client?.full_name || proj?.client_name || "",
      project_name: proj?.project_name || "Solar Project",
      invoice_number: invNum,
      invoice_date: new Date().toISOString().split("T")[0],
      payment_terms: "15 Days",
      due_date: new Date(Date.now() + 15 * 86400000).toISOString().split("T")[0],
      place_of_supply: client?.state || "Maharashtra",
      reverse_charge: "No",
      seller_gstin: companyProfile?.gst_number || companyProfile?.gstin || companyProfile?.gst_no || "",
      buyer_gstin: client?.gst_number || client?.gstin || client?.gst_no || "",
      is_intra_state: isIntra,
      gst_applicable: true,
      is_locked_client: isLockedClient,
      original_invoice_number: "",
      reason: "",
      payment_mode: "Bank Transfer",
      ref_number: "",
      amount_received: 0,
      items: [defaultItem],
      ...totals,
      notes: "Payment due within 15 days of invoice date.",
      terms: "Goods once sold will not be taken back.",
      status: "Sent",
      allocated_payment_ids: []
    });
    setCreateInvoiceOpen(true);
  };

  const updateInvoiceFormCalculations = (
    newItems,
    disc = invoiceForm.discount,
    isIntra = invoiceForm.is_intra_state,
    cgst = invoiceForm.cgst_rate,
    sgst = invoiceForm.sgst_rate,
    igst = invoiceForm.igst_rate,
    frt = invoiceForm.freight,
    rnd = invoiceForm.round_off,
    gstApplicable = invoiceForm.gst_applicable
  ) => {
    const isGstApp = gstApplicable !== undefined ? gstApplicable : (invoiceForm.gst_applicable !== undefined ? invoiceForm.gst_applicable : true);
    const totals = calculateInvoiceTotals(newItems, disc, isIntra, cgst, sgst, igst, frt, rnd, isGstApp);
    setInvoiceForm((prev) => ({
      ...prev,
      items: newItems,
      is_intra_state: isIntra,
      gst_applicable: isGstApp,
      ...totals
    }));
  };

  const handleInvoiceItemChange = (index, field, value) => {
    const newItems = [...invoiceForm.items];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === "quantity" || field === "rate" || field === "discount") {
      const q = Number(field === "quantity" ? value : newItems[index].quantity) || 0;
      const r = Number(field === "rate" ? value : newItems[index].rate) || 0;
      const d = Number(field === "discount" ? value : newItems[index].discount) || 0;
      newItems[index].amount = Math.max(0, (q * r) - d);
    }
    updateInvoiceFormCalculations(newItems);
  };

  const handleAddInvoiceItem = () => {
    const newItems = [
      ...invoiceForm.items,
      { product_name: "", size: "", quantity: 1, unit: "Nos", rate: 0, discount: 0, gst_rate: invoiceForm.gst_applicable ? 18 : 0, amount: 0 }
    ];
    updateInvoiceFormCalculations(newItems);
  };

  const handleRemoveInvoiceItem = (index) => {
    if (invoiceForm.items.length <= 1) {
      toast.error("Invoice must contain at least one line item");
      return;
    }
    const newItems = invoiceForm.items.filter((_, i) => i !== index);
    updateInvoiceFormCalculations(newItems);
  };

  return (
    <div className="p-5 space-y-5 max-w-7xl mx-auto font-sans">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-blue-600" /> Receivables & Collection Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Solar EPC Project Billing: Contract Value, Standalone Invoices, Payments Allocation & Unallocated Advances.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 text-xs h-8">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => handleOpenCreateInvoice()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-8 gap-1 shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" /> Create Invoice
          </Button>
          <Button
            size="sm"
            onClick={() => setNewProjectOpen(true)}
            className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-8 gap-1 shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" /> New Project
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards (6 Financial Metrics) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-3 space-y-1">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-medium">
              <span>Contract Value</span>
              <DollarSign className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="text-base font-bold text-slate-900 font-mono">
              ₹{(summary.total_project_value || 0).toLocaleString("en-IN")}
            </div>
            <div className="text-[10px] text-slate-500">Total Project Value</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-3 space-y-1">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-medium">
              <span>Total Invoiced</span>
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <div className="text-base font-bold text-indigo-700 font-mono">
              ₹{(summary.total_invoiced || 0).toLocaleString("en-IN")}
            </div>
            <div className="text-[10px] text-indigo-600 font-medium">Invoices Issued</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-3 space-y-1">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-medium">
              <span>Total Received</span>
              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-base font-bold text-emerald-700 font-mono">
              ₹{(summary.total_received || 0).toLocaleString("en-IN")}
            </div>
            <div className="text-[10px] text-emerald-600 font-medium">Actual Payments</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-3 space-y-1">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-medium">
              <span>Invoice Outstanding</span>
              <Clock className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="text-base font-bold text-blue-700 font-mono">
              ₹{(summary.total_invoice_outstanding || 0).toLocaleString("en-IN")}
            </div>
            <div className="text-[10px] text-blue-600 font-medium">Invoiced - Paid</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-3 space-y-1">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-medium">
              <span>Uninvoiced Value</span>
              <Layers className="w-3.5 h-3.5 text-purple-600" />
            </div>
            <div className="text-base font-bold text-purple-700 font-mono">
              ₹{(summary.uninvoiced_value || 0).toLocaleString("en-IN")}
            </div>
            <div className="text-[10px] text-purple-600 font-medium">Contract - Invoiced</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-2xs bg-white">
          <CardContent className="p-3 space-y-1">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-medium">
              <span>Project Outstanding</span>
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="text-base font-bold text-amber-700 font-mono">
              ₹{(summary.total_outstanding || 0).toLocaleString("en-IN")}
            </div>
            <div className="text-[10px] text-amber-600 font-medium">Contract - Received</div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter Bar */}
      <Card className="border-slate-200 shadow-2xs bg-white">
        <CardContent className="p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search Client, SOL ID, Capacity, Project..."
              className="pl-8 h-8 text-xs"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto text-xs">
            <span className="text-[11px] text-slate-400 font-medium mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Status:
            </span>
            {[
              { id: "all", label: "All" },
              { id: "partially_paid", label: "Partially Paid" },
              { id: "pending", label: "Pending" },
              { id: "paid", label: "Paid" },
              { id: "overdue", label: "Overdue" }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                  statusFilter === f.id
                    ? "bg-slate-900 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* COMPACT PROJECT CARDS LIST */}
      {isLoading ? (
        <div className="p-8 text-center text-slate-400 text-xs italic">Loading project receivables...</div>
      ) : clientItems.length === 0 ? (
        <Card className="border-slate-200 p-8 text-center text-slate-500 text-xs bg-white">
          No projects found matching your search.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {clientItems.flatMap((client) =>
            client.projects.map((proj) => (
              <div
                key={proj.id}
                className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs hover:border-blue-200 hover:shadow-xs transition space-y-2.5"
              >
                {/* Header: Client & Project Basic Info */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                  <div>
                    <div className="font-bold text-sm text-slate-900 leading-tight">
                      {client.full_name}
                      {client.sol_id && (
                        <span className="ml-1.5 font-mono text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 font-normal">
                          {client.sol_id}
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-slate-700 mt-0.5 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-blue-600" />
                      {proj.project_name} ({proj.capacity_kw ? `${proj.capacity_kw} kW` : "System"})
                    </div>
                  </div>

                  <Badge
                    variant="outline"
                    className={
                      proj.status === "Paid"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold"
                        : proj.status === "Partially Paid"
                        ? "bg-blue-50 text-blue-700 border-blue-200 text-[10px] font-semibold"
                        : "bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-semibold"
                    }
                  >
                    {proj.status}
                  </Badge>
                </div>

                {/* Financial Summary Breakdown Table */}
                <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-lg text-xs border border-slate-100 font-mono">
                  <div>
                    <div className="text-[10px] text-slate-400 font-sans">Contract Value</div>
                    <div className="font-bold text-slate-900">₹{proj.project_value.toLocaleString("en-IN")}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-emerald-600 font-sans">Actual Received</div>
                    <div className="font-bold text-emerald-700">₹{proj.total_received.toLocaleString("en-IN")}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-indigo-600 font-sans">Loan Pending</div>
                    <div className="font-bold text-indigo-700">₹{proj.loan_pending.toLocaleString("en-IN")}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-amber-600 font-sans">Outstanding</div>
                    <div className="font-bold text-amber-700">₹{proj.total_pending.toLocaleString("en-IN")}</div>
                  </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-1.5 border-t border-slate-100">
                  <Button
                    size="xs"
                    onClick={() => handleOpenAddPayment(proj.id)}
                    className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white font-medium gap-1 rounded-md px-2.5"
                  >
                    <Plus className="w-3 h-3" /> Add Payment
                  </Button>
                  <Button
                    size="xs"
                    onClick={() => {
                      setActiveProjectId(proj.id);
                      setActiveTab("overview");
                    }}
                    className="h-7 text-[11px] bg-slate-900 hover:bg-slate-800 text-white font-medium gap-1 rounded-md px-2.5"
                  >
                    Open Project <ChevronRight className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ─── OPEN PROJECT FINANCIAL WORKSPACE MODAL ─────────────────────────── */}
      {activeProjectId && (
        <Dialog open={!!activeProjectId} onOpenChange={() => setActiveProjectId(null)}>
          <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-5 rounded-2xl">
            <DialogHeader className="border-b border-slate-100 pb-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <DialogTitle className="flex items-center gap-2 text-slate-900 text-base font-bold">
                    <Layers className="w-5 h-5 text-blue-600" />
                    {projectWorkspace?.project?.project_name || "Project Details"}
                    {projectWorkspace?.project?.capacity_kw && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs ml-1">
                        {projectWorkspace.project.capacity_kw} kW
                      </Badge>
                    )}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 mt-0.5">
                    Client: <strong className="text-slate-800">{projectWorkspace?.client?.full_name}</strong> (SOL ID: {projectWorkspace?.client?.sol_id || "—"}) · Mobile: {projectWorkspace?.client?.mobile || "—"}
                  </DialogDescription>
                </div>

                {/* Primary Action Buttons in Workspace Header */}
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => handleOpenCreateInvoice(activeProjectId)}
                    className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1 rounded-lg shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" /> + Create Invoice
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleOpenAddPayment(activeProjectId)}
                    className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1 rounded-lg shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" /> + Add Payment
                  </Button>
                </div>
              </div>
            </DialogHeader>

            {loadingProject ? (
              <div className="p-8 text-center text-slate-400 text-xs italic">Loading project data...</div>
            ) : (
              <div className="py-2 space-y-4">
                {/* Workspace Tabs (8 Tabs) */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid grid-cols-4 sm:grid-cols-8 bg-slate-100 p-1 rounded-xl text-xs">
                    <TabsTrigger value="overview" className="text-xs py-1.5">Overview</TabsTrigger>
                    <TabsTrigger value="payment_plan" className="text-xs py-1.5">Payment Plan</TabsTrigger>
                    <TabsTrigger value="invoices" className="text-xs py-1.5 flex items-center gap-1 font-semibold text-blue-700">
                      Invoices ({projectWorkspace?.invoices?.length || 0})
                    </TabsTrigger>
                    <TabsTrigger value="payments" className="text-xs py-1.5">Payments</TabsTrigger>
                    <TabsTrigger value="loan_finance" className="text-xs py-1.5">Loan / Finance</TabsTrigger>
                    <TabsTrigger value="expenses" className="text-xs py-1.5">Expenses</TabsTrigger>
                    <TabsTrigger value="profitability" className="text-xs py-1.5">Profitability</TabsTrigger>
                    <TabsTrigger value="documents" className="text-xs py-1.5">Documents</TabsTrigger>
                  </TabsList>

                  {/* ─── TAB 1: OVERVIEW ────────────────────────────────────────── */}
                  <TabsContent value="overview" className="space-y-4 pt-3">
                    {/* Top Financial Breakdown Bar (6 Cards) */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        <div className="text-[10px] text-slate-400 font-medium">Contract Value</div>
                        <div className="text-sm font-bold text-slate-900 mt-0.5 font-mono">
                          ₹{(projectWorkspace?.summary?.project_value || 0).toLocaleString("en-IN")}
                        </div>
                      </div>
                      <div className="bg-indigo-50/70 p-2.5 rounded-lg border border-indigo-200">
                        <div className="text-[10px] text-indigo-700 font-medium">Total Invoiced</div>
                        <div className="text-sm font-bold text-indigo-700 mt-0.5 font-mono">
                          ₹{(projectWorkspace?.summary?.total_invoiced || 0).toLocaleString("en-IN")}
                        </div>
                      </div>
                      <div className="bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-200">
                        <div className="text-[10px] text-emerald-700 font-medium">Actual Received</div>
                        <div className="text-sm font-bold text-emerald-700 mt-0.5 font-mono">
                          ₹{(projectWorkspace?.summary?.total_received || 0).toLocaleString("en-IN")}
                        </div>
                      </div>
                      <div className="bg-blue-50/70 p-2.5 rounded-lg border border-blue-200">
                        <div className="text-[10px] text-blue-700 font-medium">Invoice Outstanding</div>
                        <div className="text-sm font-bold text-blue-700 mt-0.5 font-mono">
                          ₹{(projectWorkspace?.summary?.invoice_outstanding || 0).toLocaleString("en-IN")}
                        </div>
                      </div>
                      <div className="bg-purple-50/70 p-2.5 rounded-lg border border-purple-200">
                        <div className="text-[10px] text-purple-700 font-medium">Uninvoiced Value</div>
                        <div className="text-sm font-bold text-purple-700 mt-0.5 font-mono">
                          ₹{(projectWorkspace?.summary?.uninvoiced_value || 0).toLocaleString("en-IN")}
                        </div>
                      </div>
                      <div className="bg-amber-50/70 p-2.5 rounded-lg border border-amber-200">
                        <div className="text-[10px] text-amber-700 font-medium">Project Outstanding</div>
                        <div className="text-sm font-bold text-amber-700 mt-0.5 font-mono">
                          ₹{(projectWorkspace?.summary?.project_outstanding || 0).toLocaleString("en-IN")}
                        </div>
                      </div>
                    </div>

                    {/* Detailed Client Financial Summary Table */}
                    <Card className="border-slate-200 shadow-2xs">
                      <CardContent className="p-4 space-y-3">
                        <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2">
                          Client Financial Reconciliation
                        </h4>
                        <div className="space-y-1.5 text-xs font-mono">
                          <div className="flex justify-between py-1 border-b border-slate-50">
                            <span className="text-slate-600 font-sans">Contract Value</span>
                            <span className="font-bold text-slate-900">
                              ₹{(projectWorkspace?.summary?.project_value || 0).toLocaleString("en-IN")}
                            </span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-50">
                            <span className="text-slate-600 font-sans">Total Invoiced Amount</span>
                            <span className="font-medium text-indigo-700">
                              ₹{(projectWorkspace?.summary?.total_invoiced || 0).toLocaleString("en-IN")}
                            </span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-50">
                            <span className="text-slate-600 font-sans">Actual Payments Received</span>
                            <span className="font-medium text-emerald-700">
                              ₹{(projectWorkspace?.summary?.total_received || 0).toLocaleString("en-IN")}
                            </span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-50 bg-blue-50/40 px-2 rounded">
                            <span className="text-blue-800 font-sans font-medium">Invoice Outstanding Amount</span>
                            <span className="font-bold text-blue-700">
                              ₹{(projectWorkspace?.summary?.invoice_outstanding || 0).toLocaleString("en-IN")}
                            </span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-slate-50 bg-purple-50/40 px-2 rounded">
                            <span className="text-purple-800 font-sans font-medium">Uninvoiced Project Value</span>
                            <span className="font-bold text-purple-700">
                              ₹{(projectWorkspace?.summary?.uninvoiced_value || 0).toLocaleString("en-IN")}
                            </span>
                          </div>
                          <div className="flex justify-between py-1.5 bg-amber-50/60 px-2 rounded font-bold text-sm">
                            <span className="text-amber-900 font-sans">Project Outstanding (Contract - Received)</span>
                            <span className="text-amber-800">
                              ₹{(projectWorkspace?.summary?.project_outstanding || 0).toLocaleString("en-IN")}
                            </span>
                          </div>
                          {projectWorkspace?.summary?.unallocated_advance > 0 && (
                            <div className="flex justify-between py-1.5 bg-emerald-50/80 px-2 rounded font-bold text-xs text-emerald-900 border border-emerald-200">
                              <span className="font-sans">Unallocated Advance Payments</span>
                              <span>₹{(projectWorkspace?.summary?.unallocated_advance || 0).toLocaleString("en-IN")}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Quick Action Buttons */}
                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        size="sm"
                        onClick={() => handleOpenCreateInvoice(activeProjectId)}
                        className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1 rounded-lg"
                      >
                        <Plus className="w-3.5 h-3.5" /> Create Invoice
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleOpenAddPayment(activeProjectId)}
                        className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1 rounded-lg"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Payment
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleOpenAddLoan(activeProjectId)}
                        className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1 rounded-lg"
                      >
                        <Plus className="w-3.5 h-3.5" /> Record Loan
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleOpenAddExpense(activeProjectId)}
                        className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1 rounded-lg"
                      >
                        <Plus className="w-3.5 h-3.5" /> Log Expense
                      </Button>
                    </div>
                  </TabsContent>

                  {/* ─── TAB 2: PAYMENT PLAN ───────────────────────────────────── */}
                  <TabsContent value="payment_plan" className="space-y-3 pt-3">
                    <div className="flex items-center justify-between text-xs">
                      <h4 className="font-bold text-slate-900">Planned Payment Milestones</h4>
                      <span className="text-slate-400 italic">Planned schedule does not count as money received</span>
                    </div>

                    {(projectWorkspace?.payment_plan || []).length === 0 ? (
                      <div className="p-6 text-center text-slate-400 text-xs italic bg-slate-50 rounded-xl border">
                        No payment plan defined for this project.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-100 text-slate-600 font-semibold">
                            <tr>
                              <th className="p-2.5">Milestone</th>
                              <th className="p-2.5 text-right">Planned Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono">
                            {projectWorkspace.payment_plan.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="p-2.5 font-sans font-medium text-slate-800">{item.name}</td>
                                <td className="p-2.5 text-right font-bold text-slate-900">
                                  ₹{Number(item.amount).toLocaleString("en-IN")}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </TabsContent>

                  {/* ─── TAB 3: INVOICES (NEW TAB!) ─────────────────────────────── */}
                  <TabsContent value="invoices" className="space-y-3 pt-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs text-slate-900">Project Tax Invoices</h4>
                      <Button
                        size="sm"
                        onClick={() => handleOpenCreateInvoice(activeProjectId)}
                        className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> + Create Invoice
                      </Button>
                    </div>

                    {(projectWorkspace?.invoices || []).length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                        <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                        <div className="font-bold text-slate-700 text-xs">No Tax Invoices Created Yet</div>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                          Invoices are billing records separate from payments. Create an invoice to bill the client.
                        </p>
                        <Button
                          size="sm"
                          onClick={() => handleOpenCreateInvoice(activeProjectId)}
                          className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1 mt-2"
                        >
                          <Plus className="w-3.5 h-3.5" /> Create First Invoice
                        </Button>
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-100 text-slate-600 font-semibold">
                            <tr>
                              <th className="p-2.5">Invoice No.</th>
                              <th className="p-2.5">Date</th>
                              <th className="p-2.5">Due Date</th>
                              <th className="p-2.5 text-right">Grand Total</th>
                              <th className="p-2.5 text-right">Paid</th>
                              <th className="p-2.5 text-right">Outstanding</th>
                              <th className="p-2.5">Status</th>
                              <th className="p-2.5 text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {projectWorkspace.invoices.map((inv) => (
                              <tr key={inv.id} className="hover:bg-slate-50">
                                <td
                                  className="p-2.5 font-bold font-mono text-blue-700 hover:underline cursor-pointer"
                                  onClick={() => {
                                    setSelectedInvoiceDetail(inv);
                                    setInvoiceDetailOpen(true);
                                  }}
                                  title="Click to view invoice details"
                                >
                                  {inv.invoice_number}
                                </td>
                                <td className="p-2.5 font-medium whitespace-nowrap">{inv.invoice_date}</td>
                                <td className="p-2.5 text-slate-500 whitespace-nowrap">{inv.due_date || "—"}</td>
                                <td className="p-2.5 text-right font-bold text-slate-900 font-mono">
                                  ₹{Number(inv.grand_total).toLocaleString("en-IN")}
                                </td>
                                <td className="p-2.5 text-right font-bold text-emerald-700 font-mono">
                                  ₹{Number(inv.paid_amount || 0).toLocaleString("en-IN")}
                                </td>
                                <td className="p-2.5 text-right font-bold text-amber-700 font-mono">
                                  ₹{Number(inv.outstanding_amount || 0).toLocaleString("en-IN")}
                                </td>
                                <td className="p-2.5">
                                  <Badge
                                    variant="outline"
                                    className={
                                      inv.status === "Draft"
                                        ? "bg-slate-100 text-slate-700 border-slate-300 text-[10px] font-semibold"
                                        : inv.status === "Paid"
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                                        : inv.status === "Partially Paid"
                                        ? "bg-blue-50 text-blue-700 border-blue-200 text-[10px]"
                                        : inv.status === "Overdue"
                                        ? "bg-rose-50 text-rose-700 border-rose-200 text-[10px]"
                                        : inv.status === "Cancelled"
                                        ? "bg-slate-100 text-slate-400 border-slate-200 text-[10px]"
                                        : "bg-amber-50 text-amber-700 border-amber-200 text-[10px]"
                                    }
                                  >
                                    {inv.status}
                                  </Badge>
                                </td>
                                <td className="p-2.5 text-center whitespace-nowrap">
                                  <div className="flex items-center justify-center gap-1">
                                    {inv.status === "Draft" && (
                                      <Button
                                        size="xs"
                                        variant="outline"
                                        onClick={() => handleOpenCreateInvoice(activeProjectId, inv.doc_type || "tax_invoice", projectWorkspace?.client, projectWorkspace?.project, inv)}
                                        className="h-6 px-2 text-[11px] gap-1 text-blue-700 border-blue-300 hover:bg-blue-50 font-semibold"
                                        title="Edit / Finalize Draft"
                                      >
                                        <Edit3 className="w-3 h-3 text-blue-600" /> Edit Draft
                                      </Button>
                                    )}
                                    <Button
                                      size="xs"
                                      variant="outline"
                                      onClick={() => handleDownloadInvoiceDoc(inv, "pdf")}
                                      className="h-6 px-2 text-[11px] gap-1 text-slate-700 border-slate-300 hover:bg-slate-100"
                                      title="Download PDF Invoice"
                                    >
                                      <Download className="w-3 h-3 text-blue-600" /> PDF
                                    </Button>
                                    <Button
                                      size="xs"
                                      variant="outline"
                                      onClick={() => handleDownloadInvoiceDoc(inv, "docx")}
                                      className="h-6 px-2 text-[11px] gap-1 text-slate-700 border-slate-300 hover:bg-slate-100"
                                      title="Download Word Invoice (.docx)"
                                    >
                                      <Download className="w-3 h-3 text-indigo-600" /> Word
                                    </Button>
                                    {inv.status !== "Draft" && inv.status !== "Cancelled" && (
                                      <Button
                                        size="xs"
                                        variant="outline"
                                        onClick={() => {
                                          setSelectedInvoice(inv);
                                          setSelectedPaymentToApply("");
                                          setAllocatedAmountInput(String(inv.outstanding_amount || 0));
                                          setApplyPaymentOpen(true);
                                        }}
                                        className="h-6 px-2 text-[11px] gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                        title="Apply Payment / Details"
                                      >
                                        <CreditCard className="w-3 h-3 text-emerald-600" /> Apply Payment
                                      </Button>
                                    )}
                                    <Button
                                      size="xs"
                                      variant="outline"
                                      onClick={() => setInvoiceToDelete(inv)}
                                      className="h-6 px-2 text-[11px] gap-1 text-rose-700 border-rose-300 hover:bg-rose-50 font-semibold"
                                      title="Delete Invoice"
                                    >
                                      <Trash2 className="w-3 h-3 text-rose-600" /> Delete
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </TabsContent>

                  {/* ─── TAB 4: PAYMENTS ────────────────────────────────────────── */}
                  <TabsContent value="payments" className="space-y-3 pt-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs text-slate-900">Actual Stored Payment Transactions</h4>
                      <Button
                        size="sm"
                        onClick={() => handleOpenAddPayment(activeProjectId)}
                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Payment
                      </Button>
                    </div>

                    {(projectWorkspace?.payments || []).length === 0 ? (
                      <div className="p-6 text-center text-slate-400 text-xs italic bg-slate-50 rounded-xl border">
                        No payment transactions recorded yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-100 text-slate-600 font-semibold">
                            <tr>
                              <th className="p-2.5">Date</th>
                              <th className="p-2.5">Type</th>
                              <th className="p-2.5">Source</th>
                              <th className="p-2.5">Ref / UTR</th>
                              <th className="p-2.5">Applied Invoice</th>
                              <th className="p-2.5">Status</th>
                              <th className="p-2.5 text-right">Amount</th>
                              <th className="p-2.5 text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {projectWorkspace.payments.map((pay) => (
                              <tr key={pay.id} className="hover:bg-slate-50">
                                <td className="p-2.5 font-medium whitespace-nowrap">{pay.payment_date}</td>
                                <td className="p-2.5 font-semibold text-slate-800">{pay.payment_type || pay.milestone_name}</td>
                                <td className="p-2.5">{pay.payment_source || pay.payment_mode}</td>
                                <td className="p-2.5 font-mono text-[11px] text-slate-500">{pay.ref_number || "—"}</td>
                                <td className="p-2.5">
                                  {pay.invoice_no || pay.invoice_id ? (
                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-mono text-[10px]">
                                      {pay.invoice_no || pay.invoice_id}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 text-[10px]">
                                      Unallocated Advance
                                    </Badge>
                                  )}
                                </td>
                                <td className="p-2.5">
                                  <Badge
                                    variant="outline"
                                    className={
                                      pay.status === "Received"
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                                        : pay.status === "Pending"
                                        ? "bg-amber-50 text-amber-700 border-amber-200 text-[10px]"
                                        : "bg-rose-50 text-rose-700 border-rose-200 text-[10px]"
                                    }
                                  >
                                    {pay.status || "Received"}
                                  </Badge>
                                </td>
                                <td className="p-2.5 text-right font-bold text-emerald-700 font-mono">
                                  ₹{Number(pay.amount).toLocaleString("en-IN")}
                                </td>
                                <td className="p-2.5 text-center whitespace-nowrap">
                                  <div className="flex items-center justify-center gap-1">
                                    {pay.status === "Pending" && (
                                      <Button
                                        size="xs"
                                        variant="outline"
                                        onClick={() => handleOpenAddPayment(activeProjectId, pay)}
                                        className="h-6 text-[10px] px-2 bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100 font-semibold"
                                        title="Record / Receive Payment"
                                      >
                                        Receive
                                      </Button>
                                    )}
                                    <Button
                                      size="xs"
                                      variant="ghost"
                                      onClick={() => handleOpenEditPayment(pay)}
                                      className="h-6 w-6 p-0 text-slate-500 hover:text-blue-600"
                                      title="Edit Payment"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                      size="xs"
                                      variant="ghost"
                                      onClick={() => {
                                        if (window.confirm("Delete this payment transaction?")) {
                                          deletePaymentMutation.mutate(pay.id);
                                        }
                                      }}
                                      className="h-6 w-6 p-0 text-slate-500 hover:text-rose-600"
                                      title="Delete Payment"
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
                  </TabsContent>

                  {/* ─── TAB 5: LOAN / FINANCE ──────────────────────────────────── */}
                  <TabsContent value="loan_finance" className="space-y-3 pt-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs text-slate-900">Loan & Finance Lifecycle Tracking</h4>
                      <Button
                        size="sm"
                        onClick={() => handleOpenAddLoan(activeProjectId)}
                        className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> + Add Loan
                      </Button>
                    </div>

                    <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                      <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Strict Loan Accounting Rule:</strong> A planned or approved loan is <em>NOT</em> automatically a received payment.
                        Only the <strong>Actual Disbursed Amount</strong> counts toward Actual Received.
                      </div>
                    </div>

                    {(projectWorkspace?.loans || []).length === 0 ? (
                      <div className="p-6 text-center text-slate-400 text-xs italic bg-slate-50 rounded-xl border">
                        No loan records logged for this project.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {projectWorkspace.loans.map((loan) => {
                          const isRecorded = loan.payment_recorded || (projectWorkspace?.payments || []).some(p => p.loan_id === loan.id && (p.status || "Received").toLowerCase() === "received");
                          return (
                            <div key={loan.id} className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2 text-xs">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-bold text-sm text-slate-900">{loan.provider}</div>
                                  <div className="text-slate-500 text-[11px]">Loan Ref: {loan.loan_ref || "—"}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px]">
                                    {loan.status}
                                  </Badge>
                                  {isRecorded ? (
                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Payment Recorded
                                    </Badge>
                                  ) : (
                                    <Button
                                      size="xs"
                                      onClick={() => handleConvertLoanToPayment(loan)}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] h-6 px-2 gap-1"
                                    >
                                      <DollarSign className="w-3 h-3" /> Record as Received
                                    </Button>
                                  )}
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    onClick={() => handleOpenEditLoan(loan)}
                                    className="h-6 w-6 p-0 text-slate-500 hover:text-blue-600"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    onClick={() => {
                                      if (window.confirm("Delete this loan record?")) {
                                        deleteLoanMutation.mutate(loan.id);
                                      }
                                    }}
                                    className="h-6 w-6 p-0 text-slate-500 hover:text-rose-600"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100 text-[11px]">
                                <div>
                                  <span className="text-slate-400 block">Loan Requested</span>
                                  <strong className="text-slate-700">₹{(loan.loan_amount || 0).toLocaleString("en-IN")}</strong>
                                </div>
                                <div>
                                  <span className="text-slate-400 block">Approved Amount</span>
                                  <strong className="text-indigo-700">₹{(loan.approved_amount || 0).toLocaleString("en-IN")}</strong>
                                </div>
                                <div>
                                  <span className="text-slate-400 block">Actual Disbursed</span>
                                  <strong className="text-emerald-700">₹{(loan.disbursed_amount || 0).toLocaleString("en-IN")}</strong>
                                </div>
                              </div>
                              {(loan.approved_date || loan.expected_disbursement_date || loan.remarks) && (
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                  {loan.approved_date && <span><strong>Approved Date:</strong> {loan.approved_date}</span>}
                                  {loan.expected_disbursement_date && <span><strong>Expected Disb.:</strong> {loan.expected_disbursement_date}</span>}
                                  {loan.remarks && <span className="italic">"{loan.remarks}"</span>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>

                  {/* ─── TAB 6: EXPENSES ────────────────────────────────────────── */}
                  <TabsContent value="expenses" className="space-y-3 pt-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs text-slate-900">Direct Project Expenses</h4>
                      <Button
                        size="sm"
                        onClick={() => handleOpenAddExpense(activeProjectId)}
                        className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Log Expense
                      </Button>
                    </div>

                    {(projectWorkspace?.expenses || []).length === 0 ? (
                      <div className="p-6 text-center text-slate-400 text-xs italic bg-slate-50 rounded-xl border">
                        No direct project expenses logged yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-100 text-slate-600 font-semibold">
                            <tr>
                              <th className="p-2.5">Date</th>
                              <th className="p-2.5">Category</th>
                              <th className="p-2.5">Vendor</th>
                              <th className="p-2.5">Mode</th>
                              <th className="p-2.5 text-right">Amount</th>
                              <th className="p-2.5 text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {projectWorkspace.expenses.map((exp) => (
                              <tr key={exp.id} className="hover:bg-slate-50">
                                <td className="p-2.5 font-medium whitespace-nowrap">{exp.expense_date || (exp.created_at || "").slice(0, 10)}</td>
                                <td className="p-2.5 font-semibold text-slate-800">{exp.category}</td>
                                <td className="p-2.5 text-slate-600">{exp.vendor_name || "—"}</td>
                                <td className="p-2.5">{exp.payment_mode || "Cash/UPI"}</td>
                                <td className="p-2.5 text-right font-bold text-amber-700 font-mono">
                                  ₹{Number(exp.amount).toLocaleString("en-IN")}
                                </td>
                                <td className="p-2.5 text-center whitespace-nowrap">
                                  <div className="flex items-center justify-center gap-1">
                                    <Button
                                      size="xs"
                                      variant="ghost"
                                      onClick={() => handleOpenEditExpense(exp)}
                                      className="h-6 w-6 p-0 text-slate-500 hover:text-blue-600"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button
                                      size="xs"
                                      variant="ghost"
                                      onClick={() => {
                                        if (window.confirm("Delete this expense record?")) {
                                          deleteExpenseMutation.mutate(exp.id);
                                        }
                                      }}
                                      className="h-6 w-6 p-0 text-slate-500 hover:text-rose-600"
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
                  </TabsContent>

                  {/* ─── TAB 7: PROFITABILITY ───────────────────────────────────── */}
                  <TabsContent value="profitability" className="space-y-4 pt-3">
                    {!projectWorkspace?.summary?.has_cost_data ? (
                      <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                        <PieChart className="w-8 h-8 text-slate-400 mx-auto" />
                        <h4 className="font-bold text-slate-700 text-sm">Profitability not calculated</h4>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                          No direct project expenses have been logged for this project yet. Log expenses under the Expenses tab to calculate actual gross profit.
                        </p>
                      </div>
                    ) : (
                      <Card className="border-slate-200 shadow-2xs">
                        <CardContent className="p-4 space-y-3">
                          <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider border-b border-slate-100 pb-2">
                            Project Gross Profitability
                          </h4>
                          <div className="space-y-2 text-xs font-mono">
                            <div className="flex justify-between py-1">
                              <span className="font-sans text-slate-600">Contract Value</span>
                              <span className="font-bold text-slate-900">
                                ₹{(projectWorkspace?.summary?.project_value || 0).toLocaleString("en-IN")}
                              </span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-100">
                              <span className="font-sans text-slate-600">Actual Project Expenses</span>
                              <span className="font-bold text-amber-700">
                                -₹{(projectWorkspace?.summary?.total_expense || 0).toLocaleString("en-IN")}
                              </span>
                            </div>
                            <div className="flex justify-between py-2 bg-indigo-50/70 px-3 rounded-lg font-bold text-sm text-indigo-900">
                              <span className="font-sans">Gross Profit</span>
                              <span>
                                ₹{(projectWorkspace?.summary?.estimated_profit || 0).toLocaleString("en-IN")}
                              </span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>

                  {/* ─── TAB 8: DOCUMENTS ───────────────────────────────────────── */}
                  <TabsContent value="documents" className="space-y-3 pt-3">
                    <div className="p-6 text-center text-slate-400 text-xs italic bg-slate-50 rounded-xl border">
                      No project documents attached yet.
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}

            <DialogFooter className="border-t border-slate-100 pt-3">
              <Button variant="outline" size="sm" onClick={() => setActiveProjectId(null)}>
                Close Workspace
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── CREATE INVOICE DIALOG ────────────────────────────────────────── */}
      {createInvoiceOpen && (
        <Dialog open={createInvoiceOpen} onOpenChange={setCreateInvoiceOpen}>
          <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto rounded-xl p-6">
            <DialogHeader className="border-b border-slate-100 pb-3">
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-lg">
                <FileText className="w-5 h-5 text-blue-600" />
                {invoiceForm.id ? "Edit " : "Create "}
                {invoiceForm.doc_type === "tax_invoice" && "Invoice"}
                {invoiceForm.doc_type === "proforma" && "Proforma Invoice"}
                {invoiceForm.doc_type === "payment_receipt" && "Payment Receipt"}
                {invoiceForm.doc_type === "credit_note" && "Credit Note"}
                {invoiceForm.doc_type === "debit_note" && "Debit Note"}
                {invoiceForm.status === "Draft" && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-xs font-semibold uppercase ml-1">
                    Draft
                  </Badge>
                )}
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-semibold uppercase ml-1">
                  {invoiceForm.doc_type === "tax_invoice" ? "Tax Invoice" : invoiceForm.doc_type.replace("_", " ")}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                {invoiceForm.id
                  ? "Update saved invoice details or finalize and generate the tax invoice document."
                  : invoiceForm.doc_type === "tax_invoice"
                  ? "Generate GST-compliant Tax Invoice for customer project billing."
                  : "Create billing & financial documents with full tax compliance."}
              </DialogDescription>

              {/* DOCUMENT TYPE SELECTOR TABS */}
              <div className="flex items-center gap-1.5 pt-3 overflow-x-auto">
                {[
                  { id: "tax_invoice", label: "Tax Invoice", prefix: "INV" },
                  { id: "proforma", label: "Proforma Invoice", prefix: "PI" },
                  { id: "payment_receipt", label: "Payment Receipt", prefix: "REC" },
                  { id: "credit_note", label: "Credit Note", prefix: "CN" },
                  { id: "debit_note", label: "Debit Note", prefix: "DN" }
                ].map((dt) => (
                  <button
                    key={dt.id}
                    type="button"
                    onClick={() => {
                      const newPrefix = dt.prefix;
                      const newNum = `${newPrefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;
                      setInvoiceForm((prev) => ({
                        ...prev,
                        doc_type: dt.id,
                        invoice_number: newNum
                      }));
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                      invoiceForm.doc_type === dt.id
                        ? "bg-blue-600 text-white shadow-2xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {dt.label}
                  </button>
                ))}
              </div>
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!invoiceForm.client_name.trim()) {
                  toast.error("Please select or specify a client.");
                  return;
                }
                if (!invoiceForm.grand_total || Number(invoiceForm.grand_total) <= 0) {
                  toast.error("Invoice grand total must be greater than zero.");
                  return;
                }

                const rawAmtRec = invoiceForm.amount_received;
                const cleanAmountReceived = typeof rawAmtRec === "number"
                  ? rawAmtRec
                  : (parseFloat(String(rawAmtRec || "0").replace(/[^0-9.]/g, "")) || 0);

                if (cleanAmountReceived < 0) {
                  toast.error("Amount received cannot be negative.");
                  return;
                }

                if (cleanAmountReceived > invoiceForm.grand_total) {
                  toast.error(`Amount received (₹${cleanAmountReceived.toLocaleString("en-IN")}) cannot exceed Grand Total (₹${invoiceForm.grand_total.toLocaleString("en-IN")}).`);
                  return;
                }

                const payload = {
                  ...invoiceForm,
                  amount_received: cleanAmountReceived,
                  status: "Sent"
                };

                createInvoiceMutation.mutate(payload);
              }}
              className="py-3 text-xs space-y-5"
            >
              {/* SECTION A — CLIENT SUMMARY & DOCUMENT METADATA */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                {/* CLIENT SUMMARY CARD */}
                <div className="md:col-span-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-slate-800 uppercase tracking-wider">Client / Customer</Label>
                    {!invoiceForm.is_locked_client && (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => setChangeClientModalOpen(true)}
                        className="h-6 text-[11px] text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        {invoiceForm.client_id ? "Change Client" : "Select Client"}
                      </Button>
                    )}
                  </div>

                  {invoiceForm.client_name ? (
                    <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs space-y-1">
                      <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        <User className="w-4 h-4 text-blue-600 shrink-0" />
                        <span className="truncate">{invoiceForm.client_name}</span>
                      </div>
                      {clientsList.find((c) => c.id === invoiceForm.client_id) && (
                        <div className="text-[11px] text-slate-500 space-y-0.5 font-mono">
                          {clientsList.find((c) => c.id === invoiceForm.client_id)?.sol_id && (
                            <div>SOL ID: {clientsList.find((c) => c.id === invoiceForm.client_id)?.sol_id}</div>
                          )}
                          {clientsList.find((c) => c.id === invoiceForm.client_id)?.mobile && (
                            <div>Phone: {clientsList.find((c) => c.id === invoiceForm.client_id)?.mobile}</div>
                          )}
                          {clientsList.find((c) => c.id === invoiceForm.client_id)?.gstin && (
                            <div className="text-blue-700 font-semibold">GSTIN: {clientsList.find((c) => c.id === invoiceForm.client_id)?.gstin}</div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      onClick={() => {
                        if (!invoiceForm.is_locked_client) setChangeClientModalOpen(true);
                      }}
                      className={`p-4 bg-white rounded-lg border border-dashed border-slate-300 text-center text-slate-500 space-y-1 ${!invoiceForm.is_locked_client ? 'hover:border-blue-400 cursor-pointer' : ''}`}
                    >
                      <User className="w-5 h-5 mx-auto text-slate-400" />
                      <div className="font-semibold text-xs text-blue-600">Click to Select Client</div>
                    </div>
                  )}
                </div>

                {/* METADATA, PAYMENT TERMS & GST TOGGLE */}
                <div className="md:col-span-2 space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">Document No.</Label>
                      <Input
                        value={invoiceForm.invoice_number}
                        onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_number: e.target.value })}
                        className="mt-1 h-8 text-xs font-mono font-bold bg-white"
                        required
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold text-slate-700">Invoice Date</Label>
                      <Input
                        type="date"
                        value={invoiceForm.invoice_date}
                        onChange={(e) => {
                          const d = e.target.value;
                          let dueD = invoiceForm.due_date;
                          if (invoiceForm.payment_terms.includes("Days")) {
                            const days = parseInt(invoiceForm.payment_terms, 10) || 15;
                            dueD = new Date(new Date(d).getTime() + days * 86400000).toISOString().split("T")[0];
                          }
                          setInvoiceForm({ ...invoiceForm, invoice_date: d, due_date: dueD });
                        }}
                        className="mt-1 h-8 text-xs bg-white"
                        required
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold text-slate-700">Payment Terms</Label>
                      <Select
                        value={invoiceForm.payment_terms}
                        onValueChange={(term) => {
                          let days = 0;
                          if (term === "7 Days") days = 7;
                          else if (term === "15 Days") days = 15;
                          else if (term === "30 Days") days = 30;
                          else if (term === "45 Days") days = 45;

                          const dueD = days > 0
                            ? new Date(new Date(invoiceForm.invoice_date).getTime() + days * 86400000).toISOString().split("T")[0]
                            : invoiceForm.invoice_date;

                          setInvoiceForm((prev) => ({
                            ...prev,
                            payment_terms: term,
                            due_date: dueD
                          }));
                        }}
                      >
                        <SelectTrigger className="mt-1 text-xs h-8 bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent className="text-xs">
                          <SelectItem value="Due on Receipt">Due on Receipt</SelectItem>
                          <SelectItem value="7 Days">7 Days Net</SelectItem>
                          <SelectItem value="15 Days">15 Days Net</SelectItem>
                          <SelectItem value="30 Days">30 Days Net</SelectItem>
                          <SelectItem value="45 Days">45 Days Net</SelectItem>
                          <SelectItem value="Custom">Custom Date</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold text-slate-700">Due Date</Label>
                      <Input
                        type="date"
                        value={invoiceForm.due_date}
                        onChange={(e) => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })}
                        className="mt-1 h-8 text-xs bg-white"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold text-slate-700">Place of Supply</Label>
                      <Input
                        value={invoiceForm.place_of_supply}
                        onChange={(e) => setInvoiceForm({ ...invoiceForm, place_of_supply: e.target.value })}
                        placeholder="e.g. Maharashtra"
                        className="mt-1 h-8 text-xs bg-white"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold text-slate-700">Tax Type</Label>
                      <Select
                        disabled={!invoiceForm.gst_applicable}
                        value={invoiceForm.is_intra_state ? "intra" : "inter"}
                        onValueChange={(val) => {
                          const isIntra = (val === "intra");
                          updateInvoiceFormCalculations(
                            invoiceForm.items,
                            invoiceForm.discount,
                            isIntra,
                            isIntra ? 9 : 0,
                            isIntra ? 9 : 0,
                            !isIntra ? 18 : 0,
                            invoiceForm.freight,
                            invoiceForm.round_off,
                            invoiceForm.gst_applicable
                          );
                        }}
                      >
                        <SelectTrigger className="mt-1 text-xs h-8 bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent className="text-xs">
                          <SelectItem value="intra">Intra-state (CGST 9% + SGST 9%)</SelectItem>
                          <SelectItem value="inter">Inter-state (IGST 18%)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* GST APPLICABLE SEGMENTED TOGGLE */}
                  <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">GST Configuration</span>
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                      <button
                        type="button"
                        onClick={() => {
                          updateInvoiceFormCalculations(
                            invoiceForm.items,
                            invoiceForm.discount,
                            invoiceForm.is_intra_state,
                            invoiceForm.is_intra_state ? 9 : 0,
                            invoiceForm.is_intra_state ? 9 : 0,
                            !invoiceForm.is_intra_state ? 18 : 0,
                            invoiceForm.freight,
                            invoiceForm.round_off,
                            true
                          );
                        }}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                          invoiceForm.gst_applicable ? "bg-emerald-600 text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        GST Applicable
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateInvoiceFormCalculations(
                            invoiceForm.items,
                            invoiceForm.discount,
                            invoiceForm.is_intra_state,
                            0,
                            0,
                            0,
                            invoiceForm.freight,
                            invoiceForm.round_off,
                            false
                          );
                        }}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                          !invoiceForm.gst_applicable ? "bg-slate-800 text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        No GST
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION B — INVOICE LINE ITEMS TABLE */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    Line Items
                    <Badge variant="secondary" className="text-[10px] font-mono">{invoiceForm.items.length} Items</Badge>
                  </Label>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        setActiveItemIndexForProduct(null);
                        setProductSearchModalOpen(true);
                      }}
                      className="h-7 text-xs text-indigo-600 border-indigo-200 bg-indigo-50/50 hover:bg-indigo-100 gap-1"
                    >
                      <Search className="w-3.5 h-3.5" /> Search Product Master
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={handleAddInvoiceItem}
                      className="h-7 text-xs text-blue-600 gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Custom Item
                    </Button>
                  </div>
                </div>

                {/* DESKTOP TABLE */}
                <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5 w-3/12">Product / Service Description</th>
                        <th className="p-2.5 w-1.5/12">HSN/SAC</th>
                        <th className="p-2.5 w-1.5/12">Spec / Size</th>
                        <th className="p-2.5 w-1/12 text-center">Qty</th>
                        <th className="p-2.5 w-1/12 text-center">Unit</th>
                        <th className="p-2.5 w-1.5/12 text-right">Rate (₹)</th>
                        {invoiceForm.gst_applicable && <th className="p-2.5 w-1/12 text-center">GST %</th>}
                        <th className="p-2.5 w-1.5/12 text-right">Taxable (₹)</th>
                        <th className="p-2.5 w-1.5/12 text-right">Line Total (₹)</th>
                        <th className="p-2.5 w-1 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {invoiceForm.items.map((item, idx) => {
                        const qty = Number(item.quantity) || 0;
                        const rate = Number(item.rate) || 0;
                        const disc = Number(item.discount) || 0;
                        const taxable = Math.max(0, qty * rate - disc);
                        const gstPct = invoiceForm.gst_applicable ? (Number(item.gst_rate) || 0) : 0;
                        const lineTotal = taxable + (taxable * gstPct) / 100;
                        return (
                          <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-2">
                              <Input
                                value={item.product_name}
                                onChange={(e) => handleInvoiceItemChange(idx, "product_name", e.target.value)}
                                placeholder="Description or Product Name"
                                className="h-8 text-xs bg-white border-slate-300"
                                required
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                value={item.hsn_sac || ""}
                                onChange={(e) => handleInvoiceItemChange(idx, "hsn_sac", e.target.value)}
                                placeholder="e.g. 9954"
                                className="h-8 text-xs font-mono bg-white border-slate-300"
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                value={item.size || ""}
                                onChange={(e) => handleInvoiceItemChange(idx, "size", e.target.value)}
                                placeholder="e.g. System"
                                className="h-8 text-xs bg-white border-slate-300"
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                min="0.01"
                                step="any"
                                value={item.quantity}
                                onChange={(e) => handleInvoiceItemChange(idx, "quantity", e.target.value)}
                                className="h-8 text-xs text-center font-mono bg-white border-slate-300"
                                required
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                value={item.unit || "Nos"}
                                onChange={(e) => handleInvoiceItemChange(idx, "unit", e.target.value)}
                                placeholder="Unit"
                                className="h-8 text-xs text-center bg-white border-slate-300"
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                value={item.rate}
                                onChange={(e) => handleInvoiceItemChange(idx, "rate", e.target.value)}
                                className="h-8 text-xs text-right font-mono font-semibold bg-white border-slate-300"
                                required
                              />
                            </td>
                            {invoiceForm.gst_applicable && (
                              <td className="p-2">
                                <Input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={item.gst_rate}
                                  onChange={(e) => handleInvoiceItemChange(idx, "gst_rate", e.target.value)}
                                  className="h-8 text-xs text-center font-mono bg-white border-slate-300"
                                />
                              </td>
                            )}
                            <td className="p-2 text-right font-mono text-slate-700 font-medium">
                              ₹{taxable.toLocaleString("en-IN")}
                            </td>
                            <td className="p-2 text-right font-bold font-mono text-slate-900">
                              ₹{lineTotal.toLocaleString("en-IN")}
                            </td>
                            <td className="p-2 text-center">
                              <Button
                                type="button"
                                size="xs"
                                variant="ghost"
                                onClick={() => handleRemoveInvoiceItem(idx)}
                                className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              >
                                ×
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* MOBILE STACKED CARDS */}
                <div className="md:hidden space-y-3">
                  {invoiceForm.items.map((item, idx) => {
                    const qty = Number(item.quantity) || 0;
                    const rate = Number(item.rate) || 0;
                    const disc = Number(item.discount) || 0;
                    const taxable = Math.max(0, qty * rate - disc);
                    const gstPct = invoiceForm.gst_applicable ? (Number(item.gst_rate) || 0) : 0;
                    const lineTotal = taxable + (taxable * gstPct) / 100;
                    return (
                      <div key={idx} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <span className="font-bold text-xs text-slate-900">Line Item #{idx + 1}</span>
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            onClick={() => handleRemoveInvoiceItem(idx)}
                            className="h-6 px-2 text-xs text-rose-600 hover:bg-rose-50"
                          >
                            Remove
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <div>
                            <Label className="text-[11px] font-semibold text-slate-600">Product / Service</Label>
                            <Input
                              value={item.product_name}
                              onChange={(e) => handleInvoiceItemChange(idx, "product_name", e.target.value)}
                              placeholder="Product or Service Name"
                              className="h-8 text-xs mt-0.5"
                              required
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-[11px] font-semibold text-slate-600">HSN/SAC</Label>
                              <Input
                                value={item.hsn_sac || ""}
                                onChange={(e) => handleInvoiceItemChange(idx, "hsn_sac", e.target.value)}
                                placeholder="e.g. 9954"
                                className="h-8 text-xs font-mono mt-0.5"
                              />
                            </div>
                            <div>
                              <Label className="text-[11px] font-semibold text-slate-600">Specification</Label>
                              <Input
                                value={item.size || ""}
                                onChange={(e) => handleInvoiceItemChange(idx, "size", e.target.value)}
                                placeholder="e.g. System"
                                className="h-8 text-xs mt-0.5"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <Label className="text-[11px] font-semibold text-slate-600">Quantity</Label>
                              <Input
                                type="number"
                                min="0.01"
                                step="any"
                                value={item.quantity}
                                onChange={(e) => handleInvoiceItemChange(idx, "quantity", e.target.value)}
                                className="h-8 text-xs text-center font-mono mt-0.5"
                                required
                              />
                            </div>
                            <div>
                              <Label className="text-[11px] font-semibold text-slate-600">Unit</Label>
                              <Input
                                value={item.unit || "Nos"}
                                onChange={(e) => handleInvoiceItemChange(idx, "unit", e.target.value)}
                                className="h-8 text-xs text-center mt-0.5"
                              />
                            </div>
                            <div>
                              <Label className="text-[11px] font-semibold text-slate-600">Rate (₹)</Label>
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                value={item.rate}
                                onChange={(e) => handleInvoiceItemChange(idx, "rate", e.target.value)}
                                className="h-8 text-xs text-right font-mono font-semibold mt-0.5"
                                required
                              />
                            </div>
                          </div>

                          {invoiceForm.gst_applicable && (
                            <div>
                              <Label className="text-[11px] font-semibold text-slate-600">GST %</Label>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                value={item.gst_rate}
                                onChange={(e) => handleInvoiceItemChange(idx, "gst_rate", e.target.value)}
                                className="h-8 text-xs font-mono mt-0.5"
                              />
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100 text-xs font-mono">
                            <div>
                              <div className="text-[10px] text-slate-500 font-sans">Taxable Value</div>
                              <div className="font-bold text-slate-900">₹{taxable.toLocaleString("en-IN")}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-slate-500 font-sans">Line Total</div>
                              <div className="font-bold text-blue-900">₹{lineTotal.toLocaleString("en-IN")}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SECTION C — TAXES & TOTALS BREAKDOWN */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-800">Invoice Terms & Payment Notes</Label>
                    <Textarea
                      value={invoiceForm.notes}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })}
                      rows={3}
                      placeholder="Invoice terms, bank details, payment instructions..."
                      className="text-xs bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px] font-semibold text-slate-600">Freight / Shipping (₹)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={invoiceForm.freight}
                        onChange={(e) => updateInvoiceFormCalculations(invoiceForm.items, invoiceForm.discount, invoiceForm.is_intra_state, invoiceForm.cgst_rate, invoiceForm.sgst_rate, invoiceForm.igst_rate, e.target.value, invoiceForm.round_off)}
                        className="h-7 text-xs text-right font-mono bg-white mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] font-semibold text-slate-600">Round Off (₹)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={invoiceForm.round_off}
                        onChange={(e) => updateInvoiceFormCalculations(invoiceForm.items, invoiceForm.discount, invoiceForm.is_intra_state, invoiceForm.cgst_rate, invoiceForm.sgst_rate, invoiceForm.igst_rate, invoiceForm.freight, e.target.value)}
                        className="h-7 text-xs text-right font-mono bg-white mt-1"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2 font-mono text-xs bg-white p-3.5 rounded-lg border border-slate-200">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="font-sans text-slate-600">Subtotal</span>
                    <span className="font-bold text-slate-900">₹{invoiceForm.subtotal.toLocaleString("en-IN")}</span>
                  </div>

                  {invoiceForm.discount > 0 && (
                    <div className="flex justify-between py-1 border-b border-slate-100 text-rose-600">
                      <span className="font-sans">Discount</span>
                      <span className="font-bold">-₹{invoiceForm.discount.toLocaleString("en-IN")}</span>
                    </div>
                  )}

                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="font-sans text-slate-600">Taxable Amount</span>
                    <span className="font-bold text-slate-900">₹{invoiceForm.taxable_amount.toLocaleString("en-IN")}</span>
                  </div>

                  {invoiceForm.gst_applicable ? (
                    invoiceForm.is_intra_state ? (
                      <>
                        <div className="flex justify-between py-1 border-b border-slate-100 text-slate-700">
                          <span className="font-sans">CGST ({invoiceForm.cgst_rate}%)</span>
                          <span>₹{(((invoiceForm.taxable_amount) * invoiceForm.cgst_rate) / 100).toLocaleString("en-IN")}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-100 text-slate-700">
                          <span className="font-sans">SGST ({invoiceForm.sgst_rate}%)</span>
                          <span>₹{(((invoiceForm.taxable_amount) * invoiceForm.sgst_rate) / 100).toLocaleString("en-IN")}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between py-1 border-b border-slate-100 text-slate-700">
                        <span className="font-sans">IGST ({invoiceForm.igst_rate}%)</span>
                        <span>₹{(((invoiceForm.taxable_amount) * invoiceForm.igst_rate) / 100).toLocaleString("en-IN")}</span>
                      </div>
                    )
                  ) : (
                    <div className="flex justify-between py-1 border-b border-slate-100 text-slate-500 italic">
                      <span className="font-sans">GST Status</span>
                      <span>Not Applicable (₹0)</span>
                    </div>
                  )}

                  {invoiceForm.freight > 0 && (
                    <div className="flex justify-between py-1 border-b border-slate-100 text-slate-700">
                      <span className="font-sans">Freight</span>
                      <span>₹{invoiceForm.freight.toLocaleString("en-IN")}</span>
                    </div>
                  )}

                  <div className="flex justify-between py-2 border-t-2 border-slate-300 font-bold text-base bg-blue-50/80 p-2.5 rounded text-blue-900 mt-2">
                    <span className="font-sans">Grand Total</span>
                    <span>₹{invoiceForm.grand_total.toLocaleString("en-IN")}</span>
                  </div>

                  {/* INITIAL AMOUNT RECEIVED & BALANCE DUE BREAKDOWN */}
                  <div className="pt-3 border-t border-slate-200 mt-2 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs font-semibold text-slate-700 font-sans">Amount Received Now (₹)</Label>
                      <Input
                        type="number"
                        min="0"
                        max={invoiceForm.grand_total}
                        step="any"
                        value={invoiceForm.amount_received !== undefined && invoiceForm.amount_received !== null ? invoiceForm.amount_received : 0}
                        onChange={(e) => setInvoiceForm({ ...invoiceForm, amount_received: e.target.value })}
                        placeholder="0.00"
                        className="h-8 text-xs font-mono font-bold bg-white text-emerald-700 border-slate-300 w-36 text-right"
                      />
                    </div>

                    <div className="flex justify-between py-1 text-xs font-bold text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                      <span className="font-sans">Balance Due</span>
                      <span>
                        ₹{Math.max(0, invoiceForm.grand_total - (parseFloat(String(invoiceForm.amount_received || "0").replace(/[^0-9.]/g, "")) || 0)).toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const rawAmtRec = invoiceForm.amount_received;
                    const cleanAmountReceived = typeof rawAmtRec === "number"
                      ? rawAmtRec
                      : (parseFloat(String(rawAmtRec || "0").replace(/[^0-9.]/g, "")) || 0);

                    const payload = {
                      ...invoiceForm,
                      amount_received: cleanAmountReceived,
                      status: "Draft"
                    };
                    createInvoiceMutation.mutate(payload);
                  }}
                  disabled={createInvoiceMutation.isPending}
                  className="text-slate-700 border-slate-300"
                >
                  Save Draft
                </Button>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setCreateInvoiceOpen(false)} disabled={createInvoiceMutation.isPending}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={createInvoiceMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-2xs">
                    {createInvoiceMutation.isPending ? "Generating Document..." : "Generate Invoice"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

        {/* ─── SEARCHABLE CLIENT SELECTOR DIALOG ───────────────────────────── */}
        <Dialog open={changeClientModalOpen} onOpenChange={setChangeClientModalOpen}>
          <DialogContent className="max-w-md rounded-xl p-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-bold text-slate-900">
                <User className="w-5 h-5 text-blue-600" /> Select / Change Client
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <Input
                  placeholder="Search by Client Name, Mobile, SOL ID, Consumer No..."
                  value={clientSearchTerm}
                  onChange={(e) => setClientSearchTerm(e.target.value)}
                  className="pl-9 text-xs h-9 bg-white"
                  autoFocus
                />
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                {clientsList
                  .filter((c) => {
                    const q = clientSearchTerm.toLowerCase().trim();
                    if (!q) return true;
                    return (
                      (c.full_name || "").toLowerCase().includes(q) ||
                      (c.mobile || "").includes(q) ||
                      (c.sol_id || "").toLowerCase().includes(q) ||
                      (c.consumer_number || "").toLowerCase().includes(q)
                    );
                  })
                  .map((c) => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setInvoiceForm((prev) => ({
                          ...prev,
                          client_id: c.id,
                          client_name: c.full_name,
                          buyer_gstin: c.gstin || "",
                          place_of_supply: c.state || prev.place_of_supply
                        }));
                        setChangeClientModalOpen(false);
                        setClientSearchTerm("");
                      }}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors text-xs flex items-center justify-between ${
                        invoiceForm.client_id === c.id
                          ? "bg-blue-50 border-blue-300 font-semibold text-blue-900"
                          : "bg-white border-slate-200 hover:bg-slate-50 text-slate-800"
                      }`}
                    >
                      <div>
                        <div className="font-bold text-slate-900">{c.full_name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {c.sol_id ? `SOL: ${c.sol_id} · ` : ""}Phone: {c.mobile || "N/A"} {c.consumer_number ? `· Consumer: ${c.consumer_number}` : ""}
                        </div>
                      </div>
                      {invoiceForm.client_id === c.id && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                    </div>
                  ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ─── SEARCHABLE PRODUCT MASTER SELECTOR DIALOG ────────────────────── */}
        <Dialog open={productSearchModalOpen} onOpenChange={setProductSearchModalOpen}>
          <DialogContent className="max-w-md rounded-xl p-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-bold text-slate-900">
                <Layers className="w-5 h-5 text-indigo-600" /> Select Product / Service
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <Input
                  placeholder="Search product name, SKU, spec, HSN..."
                  value={productSearchTerm}
                  onChange={(e) => setProductSearchTerm(e.target.value)}
                  className="pl-9 text-xs h-9 bg-white"
                  autoFocus
                />
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                {productMasterList
                  .filter((p) => {
                    const q = productSearchTerm.toLowerCase().trim();
                    if (!q) return true;
                    return (
                      (p.name || p.product_name || "").toLowerCase().includes(q) ||
                      (p.sku || "").toLowerCase().includes(q) ||
                      (p.size || p.spec || "").toLowerCase().includes(q) ||
                      (p.hsn_sac || "").toLowerCase().includes(q)
                    );
                  })
                  .map((p, idx) => (
                    <div
                      key={p.id || idx}
                      onClick={() => {
                        const newItems = [...invoiceForm.items];
                        const rate = Number(p.selling_price || p.rate || p.unit_price || 0);
                        const itemData = {
                          product_name: p.name || p.product_name || "",
                          hsn_sac: p.hsn_sac || p.hsn || "9954",
                          size: p.size || p.spec || "",
                          quantity: 1,
                          unit: p.unit || "Nos",
                          rate: rate,
                          discount: 0,
                          gst_rate: Number(p.gst_rate || 18),
                          amount: rate
                        };
                        if (activeItemIndexForProduct !== null && activeItemIndexForProduct < newItems.length) {
                          newItems[activeItemIndexForProduct] = itemData;
                        } else {
                          newItems.push(itemData);
                        }
                        updateInvoiceFormCalculations(newItems);
                        setProductSearchModalOpen(false);
                        setProductSearchTerm("");
                        setActiveItemIndexForProduct(null);
                      }}
                      className="p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer transition-colors text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{p.name || p.product_name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {p.size ? `Spec: ${p.size} · ` : ""}Unit: {p.unit || "Nos"} {p.hsn_sac ? `· HSN: ${p.hsn_sac}` : ""}
                        </div>
                      </div>
                      <div className="text-right font-mono font-bold text-slate-900">
                        ₹{Number(p.selling_price || p.rate || 0).toLocaleString("en-IN")}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>

      {/* ─── APPLY PAYMENT / INVOICE ALLOCATION DIALOG ─────────────────────── */}
      {applyPaymentOpen && selectedInvoice && (
        <Dialog open={applyPaymentOpen} onOpenChange={setApplyPaymentOpen}>
          <DialogContent className="max-w-md rounded-xl p-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <CreditCard className="w-5 h-5 text-emerald-600" /> Apply Payment to Invoice #{selectedInvoice.invoice_number}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              {/* Invoice Breakdown */}
              <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-mono text-center">
                <div>
                  <div className="text-[10px] text-slate-400 font-sans">Grand Total</div>
                  <div className="font-bold text-slate-900">₹{selectedInvoice.grand_total.toLocaleString("en-IN")}</div>
                </div>
                <div>
                  <div className="text-[10px] text-emerald-600 font-sans">Paid Amount</div>
                  <div className="font-bold text-emerald-700">₹{selectedInvoice.paid_amount.toLocaleString("en-IN")}</div>
                </div>
                <div>
                  <div className="text-[10px] text-amber-600 font-sans">Outstanding</div>
                  <div className="font-bold text-amber-700">₹{selectedInvoice.outstanding_amount.toLocaleString("en-IN")}</div>
                </div>
              </div>

              {/* Payment Selection */}
              {(projectWorkspace?.unallocated_payments || []).length === 0 ? (
                <div className="p-4 bg-amber-50 text-amber-900 rounded-lg text-xs space-y-1">
                  <strong>No Unallocated Advance Payments:</strong>
                  <div>Record a new payment transaction first, or apply an unallocated payment once received.</div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-semibold">Select Unallocated Payment</Label>
                    <Select value={selectedPaymentToApply} onValueChange={setSelectedPaymentToApply}>
                      <SelectTrigger className="mt-1 text-xs"><SelectValue placeholder="Choose payment..." /></SelectTrigger>
                      <SelectContent className="text-xs">
                        {projectWorkspace.unallocated_payments.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            ₹{p.amount.toLocaleString("en-IN")} — {p.payment_type} ({p.payment_date}) {p.ref_number ? `Ref: ${p.ref_number}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold">
                      Allocated Amount (Max: ₹{selectedInvoice.outstanding_amount.toLocaleString("en-IN")})
                    </Label>
                    <Input
                      type="number"
                      value={allocatedAmountInput}
                      onChange={(e) => setAllocatedAmountInput(e.target.value)}
                      placeholder={String(selectedInvoice.outstanding_amount)}
                      className="mt-1 font-bold font-mono text-xs"
                      required
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" size="sm" onClick={() => setApplyPaymentOpen(false)}>Cancel</Button>
              {(projectWorkspace?.unallocated_payments || []).length > 0 && (
                <Button
                  size="sm"
                  onClick={() => {
                    if (!selectedPaymentToApply) {
                      toast.error("Please select a payment transaction");
                      return;
                    }
                    if (!allocatedAmountInput || Number(allocatedAmountInput) <= 0) {
                      toast.error("Please enter a valid allocation amount");
                      return;
                    }
                    if (Number(allocatedAmountInput) > selectedInvoice.outstanding_amount + 0.01) {
                      toast.error(`Cannot allocate more than invoice outstanding (₹${selectedInvoice.outstanding_amount.toLocaleString("en-IN")})`);
                      return;
                    }
                    applyPaymentMutation.mutate({
                      invoiceId: selectedInvoice.id,
                      paymentId: selectedPaymentToApply,
                      allocatedAmount: allocatedAmountInput
                    });
                  }}
                  disabled={applyPaymentMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
                >
                  {applyPaymentMutation.isPending ? "Allocating..." : "Confirm Allocation"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── FULL INVOICE DETAIL VIEW DIALOG ──────────────────────────────── */}
      {invoiceDetailOpen && selectedInvoiceDetail && (
        <Dialog open={invoiceDetailOpen} onOpenChange={setInvoiceDetailOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl p-6">
            <DialogHeader className="border-b border-slate-100 pb-3 flex flex-row items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-lg">
                  <FileText className="w-5 h-5 text-blue-600" /> Invoice #{selectedInvoiceDetail.invoice_number}
                  <Badge
                    variant="outline"
                    className={`ml-2 text-xs capitalize ${
                      selectedInvoiceDetail.status === "Draft"
                        ? "bg-slate-100 text-slate-700 border-slate-300"
                        : selectedInvoiceDetail.status === "Paid"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                        : selectedInvoiceDetail.status === "Overdue"
                        ? "bg-rose-50 text-rose-700 border-rose-300"
                        : "bg-blue-50 text-blue-700 border-blue-300"
                    }`}
                  >
                    {selectedInvoiceDetail.status || "Sent"}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Type: {(selectedInvoiceDetail.doc_type || "tax_invoice").replace("_", " ").toUpperCase()} · Created {selectedInvoiceDetail.created_at?.slice(0, 10) || selectedInvoiceDetail.invoice_date}
                </DialogDescription>
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex items-center gap-2">
                {selectedInvoiceDetail.status === "Draft" && (
                  <Button
                    size="xs"
                    onClick={() => {
                      setInvoiceDetailOpen(false);
                      handleOpenCreateInvoice(
                        activeProjectId,
                        selectedInvoiceDetail.doc_type || "tax_invoice",
                        projectWorkspace?.client,
                        projectWorkspace?.project,
                        selectedInvoiceDetail
                      );
                    }}
                    className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1.5 shadow-2xs"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit Draft
                  </Button>
                )}

                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => handleDownloadInvoiceDoc(selectedInvoiceDetail, "pdf")}
                  className="h-8 text-xs text-slate-700 border-slate-300 gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600" /> PDF
                </Button>

                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => handleDownloadInvoiceDoc(selectedInvoiceDetail, "docx")}
                  className="h-8 text-xs text-slate-700 border-slate-300 gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-600" /> Word (.docx)
                </Button>

                {selectedInvoiceDetail.status !== "Draft" && selectedInvoiceDetail.status !== "Cancelled" && (
                  <Button
                    size="xs"
                    onClick={() => {
                      setSelectedInvoice(selectedInvoiceDetail);
                      setAllocatedAmountInput(String(selectedInvoiceDetail.outstanding_amount || selectedInvoiceDetail.grand_total));
                      setInvoiceDetailOpen(false);
                      setApplyPaymentOpen(true);
                    }}
                    className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 shadow-2xs"
                  >
                    <CreditCard className="w-3.5 h-3.5" /> Record Payment
                  </Button>
                )}

                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setInvoiceToDelete(selectedInvoiceDetail);
                  }}
                  className="h-8 text-xs text-rose-700 border-rose-300 hover:bg-rose-50 gap-1.5 font-semibold"
                  title="Delete Invoice"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" /> Delete
                </Button>
              </div>
            </DialogHeader>

            <div className="py-4 space-y-6 text-xs">
              {/* FINANCIAL STATUS BAR */}
              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-center font-mono">
                <div>
                  <div className="text-[11px] text-slate-500 font-sans">Grand Total</div>
                  <div className="font-bold text-slate-900 text-sm">₹{Number(selectedInvoiceDetail.grand_total || 0).toLocaleString("en-IN")}</div>
                </div>
                <div>
                  <div className="text-[11px] text-emerald-600 font-sans">Received Amount</div>
                  <div className="font-bold text-emerald-700 text-sm">₹{Number(selectedInvoiceDetail.paid_amount || 0).toLocaleString("en-IN")}</div>
                </div>
                <div>
                  <div className="text-[11px] text-amber-600 font-sans">Outstanding Balance</div>
                  <div className="font-bold text-amber-700 text-sm">₹{Number(selectedInvoiceDetail.outstanding_amount || selectedInvoiceDetail.grand_total || 0).toLocaleString("en-IN")}</div>
                </div>
              </div>

              {/* PARTY & METADATA SECTION */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-800 text-xs uppercase tracking-wider text-slate-400">Bill To / Customer</div>
                  <div className="font-bold text-slate-900 text-sm">{selectedInvoiceDetail.client_name}</div>
                  {selectedInvoiceDetail.buyer_gstin && (
                    <div className="text-blue-700 font-semibold font-mono">GSTIN: {selectedInvoiceDetail.buyer_gstin}</div>
                  )}
                  {selectedInvoiceDetail.place_of_supply && (
                    <div className="text-slate-500">Place of Supply: {selectedInvoiceDetail.place_of_supply}</div>
                  )}
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-800 text-xs uppercase tracking-wider text-slate-400">Invoice Details</div>
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-500">Invoice Date:</span>
                    <span className="font-semibold text-slate-900">{selectedInvoiceDetail.invoice_date}</span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-500">Due Date:</span>
                    <span className="font-semibold text-slate-900">{selectedInvoiceDetail.due_date || "N/A"}</span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-500">Payment Terms:</span>
                    <span className="font-semibold text-slate-900">{selectedInvoiceDetail.payment_terms || "Due on Receipt"}</span>
                  </div>
                </div>
              </div>

              {/* LINE ITEMS TABLE */}
              <div className="space-y-2">
                <div className="font-bold text-slate-900 uppercase tracking-wider text-xs">Line Items</div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 font-semibold">
                      <tr>
                        <th className="p-2.5">S.No</th>
                        <th className="p-2.5">Description</th>
                        <th className="p-2.5">HSN/SAC</th>
                        <th className="p-2.5 text-center">Qty</th>
                        <th className="p-2.5 text-right">Rate (₹)</th>
                        <th className="p-2.5 text-right">Taxable (₹)</th>
                        <th className="p-2.5 text-center">GST %</th>
                        <th className="p-2.5 text-right">Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {(selectedInvoiceDetail.items || []).map((it, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5">{idx + 1}</td>
                          <td className="p-2.5 font-sans font-medium text-slate-900">{it.product_name || it.product} {it.size ? `(${it.size})` : ""}</td>
                          <td className="p-2.5 text-slate-500">{it.hsn_sac || "—"}</td>
                          <td className="p-2.5 text-center">{it.quantity || it.qty}</td>
                          <td className="p-2.5 text-right">₹{Number(it.rate || it.unit_price || 0).toLocaleString("en-IN")}</td>
                          <td className="p-2.5 text-right">₹{Number(it.taxable || (it.quantity * it.rate - (it.discount || 0))).toLocaleString("en-IN")}</td>
                          <td className="p-2.5 text-center">{it.gst_rate || it.gst || 18}%</td>
                          <td className="p-2.5 text-right font-bold text-slate-900">₹{Number(it.amount || 0).toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* FINANCIAL TOTALS & NOTES */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="font-bold text-slate-800">Terms & Instructions</div>
                  <div className="text-slate-600 whitespace-pre-wrap">{selectedInvoiceDetail.notes || selectedInvoiceDetail.terms || "Standard payment terms apply."}</div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1.5 font-mono">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span className="font-bold text-slate-900">₹{Number(selectedInvoiceDetail.subtotal || 0).toLocaleString("en-IN")}</span>
                  </div>
                  {selectedInvoiceDetail.discount > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>Discount:</span>
                      <span>-₹{Number(selectedInvoiceDetail.discount).toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  {selectedInvoiceDetail.cgst_rate > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>CGST ({selectedInvoiceDetail.cgst_rate}%):</span>
                      <span>₹{Number((selectedInvoiceDetail.subtotal * selectedInvoiceDetail.cgst_rate) / 100).toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  {selectedInvoiceDetail.sgst_rate > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>SGST ({selectedInvoiceDetail.sgst_rate}%):</span>
                      <span>₹{Number((selectedInvoiceDetail.subtotal * selectedInvoiceDetail.sgst_rate) / 100).toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  {selectedInvoiceDetail.igst_rate > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>IGST ({selectedInvoiceDetail.igst_rate}%):</span>
                      <span>₹{Number((selectedInvoiceDetail.subtotal * selectedInvoiceDetail.igst_rate) / 100).toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold text-blue-900 bg-blue-50 p-2 rounded border-t border-slate-200 mt-2">
                    <span>Grand Total:</span>
                    <span>₹{Number(selectedInvoiceDetail.grand_total || 0).toLocaleString("en-IN")}</span>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={() => setInvoiceDetailOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── NEW PROJECT DIALOG ───────────────────────────────────────────── */}
      {newProjectOpen && (
        <NewProjectDialog
          clients={clientsList}
          onClose={() => setNewProjectOpen(false)}
          onSave={(payload) => createProjectMutation.mutate(payload)}
          saving={createProjectMutation.isPending}
        />
      )}

      {/* ─── ADD / EDIT PAYMENT DIALOG ────────────────────────────────────── */}
      {addPaymentOpen && (
        <Dialog open={addPaymentOpen} onOpenChange={setAddPaymentOpen}>
          <DialogContent className="max-w-md rounded-xl p-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                {editingPayment ? "Edit Payment Record" : "Add Payment"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Payment Type</Label>
                  <Select
                    value={paymentForm.payment_type}
                    onValueChange={(v) => setPaymentForm({ ...paymentForm, payment_type: v })}
                  >
                    <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Advance">Advance</SelectItem>
                      <SelectItem value="Milestone">Milestone</SelectItem>
                      <SelectItem value="Final">Final</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Amount (₹)</Label>
                  <Input
                    type="number"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    placeholder="50000"
                    className="mt-1 font-semibold text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Payment Date</Label>
                  <Input
                    type="date"
                    value={paymentForm.payment_date}
                    onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                    className="mt-1 text-xs"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Payment Source</Label>
                  <Select
                    value={paymentForm.payment_source}
                    onValueChange={(v) => setPaymentForm({ ...paymentForm, payment_source: v })}
                  >
                    <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Online">Online</SelectItem>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                      <SelectItem value="Loan / Finance">Loan / Finance</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Reference / UTR</Label>
                  <Input
                    value={paymentForm.ref_number}
                    onChange={(e) => setPaymentForm({ ...paymentForm, ref_number: e.target.value })}
                    placeholder="UTR or Cheque No."
                    className="mt-1 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Status</Label>
                  <Select
                    value={paymentForm.status}
                    onValueChange={(v) => setPaymentForm({ ...paymentForm, status: v })}
                  >
                    <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Received">Received</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Failed">Failed</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Remarks</Label>
                <Input
                  value={paymentForm.remarks}
                  onChange={(e) => setPaymentForm({ ...paymentForm, remarks: e.target.value })}
                  placeholder="Optional payment remarks"
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" size="sm" onClick={() => setAddPaymentOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => {
                  if (!activeProjectId) {
                    toast.error("No project selected. Please open a project first.");
                    return;
                  }
                  if (!paymentForm.amount || Number(paymentForm.amount) <= 0) {
                    toast.error("Please enter a valid amount");
                    return;
                  }
                  const clientId = projectWorkspace?.client?.id || projectWorkspace?.project?.client_id || (activeProjectId?.startsWith("proj_") ? activeProjectId.replace("proj_", "") : activeProjectId) || "";
                  recordPaymentMutation.mutate({
                    projectId: activeProjectId,
                    payload: {
                      client_id: clientId,
                      payment_type: paymentForm.payment_type,
                      milestone_name: paymentForm.milestone_name || paymentForm.payment_type,
                      amount: Number(paymentForm.amount),
                      payment_date: paymentForm.payment_date,
                      payment_source: paymentForm.payment_source,
                      payment_mode: paymentForm.payment_source,
                      ref_number: paymentForm.ref_number,
                      remarks: paymentForm.remarks,
                      status: paymentForm.status,
                      loan_id: paymentForm.loan_id || undefined
                    }
                  });
                }}
                disabled={recordPaymentMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
              >
                {recordPaymentMutation.isPending ? "Saving..." : "Save Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── ADD / EDIT LOAN DIALOG ────────────────────────────────────────── */}
      {addLoanOpen && (
        <Dialog open={addLoanOpen} onOpenChange={setAddLoanOpen}>
          <DialogContent className="max-w-md rounded-xl p-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <Landmark className="w-5 h-5 text-indigo-600" />
                {editingLoan ? "Edit Loan Record" : "Record Loan / Finance"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Finance Provider</Label>
                  <Input
                    value={loanForm.provider}
                    onChange={(e) => setLoanForm({ ...loanForm, provider: e.target.value })}
                    placeholder="e.g. Tata Capital, SBI"
                    className="mt-1 text-xs"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Applied Amount (₹)</Label>
                  <Input
                    type="number"
                    value={loanForm.loan_amount}
                    onChange={(e) => setLoanForm({ ...loanForm, loan_amount: e.target.value })}
                    placeholder="250000"
                    className="mt-1 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Approved Amount (₹)</Label>
                  <Input
                    type="number"
                    value={loanForm.approved_amount}
                    onChange={(e) => setLoanForm({ ...loanForm, approved_amount: e.target.value })}
                    placeholder="250000"
                    className="mt-1 text-xs font-bold text-indigo-700"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Disbursed Amount (₹)</Label>
                  <Input
                    type="number"
                    value={loanForm.disbursed_amount}
                    onChange={(e) => setLoanForm({ ...loanForm, disbursed_amount: e.target.value })}
                    placeholder="250000"
                    className="mt-1 font-bold font-mono text-xs text-emerald-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Approved Date</Label>
                  <Input
                    type="date"
                    value={loanForm.approved_date}
                    onChange={(e) => setLoanForm({ ...loanForm, approved_date: e.target.value })}
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Status</Label>
                  <Select
                    value={loanForm.status}
                    onValueChange={(v) => setLoanForm({ ...loanForm, status: v })}
                  >
                    <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Applied">Applied</SelectItem>
                      <SelectItem value="In Process">In Process</SelectItem>
                      <SelectItem value="Approved">Approved</SelectItem>
                      <SelectItem value="Disbursed">Disbursed</SelectItem>
                      <SelectItem value="Rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Loan Reference / Sanction No.</Label>
                <Input
                  value={loanForm.loan_ref}
                  onChange={(e) => setLoanForm({ ...loanForm, loan_ref: e.target.value })}
                  placeholder="Sanction Letter / Loan ID"
                  className="mt-1 text-xs font-mono"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Remarks</Label>
                <Input
                  value={loanForm.remarks}
                  onChange={(e) => setLoanForm({ ...loanForm, remarks: e.target.value })}
                  placeholder="Optional loan remarks"
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" size="sm" onClick={() => setAddLoanOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => {
                  if (!loanForm.provider.trim()) {
                    toast.error("Please enter finance provider");
                    return;
                  }
                  const clientId = projectWorkspace?.client?.id || projectWorkspace?.project?.client_id || (activeProjectId?.startsWith("proj_") ? activeProjectId.replace("proj_", "") : activeProjectId) || "";
                  recordLoanMutation.mutate({
                    projectId: activeProjectId,
                    payload: {
                      project_id: activeProjectId,
                      client_id: clientId,
                      provider: loanForm.provider,
                      loan_amount: Number(loanForm.loan_amount || 0),
                      approved_amount: Number(loanForm.approved_amount || 0),
                      approved_date: loanForm.approved_date,
                      expected_disbursement_date: loanForm.expected_disbursement_date,
                      disbursed_amount: Number(loanForm.disbursed_amount || 0),
                      loan_ref: loanForm.loan_ref,
                      status: loanForm.status,
                      remarks: loanForm.remarks
                    }
                  });
                }}
                disabled={recordLoanMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs"
              >
                {recordLoanMutation.isPending ? "Saving..." : "Save Loan Record"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── ADD / EDIT EXPENSE DIALOG ────────────────────────────────────── */}
      {addExpenseOpen && (
        <Dialog open={addExpenseOpen} onOpenChange={setAddExpenseOpen}>
          <DialogContent className="max-w-md rounded-xl p-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <Truck className="w-5 h-5 text-amber-600" />
                {editingExpense ? "Edit Expense Record" : "Log Project Expense"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Expense Category</Label>
                  <Select
                    value={expenseForm.category}
                    onValueChange={(v) => setExpenseForm({ ...expenseForm, category: v })}
                  >
                    <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Material">Material</SelectItem>
                      <SelectItem value="Labour">Labour</SelectItem>
                      <SelectItem value="Transport">Transport</SelectItem>
                      <SelectItem value="Installation">Installation</SelectItem>
                      <SelectItem value="Office">Office</SelectItem>
                      <SelectItem value="Advertisement">Advertisement</SelectItem>
                      <SelectItem value="Travel">Travel</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Expense Amount (₹)</Label>
                  <Input
                    type="number"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    placeholder="15000"
                    className="mt-1 font-semibold text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Expense Date</Label>
                  <Input
                    type="date"
                    value={expenseForm.expense_date}
                    onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                    className="mt-1 text-xs"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Vendor / Payable To</Label>
                  <Input
                    value={expenseForm.vendor_name}
                    onChange={(e) => setExpenseForm({ ...expenseForm, vendor_name: e.target.value })}
                    placeholder="e.g. Local Hardware Store"
                    className="mt-1 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Payment Mode</Label>
                  <Select
                    value={expenseForm.payment_mode}
                    onValueChange={(v) => setExpenseForm({ ...expenseForm, payment_mode: v })}
                  >
                    <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash/UPI">Cash / UPI</SelectItem>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      <SelectItem value="Credit Card">Credit Card</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Payment Status</Label>
                  <Select
                    value={expenseForm.payment_status}
                    onValueChange={(v) => setExpenseForm({ ...expenseForm, payment_status: v })}
                  >
                    <SelectTrigger className="mt-1 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Paid">Paid</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Description / Notes</Label>
                <Input
                  value={expenseForm.notes}
                  onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                  placeholder="Details of material or labor expense"
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" size="sm" onClick={() => setAddExpenseOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => {
                  if (!expenseForm.amount || Number(expenseForm.amount) <= 0) {
                    toast.error("Please enter a valid expense amount");
                    return;
                  }
                  const clientId = projectWorkspace?.client?.id || projectWorkspace?.project?.client_id || (activeProjectId?.startsWith("proj_") ? activeProjectId.replace("proj_", "") : activeProjectId) || "";
                  recordExpenseMutation.mutate({
                    projectId: activeProjectId,
                    payload: {
                      project_id: activeProjectId,
                      client_id: clientId,
                      category: expenseForm.category,
                      amount: Number(expenseForm.amount),
                      expense_date: expenseForm.expense_date,
                      vendor_name: expenseForm.vendor_name,
                      payment_mode: expenseForm.payment_mode,
                      ref_number: expenseForm.ref_number,
                      payment_status: expenseForm.payment_status,
                      notes: expenseForm.notes
                    }
                  });
                }}
                disabled={recordExpenseMutation.isPending}
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs"
              >
                {recordExpenseMutation.isPending ? "Logging..." : "Save Expense"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── MODAL: DELETE INVOICE CONFIRMATION ──────────────────────────── */}
      <Dialog open={!!invoiceToDelete} onOpenChange={(open) => !open && setInvoiceToDelete(null)}>
        <DialogContent className="max-w-md rounded-xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-rose-600" /> Delete Invoice?
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-600 pt-2 leading-relaxed">
              Are you sure you want to delete invoice <strong className="text-slate-900 font-mono">{invoiceToDelete?.invoice_number || invoiceToDelete?.id}</strong>?
              <br />
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 gap-2 flex justify-end">
            <Button
              variant="outline"
              onClick={() => setInvoiceToDelete(null)}
              className="border-slate-200"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (invoiceToDelete) {
                  deleteInvoiceMutation.mutate(invoiceToDelete.id);
                }
              }}
              disabled={deleteInvoiceMutation.isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold gap-1.5"
            >
              <Trash2 className="w-4 h-4" /> {deleteInvoiceMutation.isPending ? "Deleting..." : "Delete Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewProjectDialog({ clients, onClose, onSave, saving }) {
  const [clientId, setClientId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] = useState("Rooftop Solar");
  const [capacityKw, setCapacityKw] = useState("");
  const [projectDate, setProjectDate] = useState(new Date().toISOString().split("T")[0]);
  const [expectedCompletionDate, setExpectedCompletionDate] = useState("");
  const [notes, setNotes] = useState("");

  const [projectValue, setProjectValue] = useState("");
  const [paymentPlan, setPaymentPlan] = useState([
    { name: "Advance", amount: "" },
    { name: "Dispatch", amount: "" },
    { name: "Installation", amount: "" },
    { name: "Handover", amount: "" }
  ]);

  const handleAddPlanRow = () => {
    setPaymentPlan([...paymentPlan, { name: "Milestone", amount: "" }]);
  };

  const handleUpdatePlanRow = (index, field, val) => {
    const next = [...paymentPlan];
    next[index][field] = val;
    setPaymentPlan(next);
  };

  const handleRemovePlanRow = (index) => {
    setPaymentPlan(paymentPlan.filter((_, i) => i !== index));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!clientId) {
      toast.error("Please select an existing client");
      return;
    }
    if (!projectName.trim()) {
      toast.error("Please enter a project name");
      return;
    }
    if (!projectValue || Number(projectValue) <= 0) {
      toast.error("Please enter a valid contract value");
      return;
    }

    const cleanPlan = paymentPlan
      .filter((p) => p.name.trim() && p.amount && Number(p.amount) > 0)
      .map((p) => ({ name: p.name.trim(), amount: Number(p.amount) }));

    onSave({
      client_id: clientId,
      project_name: projectName.trim(),
      project_type: projectType,
      capacity_kw: capacityKw ? Number(capacityKw) : 0,
      project_value: Number(projectValue),
      project_date: projectDate,
      expected_completion_date: expectedCompletionDate,
      notes: notes,
      payment_plan: cleanPlan
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl rounded-2xl p-5">
        <DialogHeader className="border-b border-slate-100 pb-2">
          <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-base">
            <FolderPlus className="w-5 h-5 text-blue-600" /> Create New Financial Project
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Define project commercial contract value and optional payment plan schedule.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="py-2 text-xs space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="font-bold text-slate-900 text-xs uppercase tracking-wider border-b border-slate-200 pb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-blue-600" /> Section A — Project Information
              </div>

              <div>
                <Label className="text-xs font-semibold">Existing Client</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger className="mt-1 text-xs h-8 bg-white"><SelectValue placeholder="Select Client" /></SelectTrigger>
                  <SelectContent className="max-h-56 overflow-y-auto text-xs">
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name} {c.sol_id ? `(${c.sol_id})` : ""} — {c.mobile || ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold">Project Name</Label>
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. 10 kW Rooftop Solar"
                  className="mt-1 h-8 text-xs bg-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Project Type</Label>
                  <Select value={projectType} onValueChange={setProjectType}>
                    <SelectTrigger className="mt-1 text-xs h-8 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Rooftop Solar">Rooftop Solar</SelectItem>
                      <SelectItem value="Ground Mount Solar">Ground Mount Solar</SelectItem>
                      <SelectItem value="Commercial Solar">Commercial Solar</SelectItem>
                      <SelectItem value="Industrial Solar">Industrial Solar</SelectItem>
                      <SelectItem value="Agricultural Solar Pump">Agricultural Solar Pump</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Capacity (kW)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={capacityKw}
                    onChange={(e) => setCapacityKw(e.target.value)}
                    placeholder="10"
                    className="mt-1 h-8 text-xs bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-semibold">Project Date</Label>
                  <Input
                    type="date"
                    value={projectDate}
                    onChange={(e) => setProjectDate(e.target.value)}
                    className="mt-1 h-8 text-xs bg-white"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Expected Completion</Label>
                  <Input
                    type="date"
                    value={expectedCompletionDate}
                    onChange={(e) => setExpectedCompletionDate(e.target.value)}
                    className="mt-1 h-8 text-xs bg-white"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Notes</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional project notes"
                  className="mt-1 h-8 text-xs bg-white"
                />
              </div>
            </div>

            <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="font-bold text-slate-900 text-xs uppercase tracking-wider border-b border-slate-200 pb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Section B — Commercial Setup
              </div>

              <div>
                <Label className="text-xs font-semibold">Contract Value (₹)</Label>
                <Input
                  type="number"
                  value={projectValue}
                  onChange={(e) => setProjectValue(e.target.value)}
                  placeholder="500000"
                  className="mt-1 font-bold text-sm bg-white"
                  required
                />
              </div>

              <div className="space-y-2 pt-1 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-800">Payment Plan (Optional)</Label>
                  <Button type="button" size="xs" variant="ghost" onClick={handleAddPlanRow} className="h-6 text-[11px] text-blue-600 gap-1">
                    <Plus className="w-3 h-3" /> Add Milestone
                  </Button>
                </div>

                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {paymentPlan.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <Input
                        value={item.name}
                        onChange={(e) => handleUpdatePlanRow(idx, "name", e.target.value)}
                        placeholder="e.g. Advance, Dispatch"
                        className="h-7 text-xs bg-white flex-1"
                      />
                      <Input
                        type="number"
                        value={item.amount}
                        onChange={(e) => handleUpdatePlanRow(idx, "amount", e.target.value)}
                        placeholder="₹ Amount"
                        className="h-7 text-xs bg-white font-mono w-28 text-right"
                      />
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => handleRemovePlanRow(idx)}
                        className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-slate-400 italic">
                  Note: Payment plan is a planned schedule and does NOT count toward received funds.
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" size="sm" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs">
              {saving ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
