import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Plus,
  Search,
  Download,
  Edit3,
  Trash2,
  Calendar,
  Layers,
  Sparkles,
  Building2,
  Clock,
} from "lucide-react";
import dayjs from "dayjs";
import { formatINR } from "./defaults";
import { downloadFile } from "@/lib/api";

export default function QuotationList({
  quotations,
  loadingQuotations,
  onNewQuotation,
  onEditQuotation,
  onDeleteQuotation,
  history,
  loadingHistory,
  onDeleteHistory,
}) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("proposals");

  const filteredQuotations = quotations.filter((q) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    const custName = (q.customer?.name || q.customer_name || "").toLowerCase();
    const ref = (q.reference_no || q.quote_number || "").toLowerCase();
    const loc = (q.project?.location || "").toLowerCase();
    return custName.includes(term) || ref.includes(term) || loc.includes(term);
  });

  return (
    <div className="space-y-6">
      {/* Top Banner and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: "Outfit" }}>
            Quotations & Solar Proposals
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Create, manage and export professional proposals in Word Format S1 & S2.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={onNewQuotation}
            className="h-10 px-5 text-xs font-bold gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-xs rounded-xl"
            data-testid="btn-create-quotation"
          >
            <Plus className="w-4 h-4" /> New Quotation
          </Button>
        </div>
      </div>

      {/* Tabs: Saved Quotations / Generated Document Files */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <TabsList className="bg-slate-100 p-1 rounded-xl h-auto">
            <TabsTrigger value="proposals" className="text-xs font-semibold py-1.5 px-3 rounded-lg">
              Saved Quotations ({quotations.length})
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs font-semibold py-1.5 px-3 rounded-lg">
              Generated Files History ({history.length})
            </TabsTrigger>
          </TabsList>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
            <Input
              className="h-9 pl-8 text-xs bg-white border-slate-200"
              placeholder="Search customer, reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {tab === "proposals" && (
          <Card className="border-slate-200/80 shadow-xs rounded-2xl bg-white overflow-hidden">
            <CardContent className="p-0">
              {loadingQuotations ? (
                <div className="text-xs text-slate-400 py-12 text-center italic">Loading saved quotations...</div>
              ) : filteredQuotations.length === 0 ? (
                <div className="py-16 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                    <FileText className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">No Quotations Found</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {search ? "No quotations matched your search filter." : "Get started by generating your first professional solar proposal."}
                  </p>
                  <Button
                    onClick={onNewQuotation}
                    variant="outline"
                    size="sm"
                    className="mt-2 text-xs font-semibold text-blue-700 border-blue-200"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Create Quotation
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-700 font-mono text-[11px] uppercase tracking-wider font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-3.5">Reference No</th>
                        <th className="p-3.5">Customer Name</th>
                        <th className="p-3.5">Capacity & Cost</th>
                        <th className="p-3.5">Template</th>
                        <th className="p-3.5">Status</th>
                        <th className="p-3.5">Last Updated</th>
                        <th className="p-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-900 font-medium">
                      {filteredQuotations.map((q) => {
                        const cust = q.customer || {};
                        const proj = q.project || {};
                        const fin = q.financials || {};
                        const comm = q.commercial || {};
                        const cost = fin.project_cost || comm.price || 0;

                        return (
                          <tr key={q.id} className="hover:bg-slate-50/70 transition">
                            <td className="p-3.5 font-mono font-bold text-blue-700">
                              {q.reference_no || q.quote_number || "—"}
                            </td>
                            <td className="p-3.5">
                              <div className="font-bold text-slate-900">{cust.name || q.customer_name || "Valued Customer"}</div>
                              <div className="text-[11px] text-slate-500 truncate max-w-xs">{cust.address || "—"}</div>
                            </td>
                            <td className="p-3.5">
                              <div className="font-bold font-mono text-slate-900">{proj.size_kw || 100} kW</div>
                              <div className="text-[11px] font-mono text-emerald-700">{formatINR(cost)}</div>
                            </td>
                            <td className="p-3.5">
                              <Badge variant="outline" className="text-[10px] font-mono bg-blue-50 text-blue-700 border-blue-200">
                                {q.template || "S1"}
                              </Badge>
                            </td>
                            <td className="p-3.5">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                q.status === "generated"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}>
                                {q.status === "generated" ? "Generated" : "Draft"}
                              </span>
                            </td>
                            <td className="p-3.5 text-slate-500 font-mono text-[11px]">
                              {q.updated_at ? dayjs(q.updated_at).format("YYYY-MM-DD HH:mm") : "—"}
                            </td>
                            <td className="p-3.5 text-right space-x-1.5 whitespace-nowrap">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onEditQuotation(q)}
                                className="h-8 text-xs font-semibold rounded-lg border-slate-200 text-blue-700 hover:bg-blue-50"
                                data-testid={`btn-edit-${q.id}`}
                              >
                                <Edit3 className="w-3.5 h-3.5 mr-1" /> Edit
                              </Button>

                              {q.generated_file_id && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => downloadFile(q.generated_file_id, q.generated_filename || "Solar_Proposal.docx")}
                                  className="h-8 text-xs font-semibold rounded-lg border-slate-200 text-emerald-700 hover:bg-emerald-50"
                                >
                                  <Download className="w-3.5 h-3.5 mr-1" /> Docx
                                </Button>
                              )}

                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onDeleteQuotation(q.id)}
                                className="h-8 text-xs rounded-lg border-red-200 text-red-600 hover:bg-red-50"
                                data-testid={`btn-delete-${q.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === "history" && (
          <Card className="border-slate-200/80 shadow-xs rounded-2xl bg-white overflow-hidden">
            <CardContent className="p-0">
              {loadingHistory ? (
                <div className="text-xs text-slate-400 py-12 text-center italic">Loading file history...</div>
              ) : history.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">No generated document history records found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-700 font-mono text-[11px] uppercase tracking-wider font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-3.5">Document Number</th>
                        <th className="p-3.5">Client Name</th>
                        <th className="p-3.5">File Name</th>
                        <th className="p-3.5">Generated At</th>
                        <th className="p-3.5">Prepared By</th>
                        <th className="p-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-900 font-medium">
                      {history.map((doc) => (
                        <tr key={doc.id} className="hover:bg-slate-50/70 transition">
                          <td className="p-3.5 font-mono font-bold text-blue-700">{doc.document_number}</td>
                          <td className="p-3.5 font-semibold text-slate-900">{doc.client_name || "Client"}</td>
                          <td className="p-3.5 text-slate-500 font-mono text-[11px] truncate max-w-xs">{doc.filename}</td>
                          <td className="p-3.5 text-slate-500 font-mono text-[11px]">
                            {doc.created_at ? dayjs(doc.created_at).format("YYYY-MM-DD HH:mm") : "—"}
                          </td>
                          <td className="p-3.5 text-slate-600">{doc.prepared_by || "—"}</td>
                          <td className="p-3.5 text-right space-x-1.5 whitespace-nowrap">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs rounded-lg border-slate-200 text-slate-700"
                              onClick={() => downloadFile(doc.id, doc.filename || "Quotation.docx")}
                            >
                              <Download className="w-3.5 h-3.5 mr-1" /> Download
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs rounded-lg border-red-200 text-red-600 hover:bg-red-50"
                              onClick={() => onDeleteHistory(doc.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </Tabs>
    </div>
  );
}
