import React, { useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus, Trash2, Pencil, ShieldCheck, User, Lock, Key, ChevronDown, ChevronRight,
  Info, Check, UserCheck, AlertTriangle
} from "lucide-react";
import { useEmployeeList, useInvalidateTeam } from "@/hooks/useTeam";
import { useEntitlements } from "@/hooks/useEntitlements";
import PageHeader from "@/components/PageHeader";

const ROLES = ["Admin", "Manager", "Staff", "Installer", "Viewer"];

const MODULE_GROUPS = [
  {
    group: "WORKSPACE",
    modules: [
      { key: "dashboard", label: "Dashboard", actions: ["view"] },
      { key: "solar_designer", label: "3D Solar Designer", actions: ["view", "create", "edit", "delete", "approve"] },
      { key: "leads", label: "Leads Management", actions: ["view", "create", "edit", "delete", "approve"] },
      { key: "clients", label: "Clients", actions: ["view", "create", "edit", "delete"] },
      { key: "project_execution", label: "Project Execution", actions: ["view", "create", "edit", "delete", "approve"] },
      { key: "task_portal", label: "Task Portal", actions: ["view", "create", "edit", "delete", "approve"] },
    ]
  },
  {
    group: "OPERATIONS",
    modules: [
      { key: "receivables", label: "Receivables & Collection", actions: ["view", "create", "edit", "delete", "approve"] },
      {
        key: "data_management",
        label: "Data Management (Inventory)",
        actions: ["view", "create", "edit", "delete", "approve"],
        hasSubModules: true,
        subModules: [
          { key: "inward", label: "Inward", actions: ["view", "create", "edit", "delete", "approve"] },
          { key: "outward", label: "Outward", actions: ["view", "create", "edit", "delete", "approve"] },
          { key: "product_master", label: "Product Master", actions: ["view", "create", "edit", "delete"] },
          { key: "balance_report", label: "Balance Report", actions: ["view"] },
          { key: "history", label: "History", actions: ["view"] },
          { key: "high_value_goods", label: "High Value Goods", actions: ["view", "edit"] },
          { key: "material_requests", label: "Material Requests", actions: ["view", "create", "edit", "delete", "approve"] },
        ]
      },
      { key: "client_data", label: "Client Data", actions: ["view", "create", "edit", "delete"] },
      { key: "reports", label: "Reports", actions: ["view"] },
    ]
  },
  {
    group: "DOCUMENTS",
    modules: [
      { key: "sales_documents", label: "Sales Documents", actions: ["view", "create", "edit", "delete", "approve"] },
      { key: "purchase_orders", label: "Purchase Orders", actions: ["view", "create", "edit", "delete", "approve"] },
      { key: "documents", label: "Document Templates", actions: ["view", "create", "edit", "delete"] },
    ]
  },
  {
    group: "ADMINISTRATION",
    modules: [
      { key: "team", label: "Team & Access", actions: ["view", "create", "edit", "delete", "approve"] },
      { key: "settings", label: "Company Details", actions: ["view", "edit"] },
      { key: "activity_log", label: "Activity Log", actions: ["view"] },
      { key: "billing", label: "Billing & Subscription", actions: ["view", "edit"] },
    ]
  }
];

const ACTION_LABELS = {
  view: "View — Open & read records",
  create: "Create — Add new records",
  edit: "Edit — Modify existing records",
  delete: "Delete — Cancel/Remove records",
  approve: "Approve — Authorize workflow steps"
};

const emptyPermissions = () => {
  const perms = {};
  MODULE_GROUPS.forEach((g) => {
    g.modules.forEach((m) => {
      perms[m.key] = { view: false, create: false, edit: false, delete: false, approve: false };
      if (m.hasSubModules) {
        m.subModules.forEach((sm) => {
          perms[`dm_${sm.key}`] = { view: false, create: false, edit: false, delete: false, approve: false };
        });
      }
    });
  });
  return perms;
};

