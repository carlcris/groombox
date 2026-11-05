import { queryOptions } from "@tanstack/react-query";
import type { DepositType } from "@/features/organization/organization-settings-queries";
import { supabase } from "@/lib/supabase-client";

export const servicePageSize = 50;
// An organization's categories and active services are a short list; these bounds keep reads finite.
const categoryLimit = 100;
const activeServiceLimit = 200;

export type ServiceCategory = { id: string; name: string; sortOrder: number };

export type CatalogueService = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  bufferMinutes: number;
  price: number;
  priceIsStarting: boolean;
  depositType: DepositType | null;
  depositFixedAmount: number | null;
  depositPercent: number | null;
  isActive: boolean;
};

export type ActiveService = { id: string; categoryId: string; name: string; price: number; durationMinutes: number };

export function catalogueQueryKey(organizationId: string) {
  return ["catalogue", organizationId] as const;
}

export function categoriesQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: [...catalogueQueryKey(organizationId), "categories"],
    queryFn: async (): Promise<ServiceCategory[]> => {
      const { data, error } = await supabase
        .from("service_categories")
        .select("id, name, sort_order")
        .eq("organization_id", organizationId)
        .order("sort_order")
        .order("name")
        .limit(categoryLimit);
      if (error) throw error;
      return data.map((row) => ({ id: row.id, name: row.name, sortOrder: row.sort_order }));
    },
  });
}

export function servicesPageQueryOptions(organizationId: string, page: number) {
  return queryOptions({
    queryKey: [...catalogueQueryKey(organizationId), "services", page],
    queryFn: async (): Promise<{ items: CatalogueService[]; totalCount: number }> => {
      const from = page * servicePageSize;
      const { data, error, count } = await supabase
        .from("services")
        .select(
          "id, category_id, name, description, duration_minutes, buffer_minutes, price, price_is_starting, deposit_type, deposit_fixed_amount, deposit_percent, is_active",
          { count: "exact" },
        )
        .eq("organization_id", organizationId)
        .order("sort_order")
        .order("name")
        .order("id")
        .range(from, from + servicePageSize - 1);
      if (error) throw error;
      return {
        totalCount: count ?? 0,
        items: data.map((row) => ({
          id: row.id,
          categoryId: row.category_id,
          name: row.name,
          description: row.description,
          durationMinutes: row.duration_minutes,
          bufferMinutes: row.buffer_minutes,
          price: row.price,
          priceIsStarting: row.price_is_starting,
          depositType: row.deposit_type,
          depositFixedAmount: row.deposit_fixed_amount,
          depositPercent: row.deposit_percent,
          isActive: row.is_active,
        })),
      };
    },
  });
}

export function activeServicesQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: [...catalogueQueryKey(organizationId), "active-services"],
    queryFn: async (): Promise<ActiveService[]> => {
      const { data, error } = await supabase
        .from("services")
        .select("id, category_id, name, price, duration_minutes")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("sort_order")
        .order("name")
        .limit(activeServiceLimit);
      if (error) throw error;
      return data.map((row) => ({
        id: row.id,
        categoryId: row.category_id,
        name: row.name,
        price: row.price,
        durationMinutes: row.duration_minutes,
      }));
    },
  });
}

// Branches offering a service, for the guard that keeps a published branch's last service.
export async function readServiceBranchIds(serviceId: string): Promise<string[]> {
  const { data, error } = await supabase.from("branch_services").select("branch_id").eq("service_id", serviceId).limit(100);
  if (error) throw error;
  return data.map((row) => row.branch_id);
}
