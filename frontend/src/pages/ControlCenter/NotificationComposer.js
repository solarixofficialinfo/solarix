import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import { Bell, Send, Tag, Gift, AlertTriangle, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function NotificationComposer() {
  const [targetType, setTargetType] = useState("all");
  const [targetCompanyId, setTargetCompanyId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [notifType, setNotifType] = useState("Announcement");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Offers state
  const [offerTitle, setOfferTitle] = useState("");
  const [offerDesc, setOfferDesc] = useState("");
  const [offerCode, setOfferCode] = useState("");
  const [targetPlan, setTargetPlan] = useState("all");
  const [offersList, setOffersList] = useState([]);
  const [creatingOffer, setCreatingOffer] = useState(false);

  useEffect(() => {
    fetchOffers();
  }, []);

  const fetchOffers = async () => {
    try {
      const res = await api.get("/platform-owner/offers");
      setOffersList(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendNotification = async (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      toast.error("Please enter both notification title and message");
      return;
    }
    try {
      setSending(true);
      await api.post("/platform-owner/notifications", {
        target_type: targetType,
        target_company_id: targetCompanyId,
        target_user_id: targetUserId,
        type: notifType,
        title: title.trim(),
        message: message.trim(),
      });
      toast.success("Platform notification dispatched successfully!");
      setTitle("");
      setMessage("");
    } catch (err) {
      toast.error("Failed to send notification");
    } finally {
      setSending(false);
    }
  };

  const handleCreateOffer = async (e) => {
    e.preventDefault();
    if (!offerTitle.trim() || !offerDesc.trim()) {
      toast.error("Please enter title and description for the offer");
      return;
    }
    try {
      setCreatingOffer(true);
      await api.post("/platform-owner/offers", {
        title: offerTitle.trim(),
        description: offerDesc.trim(),
        offer_code: offerCode.trim(),
        target_plan: targetPlan,
        cta_text: "Upgrade Plan",
        cta_url: "/pricing",
      });
      toast.success("Promotional offer created successfully!");
      setOfferTitle("");
      setOfferDesc("");
      setOfferCode("");
      fetchOffers();
    } catch (err) {
      toast.error("Failed to create offer");
    } finally {
      setCreatingOffer(false);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
          <Bell className="w-5 h-5 text-blue-400" /> Notifications & Promotional Offer Center
        </h1>
        <p className="text-xs text-slate-400">
          Dispatch targeted announcements, maintenance warnings, and greeting offers across all workspace tenants.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* NOTIFICATION COMPOSER */}
        <Card className="bg-slate-950 border-slate-800 text-slate-100 shadow-lg">
          <CardHeader className="border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
              <Send className="w-4 h-4" /> Platform Notification Composer
            </div>
            <CardDescription className="text-xs text-slate-400">
              Broadcast announcements directly to customer notification bells.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <form onSubmit={handleSendNotification} className="space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 uppercase">Target Audience</label>
                <Select value={targetType} onValueChange={setTargetType}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-xs text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-white text-xs">
                    <SelectItem value="all">Broadcast to All Tenants & Users</SelectItem>
                    <SelectItem value="company">Specific Workspace / Company ID</SelectItem>
                    <SelectItem value="user">Specific User Account ID</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {targetType === "company" && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 uppercase">Company ID</label>
                  <Input
                    placeholder="e.g. 7da2622b-3882-4b69-ab5e-defc41ea29c3"
                    value={targetCompanyId}
                    onChange={(e) => setTargetCompanyId(e.target.value)}
                    className="bg-slate-900 border-slate-700 text-xs font-mono text-white mt-1"
                    required
                  />
                </div>
              )}

              {targetType === "user" && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 uppercase">User ID</label>
                  <Input
                    placeholder="e.g. 527cb359-af07-422c-b47f-a5bb64427932"
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    className="bg-slate-900 border-slate-700 text-xs font-mono text-white mt-1"
                    required
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 uppercase">Category Type</label>
                  <Select value={notifType} onValueChange={setNotifType}>
                    <SelectTrigger className="bg-slate-900 border-slate-700 text-xs text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white text-xs">
                      <SelectItem value="Announcement">Announcement</SelectItem>
                      <SelectItem value="Update">Update</SelectItem>
                      <SelectItem value="Maintenance">Scheduled Maintenance</SelectItem>
                      <SelectItem value="Feature Release">Feature Release</SelectItem>
                      <SelectItem value="Subscription Reminder">Subscription Reminder</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 uppercase">Notification Title</label>
                  <Input
                    placeholder="e.g. Important Maintenance Update"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="bg-slate-900 border-slate-700 text-xs text-white mt-1"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 uppercase">Notification Message Body</label>
                <Textarea
                  rows={4}
                  placeholder="Enter message text..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="bg-slate-900 border-slate-700 text-xs text-white mt-1 resize-none"
                  required
                />
              </div>

              <Button type="submit" disabled={sending} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs">
                <Send className="w-3.5 h-3.5 mr-1.5" />
                {sending ? "Dispatching Notification..." : "Dispatch Notification"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* PROMOTIONAL OFFER & GREETING MANAGER */}
        <Card className="bg-slate-950 border-slate-800 text-slate-100 shadow-lg flex flex-col">
          <CardHeader className="border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <Gift className="w-4 h-4" /> Promotional Offer & Greeting Manager
            </div>
            <CardDescription className="text-xs text-slate-400">
              Create marketing banners and upgrade discount codes displayed on customer dashboards.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-4 flex-1 flex flex-col justify-between">
            <form onSubmit={handleCreateOffer} className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 uppercase">Offer Title</label>
                <Input
                  placeholder="e.g. 20% Off Annual Plan Upgrade"
                  value={offerTitle}
                  onChange={(e) => setOfferTitle(e.target.value)}
                  className="bg-slate-900 border-slate-700 text-xs text-white mt-1"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 uppercase">Promo / Coupon Code</label>
                  <Input
                    placeholder="e.g. SOLAR20"
                    value={offerCode}
                    onChange={(e) => setOfferCode(e.target.value)}
                    className="bg-slate-900 border-slate-700 text-xs font-mono text-white mt-1 uppercase"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 uppercase">Target Plan</label>
                  <Select value={targetPlan} onValueChange={setTargetPlan}>
                    <SelectTrigger className="bg-slate-900 border-slate-700 text-xs text-white mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white text-xs">
                      <SelectItem value="all">All Plans</SelectItem>
                      <SelectItem value="starter">Starter Plan Users</SelectItem>
                      <SelectItem value="growth">Growth Plan Users</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 uppercase">Offer Description</label>
                <Textarea
                  rows={3}
                  placeholder="Upgrade to annual billing today and save ₹12,000 on your subscription!"
                  value={offerDesc}
                  onChange={(e) => setOfferDesc(e.target.value)}
                  className="bg-slate-900 border-slate-700 text-xs text-white mt-1 resize-none"
                  required
                />
              </div>

              <Button type="submit" disabled={creatingOffer} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
                <Gift className="w-3.5 h-3.5 mr-1.5" />
                {creatingOffer ? "Publishing Offer..." : "Publish Promotional Offer"}
              </Button>
            </form>

            {/* Active Offers List */}
            <div className="pt-4 border-t border-slate-800 space-y-2">
              <div className="text-[11px] font-semibold text-slate-300">Active Published Offers</div>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {offersList.length === 0 ? (
                  <div className="text-xs text-slate-500 italic">No promotional offers active currently.</div>
                ) : (
                  offersList.map((off) => (
                    <div key={off.id} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-white text-xs">{off.title}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-xs">{off.description}</div>
                      </div>
                      {off.offer_code && <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 font-mono text-[10px]">{off.offer_code}</Badge>}
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
