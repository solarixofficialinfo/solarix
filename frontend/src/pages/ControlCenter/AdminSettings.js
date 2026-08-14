import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import { Settings, ShieldCheck, Lock, Activity, Server, KeyRound, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function AdminSettings() {
  const { user } = useAuth();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [updatingPass, setUpdatingPass] = useState(false);

  useEffect(() => {
    fetchHealth();
  }, []);

  const fetchHealth = async () => {
    try {
      setLoading(true);
      const res = await api.get("/platform-owner/health");
      setServices(res.data.services || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!currentPass || !newPass) {
      toast.error("Please enter both current and new password");
      return;
    }
    if (newPass.length < 6) {
      toast.error("New password must be at least 6 characters long");
      return;
    }
    try {
      setUpdatingPass(true);
      await api.post("/auth/change-password", {
        old_password: currentPass,
        new_password: newPass,
      });
      toast.success("Super Admin password changed successfully!");
      setCurrentPass("");
      setNewPass("");
    } catch (err) {
      toast.error("Failed to update password. Verify current password.");
    } finally {
      setUpdatingPass(false);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
          <Settings className="w-5 h-5 text-blue-400" /> Super Admin Security & Platform Settings
        </h1>
        <p className="text-xs text-slate-400">
          Manage Super Admin credential security, system status, and backend service operational metrics.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SUPER ADMIN CREDENTIAL CONTROL */}
        <Card className="bg-slate-950 border-slate-800 text-slate-100 shadow-lg">
          <CardHeader className="border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
              <Lock className="w-4 h-4" /> Super Admin Credential Security
            </div>
            <CardDescription className="text-xs text-slate-400">
              Update authentication credentials for the platform owner account.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-800/40 space-y-1">
              <div className="text-xs font-semibold text-blue-300 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-400" /> Authenticated Super Admin
              </div>
              <div className="text-xs font-mono text-slate-300">{user?.email || "admin@solarix.com"}</div>
              <div className="text-[10px] text-slate-400">Role: Platform Owner / Super Admin</div>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-3 pt-2">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 uppercase">Current Password</label>
                <Input
                  type="password"
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                  className="bg-slate-900 border-slate-700 text-xs text-white mt-1"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-300 uppercase">New Super Admin Password</label>
                <Input
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  className="bg-slate-900 border-slate-700 text-xs text-white mt-1"
                  required
                />
              </div>

              <Button type="submit" disabled={updatingPass} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs mt-2">
                <KeyRound className="w-3.5 h-3.5 mr-1.5" />
                {updatingPass ? "Updating Password..." : "Update Super Admin Password"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* SYSTEM HEALTH MONITOR */}
        <Card className="bg-slate-950 border-slate-800 text-slate-100 shadow-lg">
          <CardHeader className="border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <Server className="w-4 h-4" /> System Health & Gateway Monitor
            </div>
            <CardDescription className="text-xs text-slate-400">
              Live service status and database response latency.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-3">
            {loading ? (
              <div className="p-4 text-center text-slate-400 font-mono text-xs">Checking service status...</div>
            ) : (
              services.map((srv, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="font-semibold text-white text-xs">{srv.name}</div>
                      <div className="text-[10px] text-slate-400">Latency: {srv.latency}</div>
                    </div>
                  </div>
                  <Badge className="bg-emerald-950 text-emerald-300 border-emerald-800 text-[10px]">{srv.status}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
