import { useAuth } from "@/context/AuthContext";
import { useEntitlements } from "@/hooks/useEntitlements";

const PROJ_EXEC_TABS = ["verification", "approval", "reject", "project_assignment", "retry"];
const SUPER_ADMIN_EMAILS = new Set([
  "solarixofficial.info@gmail.com",
  "solarixoffcial.info@gmail.com",
]);

/**
 * Authoritative 5-tier permission evaluation:
 * 1. Super Admin bypass (Platform Owner)
 * 2. Subscription state (write actions blocked if expired)
 * 3. Plan page & feature entitlement (module must be included in company plan)
 * 4. Team member permissions (employee must be granted permission by admin)
 */
export function usePermission(page, action = "view") {
  const { user } = useAuth();
  const { isPageAllowed, hasFeature, canWrite, isSuperAdmin } = useEntitlements();

  if (!user) return false;

  const userEmail = (user.email || "").trim().toLowerCase();
  const isPlatformSuperAdmin =
    isSuperAdmin ||
    user.is_super_admin ||
    user.is_platform_owner ||
    user.user_type === "platform_owner" ||
    user.user_type === "super_admin" ||
    user.role === "Super Admin" ||
    user.role === "Platform Owner" ||
    SUPER_ADMIN_EMAILS.has(userEmail);

  // 1. Super Admin has unrestricted platform access
  if (isPlatformSuperAdmin) return true;

  // 2. Company write actions require active subscription / valid trial
  const isWriteAction = ["create", "edit", "delete", "approve"].includes(action);
  if (isWriteAction && !canWrite) {
    return false;
  }

  // 3. Plan Page & Feature Entitlement
  const cleanPage = (page || "").replace(/^dm_/, "");

  // Feature-specific module checks
  if (cleanPage === "high_value_goods" || cleanPage === "serial_tracking") {
    if (!hasFeature(cleanPage)) {
      return false;
    }
  } else if (cleanPage && !isPageAllowed(cleanPage)) {
    return false;
  }

  // 4. Team Member Permission
  // Company Owner / Admin role has full team permissions within entitled plan
  const isCompanyAdmin =
    user.role === "Admin" ||
    user.role === "Owner" ||
    user.user_type === "owner" ||
    user.is_owner;

  if (isCompanyAdmin) {
    return true;
  }

  // Normal team member permission evaluation
  const perms = user.permissions || {};
  const pagePerms = perms[page];
  if (!pagePerms) return false;

  if (page === "project_execution" && PROJ_EXEC_TABS.includes(action) && pagePerms[action] === undefined) {
    return !!pagePerms.view;
  }

  return !!pagePerms[action];
}

/**
 * <Can page="clients" action="create"> renders children only if user has perm.
 * Optional `fallback` for view-only hint.
 */
export function Can({ page, action = "view", fallback = null, children }) {
  const ok = usePermission(page, action);
  return ok ? children : fallback;
}