const getPresetPermissions = (role) => {
  const perms = emptyPermissions();
  if (role === "Super Admin" || role === "Admin") {
    Object.keys(perms).forEach((k) => {
      perms[k] = { view: true, create: true, edit: true, delete: true, approve: true };
    });
    return perms;
  }

  const grant = (key, actions) => {
    perms[key] = {
      view: actions.includes("view"),
      create: actions.includes("create"),
      edit: actions.includes("edit"),
      delete: actions.includes("delete"),
      approve: actions.includes("approve")
    };
  };

  if (role === "Manager") {
    ["dashboard", "solar_designer", "leads", "clients", "project_execution", "task_portal", "receivables", "data_management", "client_data", "reports", "sales_documents", "purchase_orders", "documents"].forEach((k) => {
      grant(k, ["view", "create", "edit", "approve"]);
    });
    ["inward", "outward", "product_master", "balance_report", "history", "high_value_goods", "material_requests"].forEach((sm) => {
      grant(`dm_${sm}`, ["view", "create", "edit", "approve"]);
    });
  } else if (role === "Staff") {
    ["dashboard", "solar_designer", "leads", "clients", "task_portal", "data_management", "sales_documents", "documents"].forEach((k) => {
      grant(k, ["view", "create", "edit"]);
    });
    ["inward", "outward", "product_master", "balance_report", "history"].forEach((sm) => {
      grant(`dm_${sm}`, ["view", "create", "edit"]);
    });
  } else if (role === "Installer") {
    grant("solar_designer", ["view"]);
    grant("task_portal", ["view", "edit"]);
    grant("clients", ["view"]);
    grant("client_data", ["view"]);
  } else if (role === "Viewer") {
    ["dashboard", "solar_designer", "leads", "clients", "task_portal", "project_execution", "data_management", "client_data", "reports", "sales_documents"].forEach((k) => {
      grant(k, ["view"]);
    });
  }

  return perms;
};

