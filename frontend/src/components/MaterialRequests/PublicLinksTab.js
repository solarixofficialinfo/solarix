import React, { useState, useEffect, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  Link2,
  Copy,
  Check,
  Share2,
  ExternalLink,
  Power,
  RotateCcw,
  Trash2,
  Plus,
  RefreshCw,
  Search,
  User,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Clock,
  MessageCircle,
  HelpCircle
} from "lucide-react";

dayjs.extend(relativeTime);

export default function PublicLinksTab({ 
  employees = [], 
  isEmployeesLoading = false, 
  employeesError = null 
}) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Create Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [linkRemarks, setLinkRemarks] = useState("");
  const [creating, setCreating] = useState(false);

  // Link Ready / Share Modal State (shows immediately after creation or reuse)
  const [shareDialog, setShareDialog] = useState({
    open: false,
    link: null,
    isReused: false,
    message: "",
  });

  // Action State
  const [copiedId, setCopiedId] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Confirm Dialogs
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    type: null, // "regenerate" | "revoke"
    link: null,
  });

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/material-requests/links");
      setLinks(res.data?.links || []);
    } catch (err) {
      toast.error(formatApiError(err) || "Failed to load public material request links");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  // Create or retrieve existing active link
  const handleCreateLink = async (e) => {
    e.preventDefault();
    if (!selectedEmployeeId) {
      toast.error("Please select a team member");
      return;
    }

    setCreating(true);
    try {
      const res = await api.post("/material-requests/links", {
        assigned_team_member_id: selectedEmployeeId,
        remarks: linkRemarks.trim(),
      });

      if (res.data?.status === "success" && res.data.link) {
        toast.success(res.data.message || "Public request link generated successfully!");
        setCreateModalOpen(false);
        setSelectedEmployeeId("");
        setLinkRemarks("");
        fetchLinks();
        setShareDialog({
          open: true,
          link: res.data.link,
          isReused: !!(res.data.is_reused || res.data.is_existing),
          message: res.data.message || "",
        });
      }
    } catch (err) {
      toast.error(formatApiError(err) || "Failed to generate link");
    } finally {
      setCreating(false);
    }
  };

  // Toggle active / disabled status
  const handleToggleStatus = async (link) => {
    const newStatus = link.status === "active" ? "disabled" : "active";
    setActionLoadingId(link.id);
    try {
      await api.patch(`/material-requests/links/${link.id}/status`, {
        status: newStatus,
      });
      toast.success(`Link status set to ${newStatus}`);
      fetchLinks();
    } catch (err) {
      toast.error(formatApiError(err) || "Failed to update link status");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Confirm and execute Regenerate Token
  const executeRegenerate = async () => {
    const link = confirmDialog.link;
    if (!link) return;
    setActionLoadingId(link.id);
    setConfirmDialog({ open: false, type: null, link: null });
    try {
      const res = await api.post(`/material-requests/links/${link.id}/regenerate`);
      toast.success(res.data?.message || "Link regenerated successfully. Old token revoked.");
      fetchLinks();
    } catch (err) {
      toast.error(formatApiError(err) || "Failed to regenerate link");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Confirm and execute Revoke Link
  const executeRevoke = async () => {
    const link = confirmDialog.link;
    if (!link) return;
    setActionLoadingId(link.id);
    setConfirmDialog({ open: false, type: null, link: null });
    try {
      await api.patch(`/material-requests/links/${link.id}/status`, {
        status: "revoked",
      });
      toast.success("Link permanently revoked.");
      fetchLinks();
    } catch (err) {
      toast.error(formatApiError(err) || "Failed to revoke link");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Helper to format absolute URL
  const getAbsoluteUrl = (link) => {
    if (!link) return "";
    const token = link.public_token || link.token;
    if (token) {
      return `${window.location.origin}/request/${token}`;
    }
    if (link.public_url && link.public_url.startsWith("http")) {
      return link.public_url;
    }
    if (link.public_url) {
      return `${window.location.origin}${link.public_url.startsWith("/") ? "" : "/"}${link.public_url}`;
    }
    return "";
  };

  // Copy link
  const handleCopy = (linkOrUrl, id) => {
    let urlToCopy = "";
    if (typeof linkOrUrl === "object" && linkOrUrl !== null) {
      urlToCopy = getAbsoluteUrl(linkOrUrl);
    } else if (typeof linkOrUrl === "string") {
      urlToCopy = linkOrUrl.startsWith("http") ? linkOrUrl : `${window.location.origin}${linkOrUrl.startsWith("/") ? "" : "/"}${linkOrUrl}`;
    }
    if (!urlToCopy) return;

    navigator.clipboard.writeText(urlToCopy).then(() => {
      setCopiedId(id);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopiedId(null), 2500);
    }).catch(() => {
      toast.error("Failed to copy link");
    });
  };

  // WhatsApp share
  const handleWhatsAppShare = (link) => {
    const fullUrl = getAbsoluteUrl(link);
    if (!fullUrl) return;
    const text = `Hello ${link.assigned_team_member_name}, here is your reusable Solarix Material Request Link for site teams:\n\n${fullUrl}\n\nAnyone with this link can submit material requests directly to your tracking workflow without logging in.`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  };

  // Filter links
  const filteredLinks = links.filter((l) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = (l.assigned_team_member_name || "").toLowerCase().includes(q);
    const roleMatch = (l.assigned_team_member_role || "").toLowerCase().includes(q);
    const statusMatch = (l.status || "").toLowerCase().includes(q);
    return nameMatch || roleMatch || statusMatch;
  });

  const activeCount = links.filter((l) => l.status === "active").length;
  const disabledCount = links.filter((l) => l.status === "disabled").length;

  return (
    <div className="space-y-4">
      {/* Overview & Quick Info Card */}
      <Card className="p-4 sm:p-5 border-blue-100 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-sm">
                <Link2 className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Reusable Public Request Links</h3>
            </div>
            <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
              Generate one reusable link per team member. Field supervisors, contractors, and site engineers can submit material requests without logging in. All requests route into the authoritative pending queue under the assigned member.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLinks}
              disabled={loading}
              className="text-xs h-9 bg-white"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setCreateModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-9 gap-1.5 shadow-sm"
              data-testid="create-public-mr-link-btn"
            >
              <Plus className="w-3.5 h-3.5" /> + Generate Request Link
            </Button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="mt-4 pt-3 border-t border-blue-100/80 flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-1.5 text-slate-600">
            <span className="font-semibold text-slate-900">{links.length}</span> Total Links
          </div>
          <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>{activeCount} Active</span>
          </div>
          {disabledCount > 0 && (
            <div className="flex items-center gap-1.5 text-amber-700 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>{disabledCount} Disabled</span>
            </div>
          )}
        </div>
      </Card>

      {/* Filter / Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        <Input
          placeholder="Filter by team member name, role, or status..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 text-xs bg-white h-9"
        />
      </div>

      {/* Links List / Table */}
      {loading && links.length === 0 ? (
        <Card className="p-12 text-center border-slate-200 bg-white">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-2" />
          <p className="text-xs text-slate-500">Loading public request links...</p>
        </Card>
      ) : filteredLinks.length === 0 ? (
        <Card className="p-12 text-center border-dashed border-slate-300 bg-slate-50/50">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
            <Link2 className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">No public links found</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
            {searchQuery ? "No links match your filter query." : "Generate a public material request link for team members to allow instant field submissions."}
          </p>
          {!searchQuery && (
            <Button
              size="sm"
              onClick={() => setCreateModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Generate First Link
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredLinks.map((link) => {
            const isCopied = copiedId === link.id;
            const isActionLoading = actionLoadingId === link.id;

            return (
              <Card key={link.id} className="p-4 border-slate-200 bg-white shadow-sm hover:border-slate-300 transition-colors">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  {/* Member & Status Info */}
                  <div className="space-y-1.5 min-w-[220px]">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          {link.assigned_team_member_name}
                          {link.assigned_team_member_role && (
                            <span className="text-[10px] font-normal text-slate-500">
                              • {link.assigned_team_member_role}
                            </span>
                          )}
                        </div>
                        {link.assigned_team_member_email && (
                          <div className="text-[11px] text-slate-400">
                            {link.assigned_team_member_email}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-0.5">
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase font-bold px-2 py-0.5 ${
                          link.status === "active"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : link.status === "disabled"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {link.status}
                      </Badge>
                      <span>• Created {dayjs(link.created_at).format("DD MMM YYYY")}</span>
                      <span>• Last used: {link.last_used_at ? dayjs(link.last_used_at).fromNow() : "Never"}</span>
                    </div>
                  </div>

                  {/* Link Input & Share Tools */}
                  <div className="flex-1 max-w-xl">
                    <div className="flex items-center gap-1.5">
                      <Input
                        readOnly
                        value={getAbsoluteUrl(link)}
                        className="text-xs h-8 font-mono bg-slate-50 border-slate-200 text-slate-700 select-all"
                        onClick={(e) => e.target.select()}
                      />

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopy(link, link.id)}
                        className={`h-8 px-2.5 text-xs font-semibold shrink-0 gap-1 ${
                          isCopied ? "border-emerald-500 text-emerald-700 bg-emerald-50" : ""
                        }`}
                        title="Copy Public Link URL"
                      >
                        {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">{isCopied ? "Copied" : "Copy"}</span>
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleWhatsAppShare(link)}
                        className="h-8 px-2.5 text-xs font-semibold shrink-0 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-200 gap-1"
                        title="Share on WhatsApp"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">WhatsApp</span>
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.open(getAbsoluteUrl(link), "_blank")}
                        className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600 shrink-0"
                        title="Open in new tab"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Status Toggle & Regeneration Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                    {link.status !== "revoked" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isActionLoading}
                        onClick={() => handleToggleStatus(link)}
                        className={`text-xs h-8 px-2.5 font-medium ${
                          link.status === "active"
                            ? "text-amber-700 hover:bg-amber-50 border-amber-200"
                            : "text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                        }`}
                        title={link.status === "active" ? "Temporarily disable link" : "Enable link"}
                      >
                        <Power className="w-3 h-3 mr-1" />
                        {link.status === "active" ? "Disable" : "Enable"}
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isActionLoading}
                      onClick={() => setConfirmDialog({ open: true, type: "regenerate", link })}
                      className="text-xs h-8 px-2 text-slate-600 hover:text-blue-600"
                      title="Regenerate Token (Revokes old link)"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Regenerate
                    </Button>

                    {link.status !== "revoked" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isActionLoading}
                        onClick={() => setConfirmDialog({ open: true, type: "revoke", link })}
                        className="text-xs h-8 px-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                        title="Permanently Revoke Link"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal: Create Link */}
      {createModalOpen && (
        <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
          <DialogContent className="max-w-md bg-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <Link2 className="w-4 h-4 text-blue-600" /> Generate Material Request Link
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Choose a team member to assign this reusable link to. All submissions from this link will attribute to their workflow.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateLink} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  Select Team Member <span className="text-red-500">*</span>
                </Label>

                {isEmployeesLoading ? (
                  <div className="flex items-center gap-2 p-2.5 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                    <span>Loading company team members...</span>
                  </div>
                ) : employeesError ? (
                  <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">Unable to load team members:</span> {formatApiError(employeesError) || "Please check permissions or contact your admin."}
                    </div>
                  </div>
                ) : employees.length === 0 ? (
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>No eligible internal team members found in your company. Add employees in the Team module first.</div>
                  </div>
                ) : (
                  <select
                    required
                    value={selectedEmployeeId}
                    onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    className="w-full text-xs h-9 bg-white border border-slate-200 rounded-md px-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Choose Team Member --</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name || emp.name || "Unnamed"} {emp.role ? `(${emp.role})` : ""}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[11px] text-slate-400">
                  Note: If an active link already exists for this member, it will be retrieved and displayed ready to share.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Remarks / Purpose (Optional)</Label>
                <Textarea
                  placeholder="e.g. For on-site rooftop installation contractors"
                  value={linkRemarks}
                  onChange={(e) => setLinkRemarks(e.target.value)}
                  className="text-xs min-h-[60px]"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={creating}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={creating || !selectedEmployeeId}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs gap-1.5"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" /> Generate Link
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal: Link Ready to Share (Newly Created or Reused) */}
      {shareDialog.open && shareDialog.link && (
        <Dialog open={shareDialog.open} onOpenChange={(val) => !val && setShareDialog({ open: false, link: null, isReused: false, message: "" })}>
          <DialogContent className="max-w-md bg-white">
            <DialogHeader>
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-1">
                <Check className="w-5 h-5" />
              </div>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-base">
                Link Ready to Share
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-600 space-y-1 pt-1">
                {shareDialog.isReused ? (
                  <span className="text-amber-800 font-semibold bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 inline-block">
                    ℹ️ Existing Active Reusable Link
                  </span>
                ) : (
                  <span className="text-emerald-800 font-semibold bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 inline-block">
                    ✓ New Public Link Generated
                  </span>
                )}
                <div className="pt-1 text-slate-700">
                  Assigned to: <strong className="text-slate-900">{shareDialog.link.assigned_team_member_name || shareDialog.link.team_member_name}</strong>
                  {(shareDialog.link.assigned_team_member_role || shareDialog.link.team_member_role) && (
                    <span className="text-slate-500 font-normal"> ({shareDialog.link.assigned_team_member_role || shareDialog.link.team_member_role})</span>
                  )}. All public submissions will attribute to their workflow.
                </div>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Authoritative Public Request URL</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    readOnly
                    value={getAbsoluteUrl(shareDialog.link)}
                    className="text-xs h-9 font-mono bg-slate-50 border-slate-200 text-slate-800 select-all"
                    onClick={(e) => e.target.select()}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCopy(shareDialog.link, "share-modal")}
                    className={`h-9 px-3 text-xs font-semibold shrink-0 gap-1.5 ${
                      copiedId === "share-modal" ? "border-emerald-500 text-emerald-700 bg-emerald-50" : ""
                    }`}
                  >
                    {copiedId === "share-modal" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedId === "share-modal" ? "Copied" : "Copy"}</span>
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  onClick={() => handleWhatsAppShare(shareDialog.link)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 gap-1.5 shadow-sm"
                >
                  <MessageCircle className="w-4 h-4" /> Share on WhatsApp
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.open(getAbsoluteUrl(shareDialog.link), "_blank")}
                  className="text-xs h-9 px-3 gap-1.5 text-slate-700 border-slate-200"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Test Link
                </Button>
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShareDialog({ open: false, link: null, isReused: false, message: "" })}
                className="text-xs w-full sm:w-auto"
              >
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal: Confirm Regenerate / Revoke */}
      {confirmDialog.open && (
        <Dialog open={confirmDialog.open} onOpenChange={(val) => !val && setConfirmDialog({ open: false, type: null, link: null })}>
          <DialogContent className="max-w-sm bg-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                {confirmDialog.type === "regenerate" ? "Regenerate Request Link?" : "Revoke Public Link?"}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-600 pt-1">
                {confirmDialog.type === "regenerate" ? (
                  <>
                    Regenerating will create a <strong>new URL token</strong>. Anyone with the old link will no longer be able to submit requests.
                  </>
                ) : (
                  <>
                    Revoking will <strong>permanently deactivate</strong> this public link. This action cannot be undone.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDialog({ open: false, type: null, link: null })}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={confirmDialog.type === "regenerate" ? executeRegenerate : executeRevoke}
                className={`text-xs font-semibold text-white ${
                  confirmDialog.type === "regenerate" ? "bg-blue-600 hover:bg-blue-700" : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {confirmDialog.type === "regenerate" ? "Confirm & Regenerate" : "Revoke Permanently"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
