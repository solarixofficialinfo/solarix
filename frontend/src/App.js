import React, { useState, useEffect, lazy, Suspense } from "react";
import "@/App.css";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "sonner";
import SubscriptionGuardModal from "@/components/SubscriptionGuardModal";
// Eager load Login for instant auth rendering
import Login from "@/pages/Login";

// Lazy load layout & secondary pages for route code-splitting
const Layout = lazy(() => import("@/components/Layout"));
const Register = lazy(() => import("@/pages/Register"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Clients = lazy(() => import("@/pages/Clients"));
const ClientNew = lazy(() => import("@/pages/ClientNew"));
const ClientDetail = lazy(() => import("@/pages/ClientDetail"));
const Team = lazy(() => import("@/pages/Team"));
const Profile = lazy(() => import("@/pages/Profile"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const ActivityLog = lazy(() => import("@/pages/ActivityLog"));
const ProjectExecution = lazy(() => import("@/pages/ProjectExecution"));
const TaskPortal = lazy(() => import("@/pages/TaskPortal"));
const Inventory = lazy(() => import("@/pages/Inventory"));
const DocumentTemplates = lazy(() => import("@/pages/DocumentTemplates"));
const Quotation = lazy(() => import("@/pages/Quotation"));
const TaxInvoice = lazy(() => import("@/pages/TaxInvoice"));
const DeliveryBill = lazy(() => import("@/pages/DeliveryBill"));
const SalesDocuments = lazy(() => import("@/pages/SalesDocuments"));
const ClientData = lazy(() => import("@/pages/ClientData"));
const ClientDataDetail = lazy(() => import("@/pages/ClientDataDetail"));
const Complaints = lazy(() => import("@/pages/Complaints"));
const ComplaintDetail = lazy(() => import("@/pages/ComplaintDetail"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const Reports = lazy(() => import("@/pages/Reports"));
const Receivables = lazy(() => import("@/pages/Receivables"));
const Vendors = lazy(() => import("@/pages/Vendors"));
const PurchaseOrders = lazy(() => import("@/pages/PurchaseOrders"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const MaterialRequests = lazy(() => import("@/pages/MaterialRequests"));

const ControlCenterLayout = lazy(() => import("@/pages/ControlCenter/ControlCenterLayout"));
const ControlCenterDashboard = lazy(() => import("@/pages/ControlCenter/ControlCenterDashboard"));
const CustomerList = lazy(() => import("@/pages/ControlCenter/CustomerList"));
const CustomerDetail = lazy(() => import("@/pages/ControlCenter/CustomerDetail"));
const PlansEntitlements = lazy(() => import("@/pages/ControlCenter/PlansEntitlements"));
const NotificationComposer = lazy(() => import("@/pages/ControlCenter/NotificationComposer"));
const PerformanceAnalytics = lazy(() => import("@/pages/ControlCenter/PerformanceAnalytics"));
const PageAnalytics = lazy(() => import("@/pages/ControlCenter/PageAnalytics"));
const FeedbackInbox = lazy(() => import("@/pages/ControlCenter/FeedbackInbox"));
const SystemHealth = lazy(() => import("@/pages/ControlCenter/SystemHealth"));
const AuditLogs = lazy(() => import("@/pages/ControlCenter/AuditLogs"));
const AdminSettings = lazy(() => import("@/pages/ControlCenter/AdminSettings"));
const Billing = lazy(() => import("@/pages/Billing"));
const AdminMetrics = lazy(() => import("@/pages/AdminMetrics"));

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh] p-8 text-slate-400 text-sm font-medium">
      Loading...
    </div>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500">Loading…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50"><div className="text-slate-500">Loading…</div></div>}>
      <Layout>{children}</Layout>
    </Suspense>
  );
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-sm max-w-md mx-auto my-12">
      <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2" style={{ fontFamily: "Outfit" }}>Access Denied</h2>
      <p className="text-slate-500 mb-6 text-sm">You do not have permission to view this page. Please contact your administrator if you believe this is an error.</p>
    </div>
  );
}

function PermissionRoute({ page, children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  const userEmail = (user?.email || "").trim().toLowerCase();
  const isSuperOrAdmin =
    user?.role === "Super Admin" ||
    user?.role === "Platform Owner" ||
    user?.role === "Admin" ||
    user?.role === "Owner" ||
    user?.user_type === "owner" ||
    user?.user_type === "super_admin" ||
    user?.user_type === "platform_owner" ||
    user?.is_super_admin ||
    user?.is_platform_owner ||
    user?.is_owner ||
    userEmail === "solarixofficial.info@gmail.com" ||
    userEmail === "solarixoffcial.info@gmail.com";
  const hasPerm = isSuperOrAdmin || page === "complaints" || (user?.permissions?.[page]?.view === true);

  if (!hasPerm) {
    const pages = [
      { key: "dashboard", path: "/dashboard" },
      { key: "clients", path: "/clients" },
      { key: "project_execution", path: "/projects" },
      { key: "task_portal", path: "/tasks" },
      { key: "data_management", path: "/inventory" },
      { key: "client_data", path: "/client-data" },
      { key: "reports", path: "/reports" },
      { key: "sales_documents", path: "/sales-documents" },
      { key: "billing", path: "/billing" },
      { key: "team", path: "/team" },
      { key: "settings", path: "/profile" },
      { key: "complaints", path: "/complaints" },
    ];
    const allowed = pages.find((p) => p.key === "complaints" || isSuperOrAdmin || (user?.permissions?.[p.key]?.view === true));
    return <Navigate to={allowed ? allowed.path : "/login"} replace />;
  }
  return children;
}

function ProtectedAdmin({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-400 font-mono text-sm">
        Authenticating Super Admin...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  const userEmail = (user?.email || "").trim().toLowerCase();
  const isSuperAdmin =
    user?.user_type === "platform_owner" ||
    user?.user_type === "super_admin" ||
    user?.is_platform_owner ||
    user?.is_super_admin ||
    user?.role === "Platform Owner" ||
    user?.role === "Super Admin" ||
    userEmail === "solarixofficial.info@gmail.com" ||
    userEmail === "solarixoffcial.info@gmail.com";
  if (!isSuperAdmin) return <AccessDenied />;
  return children;
}

function PlatformOwnerRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  const userEmail = (user?.email || "").trim().toLowerCase();
  const isSuperAdmin =
    user?.user_type === "platform_owner" ||
    user?.user_type === "super_admin" ||
    user?.is_platform_owner ||
    user?.is_super_admin ||
    user?.role === "Platform Owner" ||
    user?.role === "Super Admin" ||
    userEmail === "solarixofficial.info@gmail.com" ||
    userEmail === "solarixoffcial.info@gmail.com";
  if (!isSuperAdmin) return <AccessDenied />;
  return children;
}

function MainTabShell({ activeTab }) {
  const [visited, setVisited] = useState({
    dashboard: false,
    clients: false,
    projects: false,
    tasks: false,
    inventory: false,
    "client-data": false,
    reports: false,
  });

  useEffect(() => {
    setVisited((prev) => ({ ...prev, [activeTab]: true }));
  }, [activeTab]);

  return (
    <Suspense fallback={<PageFallback />}>
      <div style={{ display: activeTab === "dashboard" ? "block" : "none" }}>
        {visited.dashboard && <Dashboard />}
      </div>
      <div style={{ display: activeTab === "clients" ? "block" : "none" }}>
        {visited.clients && <Clients />}
      </div>
      <div style={{ display: activeTab === "projects" ? "block" : "none" }}>
        {visited.projects && <ProjectExecution />}
      </div>
      <div style={{ display: activeTab === "tasks" ? "block" : "none" }}>
        {visited.tasks && <TaskPortal />}
      </div>
      <div style={{ display: activeTab === "inventory" ? "block" : "none" }}>
        {visited.inventory && <Inventory />}
      </div>
      <div style={{ display: activeTab === "client-data" ? "block" : "none" }}>
        {visited["client-data"] && <ClientData />}
      </div>
      <div style={{ display: activeTab === "reports" ? "block" : "none" }}>
        {visited.reports && <Reports />}
      </div>
    </Suspense>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/auth/callback" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/vendor/login" element={<PublicOnly><Login /></PublicOnly>} />
            <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
            <Route path="/vendor/register" element={<PublicOnly><Register /></PublicOnly>} />
            <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
            <Route path="/reset-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
            <Route path="/dashboard" element={<Protected><PermissionRoute page="dashboard"><MainTabShell activeTab="dashboard" /></PermissionRoute></Protected>} />
            <Route path="/clients" element={<Protected><PermissionRoute page="clients"><MainTabShell activeTab="clients" /></PermissionRoute></Protected>} />
            <Route path="/clients/new" element={<Protected><PermissionRoute page="clients"><ClientNew /></PermissionRoute></Protected>} />
            <Route path="/clients/:id" element={<Protected><PermissionRoute page="clients"><ClientDetail /></PermissionRoute></Protected>} />
            <Route path="/team" element={<Protected><PermissionRoute page="team"><Team /></PermissionRoute></Protected>} />
            <Route path="/access" element={<Navigate to="/team" replace />} />
            <Route path="/permissions" element={<Navigate to="/team" replace />} />
            <Route path="/team-access" element={<Navigate to="/team" replace />} />
            <Route path="/profile" element={<Protected><PermissionRoute page="settings"><Profile /></PermissionRoute></Protected>} />
            <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
            <Route path="/activity" element={<Protected><PermissionRoute page="settings"><ActivityLog /></PermissionRoute></Protected>} />
            <Route path="/projects" element={<Protected><PermissionRoute page="project_execution"><MainTabShell activeTab="projects" /></PermissionRoute></Protected>} />
            <Route path="/tasks" element={<Protected><PermissionRoute page="task_portal"><MainTabShell activeTab="tasks" /></PermissionRoute></Protected>} />
            <Route path="/inventory" element={<Protected><PermissionRoute page="data_management"><MainTabShell activeTab="inventory" /></PermissionRoute></Protected>} />
            <Route path="/templates" element={<Protected><PermissionRoute page="documents"><DocumentTemplates /></PermissionRoute></Protected>} />
            <Route path="/document-templates" element={<Protected><PermissionRoute page="documents"><DocumentTemplates /></PermissionRoute></Protected>} />
            <Route path="/documents" element={<Protected><PermissionRoute page="documents"><DocumentTemplates /></PermissionRoute></Protected>} />
            <Route path="/quotation" element={<Protected><PermissionRoute page="sales_documents"><Quotation /></PermissionRoute></Protected>} />
            <Route path="/tax-invoice" element={<Protected><PermissionRoute page="sales_documents"><TaxInvoice /></PermissionRoute></Protected>} />
            <Route path="/delivery-bill" element={<Protected><PermissionRoute page="sales_documents"><DeliveryBill /></PermissionRoute></Protected>} />
            <Route path="/sales-documents" element={<Protected><PermissionRoute page="sales_documents"><SalesDocuments /></PermissionRoute></Protected>} />
            <Route path="/reports" element={<Protected><PermissionRoute page="reports"><MainTabShell activeTab="reports" /></PermissionRoute></Protected>} />
            <Route path="/client-data" element={<Protected><PermissionRoute page="client_data"><MainTabShell activeTab="client-data" /></PermissionRoute></Protected>} />
            <Route path="/client-data/:id" element={<Protected><PermissionRoute page="client_data"><ClientDataDetail /></PermissionRoute></Protected>} />
            <Route path="/complaints" element={<Protected><PermissionRoute page="complaints"><Complaints /></PermissionRoute></Protected>} />
            <Route path="/complaints/:id" element={<Protected><PermissionRoute page="complaints"><ComplaintDetail /></PermissionRoute></Protected>} />
            <Route path="/receivables" element={<Protected><Receivables /></Protected>} />
            <Route path="/vendors" element={<Protected><Vendors /></Protected>} />
            <Route path="/material" element={<Protected><PermissionRoute page="data_management"><MaterialRequests /></PermissionRoute></Protected>} />
            <Route path="/materials" element={<Navigate to="/material" replace />} />
            <Route path="/material-requests" element={<Navigate to="/material" replace />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/billing" element={<Protected><PermissionRoute page="billing"><Billing /></PermissionRoute></Protected>} />
            <Route path="/purchase-orders" element={<Protected><PermissionRoute page="sales_documents"><PurchaseOrders /></PermissionRoute></Protected>} />
            {/* Level 1 SOLARIX Control Center Routes — Dedicated Full-Screen Admin Shell */}
            <Route path="/admin/metrics" element={<ProtectedAdmin><AdminMetrics /></ProtectedAdmin>} />
            <Route path="/admin" element={<Navigate to="/control-center" replace />} />
            <Route path="/admin/*" element={<Navigate to="/control-center" replace />} />
            <Route path="/control-center" element={<ProtectedAdmin><ControlCenterLayout /></ProtectedAdmin>}>
              <Route index element={<Navigate to="/control-center/dashboard" replace />} />
              <Route path="dashboard" element={<ControlCenterDashboard />} />
              <Route path="customers" element={<CustomerList />} />
              <Route path="customers/:id" element={<CustomerDetail />} />
              <Route path="plans" element={<PlansEntitlements />} />
              <Route path="notifications" element={<NotificationComposer />} />
              <Route path="feedback" element={<FeedbackInbox />} />
              <Route path="performance" element={<PerformanceAnalytics />} />
              <Route path="pages" element={<PageAnalytics />} />
              <Route path="metrics" element={<AdminMetrics />} />
              <Route path="audit-logs" element={<AuditLogs />} />
              <Route path="settings" element={<AdminSettings />} />
              {/* Legacy aliases for backward compatibility */}
              <Route path="subscriptions" element={<PlansEntitlements />} />
              <Route path="features" element={<PlansEntitlements />} />
              <Route path="analytics" element={<PerformanceAnalytics />} />
              <Route path="health" element={<AdminSettings />} />
            </Route>

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          <SubscriptionGuardModal />
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
