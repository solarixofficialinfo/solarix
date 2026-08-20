import React, { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  FileText, Image as ImageIcon, Plus, Eye, Download, RefreshCw, Trash2, Upload, X, Check, File, AlertCircle, MoreVertical,
} from "lucide-react";
import { toast } from "sonner";
import api, { fileUrl, formatApiError } from "@/lib/api";
import dayjs from "dayjs";

const PREDEFINED_DOC_TYPES = [
  "Aadhaar",
  "PAN Card",
  "Electricity Bill",
  "Site Photo",
  "Home Agreement",
  "Rent Agreement",
  "Bank Document",
  "Property Document",
  "Identity Proof",
  "Address Proof",
  "Other",
  "+ Custom Document",
];

export default function ClientDocumentManager({
  documents = [],
  onChange,
  clientId = null,
  readOnly = false,
  dark = false,
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState(null);
  
  // Form State for Add / Replace
  const [docType, setDocType] = useState("Aadhaar");
  const [customName, setCustomName] = useState("");
  const [uploadType, setUploadType] = useState("DOCUMENT"); // DOCUMENT or PHOTO
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewThumbnail, setPreviewThumbnail] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Preview & Delete Dialog States
  const [previewDoc, setPreviewDoc] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fileInputRef = useRef(null);

  // Helper to format file size
  const formatSize = (bytes) => {
    if (!bytes || isNaN(bytes)) return "Unknown Size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Helper to get extension/badge style
  const getFileBadge = (filename = "", contentType = "") => {
    const ext = filename.split(".").pop()?.toUpperCase() || "";
    if (ext === "PDF" || contentType.includes("pdf")) {
      return { text: "PDF", style: "bg-red-50 text-red-700 border-red-200" };
    }
    if (["JPG", "JPEG", "PNG", "WEBP"].includes(ext) || contentType.includes("image")) {
      return { text: ext || "IMAGE", style: "bg-blue-50 text-blue-700 border-blue-200" };
    }
    return { text: ext || "FILE", style: "bg-slate-100 text-slate-700 border-slate-200" };
  };

  // Open Add Dialog
  const openAddModal = () => {
    setReplaceTarget(null);
    setDocType("Aadhaar");
    setCustomName("");
    setUploadType("DOCUMENT");
    setSelectedFile(null);
    setPreviewThumbnail(null);
    setModalOpen(true);
  };

  // Open Replace Dialog
  const openReplaceModal = (doc) => {
    setReplaceTarget(doc);
    setDocType(doc.document_type || doc.label || "Other");
    setCustomName(doc.document_name || "");
    const isImage = (doc.content_type || "").includes("image") || (doc.file_name || "").match(/\.(jpg|jpeg|png|webp)$/i);
    setUploadType(isImage ? "PHOTO" : "DOCUMENT");
    setSelectedFile(null);
    setPreviewThumbnail(null);
    setModalOpen(true);
  };

  // Handle local file selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be below 10 MB.");
      e.target.value = "";
      return;
    }

    setSelectedFile(file);

    // If image, create thumbnail
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewThumbnail(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setPreviewThumbnail(null);
    }
  };

  // Upload & Save Handler
  const handleUploadSubmit = async () => {
    if (!selectedFile && !replaceTarget) {
      toast.error("Please select a file to upload.");
      return;
    }

    const finalDocName = docType === "+ Custom Document" ? customName.trim() : docType;
    if (!finalDocName) {
      toast.error("Please enter a valid document name.");
      return;
    }

    if (!selectedFile && replaceTarget) {
      toast.error("Please select a new file to replace the existing document.");
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("category", "client");

      const { data } = await api.post("/files/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const newDocRecord = {
        id: data.id,
        file_id: data.id,
        document_type: docType === "+ Custom Document" ? "Custom" : docType,
        document_name: finalDocName,
        label: finalDocName,
        file_name: data.filename || selectedFile.name,
        filename: data.filename || selectedFile.name,
        content_type: data.content_type || selectedFile.type,
        size: data.size || selectedFile.size,
        storage_path: data.storage_path || `customer-documents/${data.id}`,
        uploaded_at: new Date().toISOString(),
      };

      let updatedList = [];
      if (replaceTarget) {
        // Replace existing document
        updatedList = documents.map((d) => (d.id === replaceTarget.id || d.file_id === replaceTarget.file_id ? newDocRecord : d));
        toast.success(`"${finalDocName}" replaced successfully.`);
      } else {
        // Add new document
        updatedList = [...documents, newDocRecord];
        toast.success(`"${finalDocName}" uploaded successfully.`);
      }

      // Persist to backend if clientId is present
      if (clientId) {
        await api.patch(`/clients/${clientId}`, { documents: updatedList });
      }

      onChange?.(updatedList);
      setModalOpen(false);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUploading(false);
    }
  };

  // Delete Handler
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const targetId = deleteTarget.id || deleteTarget.file_id;
      const updatedList = documents.filter((d) => (d.id || d.file_id) !== targetId);

      if (clientId) {
        await api.patch(`/clients/${clientId}`, { documents: updatedList });
      }

      onChange?.(updatedList);
      toast.success("Document deleted.");
      setDeleteTarget(null);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setDeleting(false);
    }
  };

  const activeDocs = Array.isArray(documents) ? documents : [];

  return (
    <div className="space-y-4">
      {/* HEADER BAR */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={`text-sm font-bold flex items-center gap-2 ${dark ? "text-white" : "text-slate-900"}`} style={{ fontFamily: "Outfit" }}>
            <FileText className="w-4 h-4 text-blue-600" /> Documents {activeDocs.length > 0 && `(${activeDocs.length})`}
          </div>
          <div className="text-xs text-slate-500">Upload and manage official client records & identification files</div>
        </div>

        {!readOnly && (
          <Button
            type="button"
            onClick={openAddModal}
            className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 h-8 shadow-xs rounded-lg"
            data-testid="add-client-doc-btn"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Document
          </Button>
        )}
      </div>

      {/* EMPTY STATE */}
      {activeDocs.length === 0 ? (
        <Card className={`border-2 border-dashed ${dark ? "border-slate-800 bg-slate-900/40" : "border-slate-200 bg-slate-50/50"}`}>
          <CardContent className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className={`text-sm font-bold ${dark ? "text-slate-200" : "text-slate-800"}`}>No documents uploaded yet</div>
              <div className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                Add client identification, site photos, electricity bills, or agreements.
              </div>
            </div>
            {!readOnly && (
              <Button
                type="button"
                onClick={openAddModal}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 h-9 shadow-sm rounded-xl mt-2"
                data-testid="add-doc-empty-btn"
              >
                <Plus className="w-4 h-4 mr-1.5" /> Add Document
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        /* DYNAMIC DOCUMENTS LIST (MOBILE FIRST CARD STACK) */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="client-docs-list">
          {activeDocs.map((doc, idx) => {
            const docTitle = doc.document_name || doc.label || doc.document_type || "Client Document";
            const docFile = doc.file_name || doc.filename || "file";
            const badge = getFileBadge(docFile, doc.content_type || "");
            const docId = doc.id || doc.file_id;

            return (
              <Card
                key={docId || idx}
                className={`border transition-all hover:shadow-sm ${dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}
                data-testid={`doc-card-${idx}`}
              >
                <CardContent className="p-3.5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 font-bold text-xs">
                        {badge.text === "PDF" ? <FileText className="w-4 h-4 text-red-600" /> : <ImageIcon className="w-4 h-4 text-blue-600" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{docTitle}</div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">{docFile}</div>
                      </div>
                    </div>

                    <Badge variant="outline" className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 ${badge.style}`}>
                      {badge.text}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div>{formatSize(doc.size)}</div>
                    <div>{doc.uploaded_at ? dayjs(doc.uploaded_at).format("DD MMM YYYY") : "Uploaded"}</div>
                  </div>

                  {/* ACTIONS BAR */}
                  <div className="flex items-center justify-end gap-1.5 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2.5 bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                      onClick={() => setPreviewDoc(doc)}
                      data-testid={`preview-doc-${idx}`}
                    >
                      <Eye className="w-3 h-3 mr-1 text-blue-600" /> Preview
                    </Button>

                    <a
                      href={fileUrl(docId)}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex"
                    >
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2.5 bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700"
                        data-testid={`download-doc-${idx}`}
                      >
                        <Download className="w-3 h-3 mr-1 text-emerald-600" /> Download
                      </Button>
                    </a>

                    {!readOnly && (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-500 hover:text-blue-600"
                          onClick={() => openReplaceModal(doc)}
                          title="Replace Document"
                          data-testid={`replace-doc-${idx}`}
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-red-600"
                          onClick={() => setDeleteTarget(doc)}
                          title="Delete Document"
                          data-testid={`delete-doc-${idx}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ADD / REPLACE DOCUMENT DIALOG */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md" data-testid="add-client-doc-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Outfit" }}>
              {replaceTarget ? `Replace Document — ${replaceTarget.document_name || replaceTarget.label}` : "Add Client Document"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* 1. DOCUMENT TYPE */}
            <div>
              <Label className="text-xs font-semibold text-slate-700">Document Type / Category *</Label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="mt-1 w-full text-xs h-9 bg-white border border-slate-200 rounded-lg px-3 focus:outline-none focus:border-blue-600 font-medium text-slate-800"
                data-testid="doc-type-select"
              >
                {PREDEFINED_DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* CUSTOM DOCUMENT NAME INPUT */}
            {docType === "+ Custom Document" && (
              <div>
                <Label className="text-xs font-semibold text-slate-700">Custom Document Name *</Label>
                <Input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Loan Sanction Letter"
                  className="mt-1 text-xs h-9"
                  data-testid="custom-doc-name-input"
                />
              </div>
            )}

            {/* 2. UPLOAD TYPE TOGGLE */}
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">Upload Type</Label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setUploadType("DOCUMENT")}
                  className={`py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    uploadType === "DOCUMENT" ? "bg-white text-blue-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" /> PDF / Document
                </button>
                <button
                  type="button"
                  onClick={() => setUploadType("PHOTO")}
                  className={`py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    uploadType === "PHOTO" ? "bg-white text-blue-600 shadow-xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" /> Photo / Image
                </button>
              </div>
            </div>

            {/* 3. FILE UPLOAD DROPZONE */}
            <div>
              <Label className="text-xs font-semibold text-slate-700 mb-1 block">File Attachment *</Label>
              <label
                className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-5 hover:border-blue-500 hover:bg-blue-50/40 cursor-pointer transition-colors"
                data-testid="file-dropzone"
              >
                <Upload className="w-6 h-6 text-blue-500 mb-1.5" />
                <div className="text-xs font-semibold text-slate-700">
                  {selectedFile ? selectedFile.name : `Choose ${uploadType === "PHOTO" ? "Photo" : "Document"} File`}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {uploadType === "PHOTO" ? "JPG, JPEG, PNG, WEBP (max 10MB)" : "PDF, DOCX, JPG, PNG (max 10MB)"}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={uploadType === "PHOTO" ? "image/*" : ".pdf,.docx,.jpg,.jpeg,.png"}
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>
            </div>

            {/* SELECTED FILE PREVIEW CARD */}
            {selectedFile && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3">
                {previewThumbnail ? (
                  <img src={previewThumbnail} alt="Preview" className="w-12 h-12 object-cover rounded-lg border border-slate-200" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0 font-bold text-xs">
                    PDF
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">{selectedFile.name}</div>
                  <div className="text-[11px] text-slate-500">{formatSize(selectedFile.size)}</div>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-slate-400" onClick={() => setSelectedFile(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs"
              onClick={handleUploadSubmit}
              disabled={uploading || !selectedFile}
              data-testid="confirm-upload-doc-btn"
            >
              {uploading ? "Uploading..." : replaceTarget ? "Replace Document" : "Upload Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* IN-APP PREVIEW DIALOG */}
      <Dialog open={!!previewDoc} onOpenChange={(v) => !v && setPreviewDoc(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden flex flex-col" data-testid="document-preview-dialog">
          <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between gap-3">
              <div>
                <DialogTitle style={{ fontFamily: "Outfit" }}>
                  {previewDoc?.document_name || previewDoc?.label || "Document Preview"}
                </DialogTitle>
                <div className="text-xs text-slate-500 mt-0.5">
                  {previewDoc?.file_name || previewDoc?.filename || ""} • {formatSize(previewDoc?.size)}
                </div>
              </div>
              {previewDoc && (
                <a href={fileUrl(previewDoc.id || previewDoc.file_id)} download target="_blank" rel="noreferrer">
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 h-8">
                    <Download className="w-3.5 h-3.5 mr-1" /> Download
                  </Button>
                </a>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto p-4 bg-slate-900/90 flex items-center justify-center min-h-[60vh]">
            {previewDoc && (
              (previewDoc.content_type || "").includes("image") || (previewDoc.file_name || "").match(/\.(jpg|jpeg|png|webp)$/i) ? (
                <img
                  src={fileUrl(previewDoc.id || previewDoc.file_id)}
                  alt="Document Preview"
                  className="max-w-full max-h-[75vh] object-contain rounded shadow-xl"
                />
              ) : (
                <iframe
                  src={fileUrl(previewDoc.id || previewDoc.file_id)}
                  title="PDF Viewer"
                  className="w-full h-[75vh] rounded bg-white border border-slate-700"
                />
              )
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm" data-testid="delete-doc-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Outfit" }}>Delete Document?</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-slate-600 mt-2">
            Are you sure you want to remove &quot;{deleteTarget?.document_name || deleteTarget?.label}&quot;? This action cannot be undone.
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs"
              onClick={handleDeleteConfirm}
              disabled={deleting}
              data-testid="confirm-delete-doc-btn"
            >
              {deleting ? "Deleting..." : "Delete Document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
