import { useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/context/AuthContext";
import { PLANS } from "@/constants/plans";

/**
 * Unified React hook for real-time subscription status, plan features,
 * quota limits, usage metrics, and trial countdown.
 */
export function useEntitlements() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const isSuperAdmin = Boolean(
    user?.role === "Super Admin" ||
    user?.role === "Platform Owner" ||
    user?.user_type === "super_admin" ||
    user?.user_type === "platform_owner" ||
    user?.is_super_admin ||
    user?.is_platform_owner ||
    (user?.email || "").trim().toLowerCase() === "solarixofficial.info@gmail.com" ||
    (user?.email || "").trim().toLowerCase() === "solarixoffcial.info@gmail.com"
  );

  const { data: subData, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.subscription.current(),
    queryFn: async () => {
      const res = await api.get("/billing/subscription");
      return res.data;
    },
    enabled: Boolean(user && user.company_id),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

  // Listen for cross-window / real-time update events
  useEffect(() => {
    const handleInvalidate = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.subscription.current() });
    };

    window.addEventListener("solarix:subscription-updated", handleInvalidate);
    window.addEventListener("solarix:plan-config-updated", handleInvalidate);
    window.addEventListener("solarix:auth-refresh", handleInvalidate);

    return () => {
      window.removeEventListener("solarix:subscription-updated", handleInvalidate);
      window.removeEventListener("solarix:plan-config-updated", handleInvalidate);
      window.removeEventListener("solarix:auth-refresh", handleInvalidate);
    };
  }, [queryClient]);

  const rawPlanId = String(subData?.plan_id || user?.plan_id || "starter").toLowerCase();
  const planId = ["starter", "growth", "pro"].includes(rawPlanId) ? rawPlanId : "starter";
  const defaultPlanConfig = PLANS[planId] || PLANS.starter;

  const planName = subData?.plan_name || defaultPlanConfig.name || planId.toUpperCase();
  const isTrial = Boolean(subData?.is_trial ?? (subData?.subscription_status === "trialing"));
  const isExpired = Boolean(subData?.is_expired ?? (subData?.subscription_status === "expired"));
  const isActive = Boolean(subData?.is_active ?? (!isExpired));
  const canWrite = Boolean(subData?.can_write ?? (!isExpired));
  const daysRemaining = Number(subData?.days_remaining ?? (isTrial ? 15 : 0));

  const resolvedFeatures = useMemo(() => {
    return subData?.features || defaultPlanConfig.features || {};
  }, [subData?.features, defaultPlanConfig.features]);

  const resolvedLimits = useMemo(() => {
    return subData?.limits || {
      max_users: defaultPlanConfig.max_users || 3,
      max_clients: defaultPlanConfig.max_clients || 100,
      max_products: defaultPlanConfig.max_products || 1000,
      storage_gb: defaultPlanConfig.storage_gb || 5,
      monthly_pdf_docx: defaultPlanConfig.monthly_pdf_docx || 200,
      monthly_material_requests: defaultPlanConfig.monthly_material_requests || 1000,
      monthly_inventory_transactions: defaultPlanConfig.monthly_inventory_transactions || 2500,
      monthly_exports: defaultPlanConfig.monthly_exports || 50,
      monthly_api_requests: defaultPlanConfig.monthly_api_requests || 0,
    };
  }, [subData?.limits, defaultPlanConfig]);

  const usage = useMemo(() => subData?.usage || {}, [subData?.usage]);
  const percentages = subData?.percentages || {};
  const warnings = subData?.warnings || [];

  const hasFeature = useCallback(
    (featureKey) => {
      if (isSuperAdmin) return true;
      if (!featureKey) return true;
      // If plan data is resolved, check boolean flag
      if (resolvedFeatures && typeof resolvedFeatures[featureKey] === "boolean") {
        return resolvedFeatures[featureKey];
      }
      // Check feature_entitlements override directly if present
      if (subData?.feature_entitlements && typeof subData.feature_entitlements[featureKey] === "boolean") {
        return subData.feature_entitlements[featureKey];
      }
      return false;
    },
    [isSuperAdmin, resolvedFeatures, subData]
  );

  const getLimit = useCallback(
    (limitKey, fallback = 0) => {
      if (isSuperAdmin) return 999999;
      return resolvedLimits[limitKey] !== undefined ? resolvedLimits[limitKey] : fallback;
    },
    [isSuperAdmin, resolvedLimits]
  );

  const getUsage = useCallback(
    (resourceKey, fallback = 0) => {
      return usage[resourceKey] !== undefined ? usage[resourceKey] : fallback;
    },
    [usage]
  );

  return {
    entitlement: subData,
    planId,
    planName,
    isTrial,
    isExpired,
    isActive,
    canWrite,
    daysRemaining,
    trialStartedAt: subData?.trial_started_at,
    trialEndsAt: subData?.trial_ends_at,
    subscriptionStartedAt: subData?.subscription_started_at,
    subscriptionExpiresAt: subData?.subscription_expires_at,
    features: resolvedFeatures,
    limits: resolvedLimits,
    usage,
    percentages,
    warnings,
    isSuperAdmin,
    isLoading,
    error,
    hasFeature,
    getLimit,
    getUsage,
    refetchEntitlements: refetch,
  };
}

export default useEntitlements;
