import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import { getCachedProducts, setCachedProducts, fetchProductsDeduplicated, invalidateFrontendProductCache } from "@/lib/productCache";

const STALE_TIME = 15 * 60 * 1000; // 15 min - inventory changes infrequently

export function useProductList(filters = {}) {
  return useQuery({
    queryKey: queryKeys.inventory.products(filters),
    queryFn: async () => {
      const { data } = await api.get("/inventory/products");
      const list = Array.isArray(data) ? data : [];
      setCachedProducts(list);
      return list;
    },
    placeholderData: () => {
      const cached = getCachedProducts();
      return (Array.isArray(cached) && cached.length > 0) ? cached : undefined;
    },
    staleTime: 5 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useInventoryStats() {
  return useQuery({
    queryKey: queryKeys.inventory.stats(),
    queryFn: async () => {
      const { data } = await api.get("/inventory/stats");
      return data;
    },
    staleTime: 5 * 1000,
  });
}

export function useInvalidateInventory() {
  const queryClient = useQueryClient();
  return () => {
    invalidateFrontendProductCache();
    queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all() });
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
    queryClient.invalidateQueries({ queryKey: ["high-value-ledger"] });
    queryClient.invalidateQueries({ queryKey: ["high-value-assets"] });
    queryClient.invalidateQueries({ queryKey: ["ledger"] });
    queryClient.invalidateQueries({ queryKey: ["inventory-b2b-summary"] });
    queryClient.invalidateQueries({ queryKey: ["inventory-b2b-client-history"] });
    queryClient.invalidateQueries({ queryKey: ["inventory-supply-summary"] });
    queryClient.invalidateQueries({ queryKey: ["inventory-supplier-history"] });
    queryClient.invalidateQueries({ queryKey: ["inventory-repair-summary"] });
    queryClient.invalidateQueries({ queryKey: ["inventory", "history"] });
    queryClient.invalidateQueries({ queryKey: ["inventory", "inward"] });
    queryClient.invalidateQueries({ queryKey: ["inventory", "outward"] });
    queryClient.invalidateQueries({ queryKey: ["inventory", "stats"] });
    queryClient.invalidateQueries({ queryKey: ["serial-tracking"] });
    queryClient.invalidateQueries({ queryKey: ["inventory-intelligence"] });
    queryClient.invalidateQueries({ queryKey: ["vendors"] });
    queryClient.invalidateQueries({ queryKey: ["inventory-b2b-customers"] });
    queryClient.invalidateQueries({ queryKey: ["clients"] });
  };
}

export function useInventoryHistory(params = {}) {
  return useQuery({
    queryKey: ["inventory", "history", params],
    queryFn: async () => {
      const { data } = await api.get("/inventory/history", { params });
      return data || { rows: [], total: 0, page: 1, pages: 1, page_size: 50 };
    },
    staleTime: 5 * 1000,
  });
}

export function useInvalidateInventoryHistory() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["inventory", "history"] });
    queryClient.invalidateQueries({ queryKey: ["inventory", "inward"] });
    queryClient.invalidateQueries({ queryKey: ["inventory", "outward"] });
  };
}

export function useInwardList() {
  return useQuery({
    queryKey: ["inventory", "inward"],
    queryFn: async () => {
      const { data } = await api.get("/inventory/inward");
      return data || [];
    },
    staleTime: 3 * 60 * 1000,
  });
}

export function useOutwardList() {
  return useQuery({
    queryKey: ["inventory", "outward"],
    queryFn: async () => {
      const { data } = await api.get("/inventory/outward");
      return data || [];
    },
    staleTime: 3 * 60 * 1000,
  });
}
