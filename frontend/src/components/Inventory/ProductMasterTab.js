import React, { useMemo, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pencil, Trash2, Plus, Boxes, Search, Download, FileSpreadsheet, FileText, Upload, Settings } from "lucide-react";
import { toast } from "sonner";
import { Field, SelectField, ConfirmDialog, UNIT_OPTIONS, CATEGORY_OPTIONS, normalizeSizeForMatching } from "./_shared";
import ProductDrawer from "./ProductDrawer";
import ProductImportModal from "./ProductImportModal";

const STATUS_STYLES = {
  "Normal": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Low Stock": "bg-amber-50 text-amber-700 border-amber-200",
  "Out Of Stock": "bg-red-50 text-red-700 border-red-200",
};

const EMPTY = () => ({ name: "", size: "", category: "Solar Panel", unit: "Nos", min_stock: 0, rate: "", status: "Active", high_value_goods: false, serial_number_required: false, brand: "", sku: "" });

export default function ProductMasterTab({ products, onChanged, globalSearch }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY());
  const [editing, setEditing] = useState(null);
  const [drawerProduct, setDrawerProduct] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importModalType, setImportModalType] = useState("pdf");
  const [manageModalOpen, setManageModalOpen] = useState(false);

  const startAdd = () => { setEditing(null); setForm(EMPTY()); setOpen(true); };
  const startEdit = (p) => { setDrawerProduct(p); };

  const save = async () => {
    if (!form.name?.trim()) { toast.error("Product name required"); return; }
    setBusy(true);
    try {
      const payload = { ...form, min_stock: Number(form.min_stock) || 0, rate: Number(form.rate) || 0 };
      if (editing) {
        await api.patch(`/inventory/products/${editing.id}`, payload);
        toast.success("Product updated successfully.");
      } else {
        await api.post("/inventory/products", payload);
        toast.success("Product updated successfully.");
      }
      setOpen(false);
      onChanged?.();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    try {
      const res = await api.delete(`/inventory/products/${confirmDel.id}`);
      if (res.data?.action === "archived") {
        toast.info(res.data.message || "Product archived because historical records exist.");
      } else {
        toast.success(res.data?.message || "Product deleted successfully.");
      }
      setConfirmDel(null);
      onChanged?.();
    } catch (e) { toast.error(formatApiError(e)); setConfirmDel(null); }
  };

  const [localSearch, setLocalSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const filtered = useMemo(() => {
    const list = Array.isArray(products) ? products : [];
    const rawSearch = (localSearch || globalSearch || "").toLowerCase().trim();
    if (!rawSearch) return list;
    const cleanSearch = rawSearch.replace(/\s*[xX×\*]\s*/g, "*");
    const tokens = cleanSearch.split(/\s+/).filter(Boolean);

    return list.filter((p) => {
      const name = (p.name || "").toLowerCase();
      const rawSize = (p.size || "").toLowerCase();
      const size = normalizeSizeForMatching(p.size);
      const brand = (p.brand || "").toLowerCase();
      const category = (p.category || "").toLowerCase();
      const sku = (p.sku || p.code || p.product_code || p.id || "").toLowerCase();

      const fullText = `${name} ${size} ${rawSize} ${brand} ${category} ${sku}`;
      return tokens.every((token) => fullText.includes(token));
    });
  }, [products, localSearch, globalSearch]);

  const handleExportExcel = async () => {
    if (!filtered || filtered.length === 0) {
      toast.error("No product data to export");
      return;
    }
    const XLSX = await import("xlsx");
    const data = filtered.map((p) => ({
      "Product Name": p.name || "",
      "Size": p.size || "",
      "Category": p.category || "Solar",
      "Unit": p.unit || "Nos",
      "Min Stock": p.min_stock || 0,
      "Rate": p.rate || 0,
      "Current Stock": p.balance || 0,
      "Status": p.stock_status || "Normal"
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Product Master");
    XLSX.writeFile(wb, "Product_Master.xlsx");
    toast.success(`Exported ${filtered.length} products to Excel`);
  };

  const handleExportPDF = async () => {
    if (!filtered || filtered.length === 0) {
      toast.error("No product data to export");
      return;
    }
    setExportingPdf(true);
    try {
      const response = await api.post(
        "/inventory/products/export-pdf",
        { products: filtered },
        { responseType: "blob" }
      );
      const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "Product_Master.pdf");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Exported ${filtered.length} products to PDF`);
    } catch (err) {
      toast.error("Failed to generate Product Master PDF");
    } finally {
      setExportingPdf(false);
    }
  };

  React.useEffect(() => {
    setCurrentPage(1);
  }, [localSearch, globalSearch]);

  const totalPages = Math.ceil((filtered?.length ?? 0) / itemsPerPage);
  const paginated = useMemo(() => {
    return (filtered || []).slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filtered, currentPage, itemsPerPage]);

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-100">
            <div>
              <div className="text-base font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>Product Master</div>
              <div className="text-xs text-slate-500">{(filtered?.length ?? 0)} of {(products?.length ?? 0)} products</div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative w-64 sm:w-80">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search by name, size, brand, category, SKU…"
                  className="pl-9 bg-white h-9 text-xs"
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  data-testid="product-master-search"
                />
              </div>

              <Button variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-50 text-xs" onClick={handleExportExcel} data-testid="export-excel-btn">
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Export Excel
              </Button>

              <Button variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-50 text-xs" onClick={handleExportPDF} disabled={exportingPdf} data-testid="export-pdf-btn">
                <FileText className="w-3.5 h-3.5 mr-1 text-red-600" /> {exportingPdf ? "Exporting PDF…" : "Export PDF"}
              </Button>

              <Button variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold" onClick={() => setManageModalOpen(true)} data-testid="manage-products-btn">
                <Settings className="w-3.5 h-3.5 mr-1 text-slate-600" /> Manage Products
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[65vh]">
            <table className="w-full text-sm" data-testid="products-table">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Product</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Size</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Category</th>
                  <th className="px-4 py-2.5 text-center font-semibold">Unit</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Min Stock</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Rate</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Current Stock</th>
                  <th className="px-4 py-2.5 text-center font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-center font-semibold w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(filtered?.length ?? 0) === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-16 text-center">
                    <Boxes className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <div className="text-sm font-semibold text-slate-700">No products yet</div>
                    <div className="text-xs text-slate-500 mt-1">Add your first product or create an inward entry — products auto-register.</div>
                  </td></tr>
                ) : paginated.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/60" data-testid={`product-row-${p.id}`}>
                    <td className="px-4 py-2.5 text-xs">
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                        {p.name}
                        {p.high_value_goods && (
                          <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[9px] uppercase px-1 py-0 scale-90">HV</Badge>
                        )}
                      </div>
                      {p.size && <div className="text-[10px] text-slate-400 mt-0.5">{p.size}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-700">{p.size || "—"}</td>
                    <td className="px-4 py-2.5 text-xs">
                      <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-[10px]">{p.category || "Solar"}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-center text-slate-600">{p.unit || "Nos"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs text-slate-600">{p.min_stock || 0}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs text-slate-600">₹ {p.rate || 0}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{p.balance}</td>
                    <td className="px-4 py-2.5 text-center">
                      <Badge variant="outline" className={`${STATUS_STYLES[p.stock_status] || ""} text-[10px]`}>{p.stock_status}</Badge>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(p)} data-testid={`edit-product-${p.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={() => setConfirmDel(p)} data-testid={`del-product-${p.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 bg-white">
              <div className="text-xs text-slate-500">
                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, (filtered?.length ?? 0))} of {(filtered?.length ?? 0)} products
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" data-testid="product-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Outfit" }}>{editing ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Field label="Product Name" value={form.name} onChange={(v) => setForm({ ...form, name: v.toUpperCase() })} placeholder="e.g. WAAREE PANEL 540W" testid="pm-name" full required />
            <Field label="Size / Spec" value={form.size} onChange={(v) => setForm({ ...form, size: v })} placeholder="e.g. 540W Mono PERC" testid="pm-size" full />
            <SelectField label="Category" value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={CATEGORY_OPTIONS} testid="pm-category" />
            <SelectField label="Unit" value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} options={UNIT_OPTIONS} testid="pm-unit" />
            <Field label="Min Stock (alert level)" type="number" value={form.min_stock} onChange={(v) => setForm({ ...form, min_stock: v })} testid="pm-min" />
            <Field label="Rate / Unit Price" type="number" value={form.rate} onChange={(v) => setForm({ ...form, rate: v })} testid="pm-rate" />
            <SelectField label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={["Active", "Inactive"]} testid="pm-status" />
            <div className="col-span-2 flex flex-wrap items-center gap-6 py-1">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.high_value_goods || false}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm(prev => ({
                      ...prev,
                      high_value_goods: checked,
                      high_value_asset: checked
                    }));
                  }}
                  className="w-4 h-4 accent-blue-600 rounded border-slate-300"
                  data-testid="pm-hv-checkbox"
                />
                High Value Goods
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.serial_number_required || false}
                  onChange={(e) => setForm(prev => ({ ...prev, serial_number_required: e.target.checked }))}
                  className="w-4 h-4 accent-blue-600 rounded border-slate-300"
                  data-testid="pm-sn-required-checkbox"
                />
                Serial No. Tracking: ON / OFF
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={save} disabled={busy} data-testid="save-product-btn">{busy ? "Saving…" : editing ? "Update" : "Add Product"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(v) => !v && setConfirmDel(null)}
        title="Delete product?"
        description={confirmDel ? `Remove "${confirmDel.name}" from the master. If any inward/outward entries reference it, the delete will be blocked.` : ""}
        onConfirm={doDelete}
      />

      <ProductDrawer
        product={drawerProduct}
        open={!!drawerProduct}
        onClose={() => setDrawerProduct(null)}
        onChanged={() => { onChanged?.(); }}
      />

      <ProductImportModal
        open={importModalOpen}
        onOpenChange={setImportModalOpen}
        initialType={importModalType}
        existingProducts={products}
        onChanged={() => { onChanged?.(); }}
      />

      {/* MANAGE PRODUCT MASTER DIALOG */}
      <Dialog open={manageModalOpen} onOpenChange={setManageModalOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 overflow-hidden" data-testid="manage-products-modal">
          <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle style={{ fontFamily: "Outfit" }}>Manage Product Master</DialogTitle>
                <div className="text-xs text-slate-500 mt-0.5">Central Product Master Definitions & Settings ({products?.length || 0} products)</div>
              </div>
            </div>
          </DialogHeader>

          <div className="p-4 border-b border-slate-100 bg-white">
            <div className="relative w-full max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search products by name, category, SKU..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                className="pl-9 text-xs h-9 bg-slate-50 border-slate-200"
                data-testid="manage-search-input"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 text-slate-600 font-semibold uppercase text-[10px] sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-left">Size</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-center">Unit</th>
                  <th className="px-3 py-2 text-right">Min Stock</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-center">HV</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-semibold text-slate-900">{p.name}</td>
                    <td className="px-3 py-2 text-slate-600">{p.size || "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-[10px] bg-slate-50">{p.category || "Solar"}</Badge>
                    </td>
                    <td className="px-3 py-2 text-center">{p.unit || "Nos"}</td>
                    <td className="px-3 py-2 text-right">{p.min_stock || 0}</td>
                    <td className="px-3 py-2 text-right font-medium">₹ {p.rate || 0}</td>
                    <td className="px-3 py-2 text-center">
                      {p.high_value_goods ? <Badge className="bg-indigo-50 text-indigo-700 text-[9px]">YES</Badge> : <span className="text-slate-400">No</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant="outline" className={`${STATUS_STYLES[p.stock_status] || ""} text-[10px]`}>{p.status || "Active"}</Badge>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          onClick={() => {
                            setManageModalOpen(false);
                            startEdit(p);
                          }}
                        >
                          <Pencil className="w-3 h-3 mr-1" /> Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setConfirmDel(p)}
                        >
                          <Trash2 className="w-3 h-3 mr-1" /> Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <DialogFooter className="px-6 py-3 border-t border-slate-200 bg-slate-50">
            <Button variant="outline" onClick={() => setManageModalOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