export default function Team() {
  const { data: list = [], isLoading } = useEmployeeList();
  const invalidateTeam = useInvalidateTeam();
  const { isPageAllowed, hasFeature, planName } = useEntitlements();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [activeTab, setActiveTab] = useState("permissions");
  const [preset, setPreset] = useState("Role Default");
  const [expandedGroups, setExpandedGroups] = useState({ data_management: true });

  const [form, setForm] = useState({
    name: "",
    mobile: "",
    email: "",
    employee_id: "",
    password: "",
    role: "Staff",
    status: "Active",
    permissions: getPresetPermissions("Staff")
  });
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditingUser(null);
    setActiveTab("permissions");
    setPreset("Role Default");
    setForm({
      name: "",
      mobile: "",
      email: "",
      employee_id: "",
      password: "",
      role: "Staff",
      status: "Active",
      permissions: getPresetPermissions("Staff")
    });
    setModalOpen(true);
  };

  const openEdit = (u) => {
    setEditingUser(u);
    setActiveTab("permissions");
    setPreset("Custom");
    setForm({
      name: u.name || "",
      mobile: u.mobile || "",
      email: u.email || "",
      employee_id: u.employee_id || "",
      password: "",
      role: u.role || "Staff",
      status: u.status || "Active",
      permissions: u.permissions || getPresetPermissions(u.role || "Staff")
    });
    setModalOpen(true);
  };

  const handleRoleChange = (newRole) => {
    setForm((f) => ({
      ...f,
      role: newRole,
      permissions: getPresetPermissions(newRole)
    }));
    setPreset("Role Default");
  };

  const handlePresetSelect = (presetName) => {
    setPreset(presetName);
    if (presetName !== "Custom") {
      const targetRole = presetName === "Full Access" ? "Admin" : presetName;
      setForm((f) => ({
        ...f,
        permissions: getPresetPermissions(targetRole)
      }));
    }
  };

  const togglePermission = (moduleKey, action) => {
    setPreset("Custom");
    setForm((f) => {
      const curMod = f.permissions?.[moduleKey] || {};
      return {
        ...f,
        permissions: {
          ...f.permissions,
          [moduleKey]: {
            ...curMod,
            [action]: !curMod[action]
          }
        }
      };
    });
  };

  const toggleRowAll = (moduleKey, actions) => {
    setPreset("Custom");
    setForm((f) => {
      const curMod = f.permissions?.[moduleKey] || {};
      const allActive = actions.every((a) => curMod[a]);
      const newMod = {};
      actions.forEach((a) => { newMod[a] = !allActive; });
      return {
        ...f,
        permissions: {
          ...f.permissions,
          [moduleKey]: newMod
        }
      };
    });
  };

  const toggleColumnAll = (action) => {
    setPreset("Custom");
    setForm((f) => {
      const newPerms = { ...f.permissions };
      let allActive = true;
      Object.keys(newPerms).forEach((k) => {
        if (!newPerms[k]?.[action]) allActive = false;
      });
      Object.keys(newPerms).forEach((k) => {
        newPerms[k] = { ...newPerms[k], [action]: !allActive };
      });
      return { ...f, permissions: newPerms };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Please enter team member name");
      return;
    }
    const cleanMobile = form.mobile.replace(/\D/g, "");
    if (cleanMobile.length !== 10) {
      toast.error("Mobile number must be exactly 10 digits");
      return;
    }
    if (!editingUser && (!form.password || form.password.length < 6)) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        mobile: cleanMobile,
        employee_id: form.employee_id?.trim() || undefined
      };
      if (editingUser) {
        if (!payload.password) delete payload.password;
        await api.put(`/employees/${editingUser.id}`, payload);
        toast.success("Team member updated successfully");
      } else {
        await api.post("/employees", payload);
        toast.success("Team member added successfully");
      }
      setModalOpen(false);
      invalidateTeam();
      window.dispatchEvent(new Event("solarix:auth-refresh"));
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (u) => {
    if (u.role === "Super Admin" || u.user_type === "owner") {
      toast.error("Cannot delete Super Admin or Owner account");
      return;
    }
    if (!window.confirm(`Are you sure you want to remove ${u.name}?`)) return;
    try {
      await api.delete(`/employees/${u.id}`);
      toast.success("Team member removed");
      invalidateTeam();
      window.dispatchEvent(new Event("solarix:auth-refresh"));
    } catch (err) {
      toast.error(formatApiError(err));
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Team & Access Control"
        subtitle="Manage employee accounts, assign enterprise roles, and configure granular page permissions."
        badge={`${list.length} Members`}
        actions={
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 font-semibold shadow-2xs gap-1.5 text-xs">
            <Plus className="w-4 h-4" /> Add Team Member
          </Button>
        }
      />

      {/* TABLE VIEW (DESKTOP) & CARDS (MOBILE) */}
      <Card className="border-slate-200 overflow-hidden shadow-2xs">
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Team Member</th>
                <th className="px-4 py-3">Employee ID</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    No team members found. Click "Add Team Member" to get started.
                  </td>
                </tr>
              )}
              {list.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <User className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>{u.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600">{u.employee_id || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-slate-800">{u.email}</div>
                    <div className="text-[11px] text-slate-500 font-mono">{u.mobile}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-semibold">
                      {u.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={u.status === "Active" ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-slate-100 text-slate-600 border-slate-300"}
                    >
                      {u.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <Button variant="ghost" size="xs" onClick={() => openEdit(u)} className="h-7 w-7 p-0 text-slate-600 hover:text-blue-600">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    {u.user_type !== "owner" && u.role !== "Super Admin" && (
                      <Button variant="ghost" size="xs" onClick={() => handleRemove(u)} className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* MOBILE RESPONSIVE MEMBER CARDS */}
        <div className="md:hidden divide-y divide-slate-100 p-3 space-y-3">
          {list.map((u) => (
            <div key={u.id} className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <User className="w-4 h-4 text-blue-600" /> {u.name}
                </div>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
                  {u.role}
                </Badge>
              </div>

              <div className="space-y-0.5 text-[11px] text-slate-500 font-mono">
                <div>Email: {u.email}</div>
                <div>Mobile: {u.mobile}</div>
                <div>ID: {u.employee_id || "N/A"}</div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <Badge variant="outline" className={u.status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}>
                  {u.status}
                </Badge>

                <div className="flex items-center gap-2">
                  <Button size="xs" variant="outline" onClick={() => openEdit(u)} className="h-7 text-xs text-blue-600 gap-1">
                    <Pencil className="w-3 h-3" /> Edit
                  </Button>
                  {u.user_type !== "owner" && u.role !== "Super Admin" && (
                    <Button size="xs" variant="ghost" onClick={() => handleRemove(u)} className="h-7 text-xs text-rose-600 p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ─── TEAM MEMBER MODAL (COMPACT 2-TAB PREMIUM LAYOUT) ───────────────── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col rounded-2xl p-5 sm:p-6 overflow-hidden bg-white shadow-xl">
          <DialogHeader className="border-b border-slate-100 pb-3 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-base sm:text-lg">
              <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
              <span className="truncate">{editingUser ? `Edit Team Member — ${editingUser.name}` : "Add New Team Member"}</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden min-h-0 text-xs pt-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden min-h-0 space-y-3">
              <TabsList className="grid grid-cols-2 w-full bg-slate-100 p-1 rounded-xl shrink-0">
                <TabsTrigger value="permissions" className="text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 py-1.5 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-xs">
                  <ShieldCheck className="w-3.5 h-3.5" /> Access Permissions
                </TabsTrigger>
                <TabsTrigger value="settings" className="text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 py-1.5 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-xs">
                  <User className="w-3.5 h-3.5" /> Role / Settings
                </TabsTrigger>
              </TabsList>

              {/* TAB 1: ACCESS PERMISSIONS MATRIX */}
              <TabsContent value="permissions" className="flex flex-col flex-1 overflow-hidden min-h-0 space-y-2.5 m-0 data-[state=inactive]:hidden">
                {/* PRESETS HEADER BAR */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/90 px-3 py-2 rounded-xl border border-slate-200 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-700 text-xs">Permission Preset:</span>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-mono text-[11px] font-semibold px-2 py-0.5">
                      {preset}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 sm:pb-0">
                    {["Role Default", "Full Access", "Manager", "Staff", "Installer", "Viewer"].map((pr) => (
                      <Button
                        key={pr}
                        type="button"
                        size="xs"
                        variant={preset === pr ? "default" : "outline"}
                        onClick={() => handlePresetSelect(pr === "Role Default" ? form.role : pr)}
                        className={`h-7 text-[11px] font-medium shrink-0 ${
                          preset === pr ? "bg-blue-600 text-white shadow-2xs hover:bg-blue-700" : "bg-white text-slate-700 hover:bg-slate-100 border-slate-200"
                        }`}
                      >
                        {pr}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* HIERARCHY CLARITY CALLOUT */}
                <div className="text-[11px] text-slate-600 bg-blue-50/70 px-3 py-2 rounded-xl border border-blue-200/80 flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>
                      <strong>Access Hierarchy:</strong> Modules marked <span className="text-emerald-700 font-semibold">Included</span> are active in your <strong>{planName}</strong> plan. Assigned permissions grant employee access strictly within the plan's capabilities.
                    </span>
                  </div>
                </div>

                {/* PERMISSION MATRIX TABLE */}
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white flex-1 min-h-0 flex flex-col">
                  <div className="overflow-y-auto overflow-x-auto flex-1 max-h-[52vh]">
                    <table className="w-full text-xs text-left min-w-[580px]">
                      <thead className="bg-slate-100/90 text-slate-700 font-semibold border-b border-slate-200 sticky top-0 z-10 backdrop-blur-xs">
                        <tr>
                          <th className="py-2 px-3 min-w-[180px]">Module / Page</th>
                          <th className="py-2 px-2 text-center w-28">Plan Status</th>
                          {["view", "create", "edit", "delete", "approve"].map((action) => (
                            <th key={action} className="py-2 px-2 text-center capitalize w-16">
                              <button
                                type="button"
                                onClick={() => toggleColumnAll(action)}
                                className="hover:text-blue-700 text-slate-700 font-bold transition-colors"
                                title={`Toggle ${action} for all modules`}
                              >
                                {action}
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {MODULE_GROUPS.map((grp) => (
                          <React.Fragment key={grp.group}>
                            <tr className="bg-slate-50/80">
                              <td colSpan={7} className="px-3 py-1 font-bold text-[10px] text-slate-500 tracking-wider uppercase">
                                {grp.group}
                              </td>
                            </tr>
                            {grp.modules.map((m) => {
                              const isModuleEntitled = isPageAllowed(m.key);
                              return (
                                <React.Fragment key={m.key}>
                                  <tr className="hover:bg-slate-50/70 transition-colors">
                                    <td className="py-2 px-3 font-semibold text-slate-900 flex items-center justify-between">
                                      <span className="truncate pr-2">{m.label}</span>
                                      {m.hasSubModules && (
                                        <button
                                          type="button"
                                          onClick={() => setExpandedGroups((prev) => ({ ...prev, [m.key]: !prev[m.key] }))}
                                          className="text-blue-600 text-[11px] font-medium flex items-center gap-0.5 hover:underline shrink-0"
                                        >
                                          {expandedGroups[m.key] ? "Hide Detail" : "Granular"}
                                          {expandedGroups[m.key] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                        </button>
                                      )}
                                    </td>
                                    <td className="py-2 px-2 text-center">
                                      {isModuleEntitled ? (
                                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold py-0.5 px-1.5 gap-1 shrink-0 inline-flex items-center">
                                          <Check className="w-2.5 h-2.5 text-emerald-600" /> Included
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200 text-[10px] font-medium py-0.5 px-1.5 gap-1 shrink-0 inline-flex items-center" title={`Not included in ${planName} plan`}>
                                          <Lock className="w-2.5 h-2.5 text-slate-400" /> Not in {planName}
                                        </Badge>
                                      )}
                                    </td>
                                    {["view", "create", "edit", "delete", "approve"].map((action) => {
                                      const isApplicable = m.actions.includes(action);
                                      const isChecked = !!form.permissions?.[m.key]?.[action];
                                      return (
                                        <td key={action} className="py-1.5 px-2 text-center">
                                          {isApplicable ? (
                                            <div className="flex items-center justify-center">
                                              <Checkbox
                                                checked={isChecked}
                                                onCheckedChange={() => togglePermission(m.key, action)}
                                                className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                              />
                                            </div>
                                          ) : (
                                            <span className="text-slate-300 select-none">—</span>
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>

                                  {/* GRANULAR SUB-MODULES FOR DATA MANAGEMENT */}
                                  {m.hasSubModules && expandedGroups[m.key] && m.subModules.map((sm) => {
                                    const isSubEntitled = sm.key === "high_value_goods" ? hasFeature("high_value_goods") : isPageAllowed("data_management");
                                    return (
                                      <tr key={sm.key} className="bg-slate-50/40 border-t border-slate-100 hover:bg-slate-50 transition-colors">
                                        <td className="py-1.5 pl-7 pr-3 text-slate-700 font-mono text-[11px]">
                                          ↳ {sm.label}
                                        </td>
                                        <td className="py-1.5 px-2 text-center">
                                          {isSubEntitled ? (
                                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-semibold py-0.5 px-1.5 gap-1 shrink-0 inline-flex items-center">
                                              <Check className="w-2.5 h-2.5 text-emerald-600" /> Included
                                            </Badge>
                                          ) : (
                                            <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200 text-[10px] font-medium py-0.5 px-1.5 gap-1 shrink-0 inline-flex items-center" title={`Not included in ${planName} plan`}>
                                              <Lock className="w-2.5 h-2.5 text-slate-400" /> Not in {planName}
                                            </Badge>
                                          )}
                                        </td>
                                        {["view", "create", "edit", "delete", "approve"].map((action) => {
                                          const isApp = sm.actions.includes(action);
                                          const isChecked = !!form.permissions?.[`dm_${sm.key}`]?.[action];
                                          return (
                                            <td key={action} className="py-1.5 px-2 text-center">
                                              {isApp ? (
                                                <div className="flex items-center justify-center">
                                                  <Checkbox
                                                    checked={isChecked}
                                                    onCheckedChange={() => togglePermission(`dm_${sm.key}`, action)}
                                                    className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                                  />
                                                </div>
                                              ) : (
                                                <span className="text-slate-300 select-none">—</span>
                                              )}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>

              {/* TAB 2: ROLE / SETTINGS (CONSOLIDATED) */}
              <TabsContent value="settings" className="overflow-y-auto space-y-3.5 m-0 data-[state=inactive]:hidden pr-0.5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Full Name *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="e.g. Rahul Sharma"
                      className="mt-1 h-9 text-xs"
                      required
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Mobile Number (10 Digits) *</Label>
                    <Input
                      value={form.mobile}
                      onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                      placeholder="e.g. 9876543210"
                      maxLength={10}
                      className="mt-1 h-9 text-xs font-mono font-semibold"
                      required
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Work Email *</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="e.g. rahul@solarix.com"
                      className="mt-1 h-9 text-xs font-mono"
                      required
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Employee ID</Label>
                    <Input
                      value={form.employee_id}
                      onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                      placeholder="e.g. EMP-2026-001 (Auto-generated if blank)"
                      className="mt-1 h-9 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">
                      {editingUser ? "Password (Leave blank to keep unchanged)" : "Password (Min 6 chars) *"}
                    </Label>
                    <Input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="••••••••"
                      className="mt-1 h-9 text-xs font-mono"
                      required={!editingUser}
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Role Preset</Label>
                    <Select
                      value={editingUser && (editingUser.role === "Super Admin" || editingUser.user_type === "owner") ? editingUser.role : form.role}
                      onValueChange={handleRoleChange}
                      disabled={editingUser && (editingUser.role === "Super Admin" || editingUser.user_type === "owner")}
                    >
                      <SelectTrigger className="mt-1 h-9 text-xs bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent className="text-xs">
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Account Status</Label>
                    <div className="flex items-center gap-3 mt-2">
                      <Switch
                        checked={form.status === "Active"}
                        onCheckedChange={(v) => setForm({ ...form, status: v ? "Active" : "Inactive" })}
                        disabled={editingUser && (editingUser.role === "Super Admin" || editingUser.user_type === "owner")}
                      />
                      <span className="font-semibold text-xs text-slate-800">{form.status}</span>
                    </div>
                  </div>

                  {editingUser && (
                    <div className="flex flex-col justify-center">
                      <Label className="text-xs font-semibold text-slate-700">Last Login</Label>
                      <div className="mt-1 font-mono text-xs text-slate-600">
                        {editingUser.last_login_at ? new Date(editingUser.last_login_at).toLocaleString() : "Never logged in"}
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200 text-amber-900 flex items-start gap-2 text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-800 leading-relaxed">
                    Changes to team permissions take effect on the next session refresh or login. Super Admin credentials cannot be deleted or revoked.
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0 mt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)} disabled={saving} className="h-8 text-xs font-medium">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving} className="h-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-2xs">
                {saving ? "Saving Changes..." : "Save Team Member"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
