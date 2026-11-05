import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase-client";
import { requireViewColumn } from "@/lib/view-columns";
import type { Json } from "@/types/database.types";

// Published branches and what clients may see of them, read through the public views by visitors,
// guests, and clients alike (AGENTS.md, Security & RLS).

export type PublicBranchHours = {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  closesNextDay: boolean;
  isClosed: boolean;
};

export type PublicBranch = {
  id: string;
  slug: string;
  name: string;
  address: string;
  city: string;
  area: string;
  contactNumber: string;
  timezone: string;
  organizationName: string;
  organizationSlug: string;
  organizationLogoPath: string | null;
  cancellationPolicy: string;
  holdMinutes: number;
  bookingHorizonDays: number;
  currentBusinessDate: string;
  hours: PublicBranchHours[];
  photoPaths: string[];
};

export type PublicBranchService = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  priceIsStarting: boolean;
  categoryId: string;
  categoryName: string;
};

export type PublicStaffMember = {
  id: string;
  displayName: string;
  title: string;
  photoPath: string | null;
  serviceIds: string[];
};

export type OrganizationBranchSummary = {
  slug: string;
  name: string;
  address: string;
  city: string;
  area: string;
  organizationName: string;
  organizationLogoPath: string | null;
};

// A branch offers a few dozen services and staff at most; these bounds keep the reads finite.
const serviceLimit = 200;
const staffLimit = 100;
const branchLimit = 100;

function readRecord(value: Json): Record<string, Json | undefined> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}

function readHours(value: Json | null): PublicBranchHours[] {
  if (!Array.isArray(value)) throw new Error("public_branches.hours is not an array.");
  return value.map((entry) => {
    const day = readRecord(entry);
    if (!day || typeof day.day_of_week !== "number" || typeof day.is_closed !== "boolean") {
      throw new Error("public_branches.hours has an unexpected entry.");
    }
    return {
      dayOfWeek: day.day_of_week,
      opensAt: typeof day.opens_at === "string" ? day.opens_at.slice(0, 5) : "",
      closesAt: typeof day.closes_at === "string" ? day.closes_at.slice(0, 5) : "",
      closesNextDay: day.closes_next_day === true,
      isClosed: day.is_closed,
    };
  });
}

function readPhotoPaths(value: Json | null): string[] {
  if (!Array.isArray(value)) throw new Error("public_branches.photo_paths is not an array.");
  return value.filter((path): path is string => typeof path === "string");
}

export function publicBranchQueryOptions(branchSlug: string) {
  return queryOptions({
    queryKey: ["public-branch", branchSlug],
    queryFn: async (): Promise<PublicBranch | null> => {
      const { data, error } = await supabase
        .from("public_branches")
        .select(
          "id, slug, name, address, city, area, contact_number, timezone, organization_name, organization_slug, organization_logo_path, cancellation_policy, hold_minutes, booking_horizon_days, current_business_date, hours, photo_paths",
        )
        .eq("slug", branchSlug)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: requireViewColumn(data.id, "id"),
        slug: requireViewColumn(data.slug, "slug"),
        name: requireViewColumn(data.name, "name"),
        address: data.address ?? "",
        city: data.city ?? "",
        area: data.area ?? "",
        contactNumber: data.contact_number ?? "",
        timezone: requireViewColumn(data.timezone, "timezone"),
        organizationName: requireViewColumn(data.organization_name, "organization_name"),
        organizationSlug: requireViewColumn(data.organization_slug, "organization_slug"),
        organizationLogoPath: data.organization_logo_path,
        cancellationPolicy: data.cancellation_policy ?? "",
        holdMinutes: requireViewColumn(data.hold_minutes, "hold_minutes"),
        bookingHorizonDays: requireViewColumn(data.booking_horizon_days, "booking_horizon_days"),
        currentBusinessDate: requireViewColumn(data.current_business_date, "current_business_date"),
        hours: readHours(data.hours),
        photoPaths: readPhotoPaths(data.photo_paths),
      };
    },
  });
}

export function publicBranchServicesQueryOptions(branchId: string) {
  return queryOptions({
    queryKey: ["public-branch-services", branchId],
    queryFn: async (): Promise<PublicBranchService[]> => {
      const { data, error } = await supabase
        .from("public_branch_services")
        .select("service_id, name, description, duration_minutes, price, price_is_starting, category_id, category_name")
        .eq("branch_id", branchId)
        .order("category_sort_order")
        .order("category_name")
        .order("sort_order")
        .order("name")
        .limit(serviceLimit);
      if (error) throw error;
      return data.map((row) => ({
        id: requireViewColumn(row.service_id, "service_id"),
        name: requireViewColumn(row.name, "name"),
        description: row.description ?? "",
        durationMinutes: requireViewColumn(row.duration_minutes, "duration_minutes"),
        price: requireViewColumn(row.price, "price"),
        priceIsStarting: requireViewColumn(row.price_is_starting, "price_is_starting"),
        categoryId: requireViewColumn(row.category_id, "category_id"),
        categoryName: requireViewColumn(row.category_name, "category_name"),
      }));
    },
  });
}

export function publicBranchStaffQueryOptions(branchId: string) {
  return queryOptions({
    queryKey: ["public-branch-staff", branchId],
    queryFn: async (): Promise<PublicStaffMember[]> => {
      const { data, error } = await supabase
        .from("public_branch_staff")
        .select("staff_id, display_name, title, photo_path, service_ids")
        .eq("branch_id", branchId)
        .order("display_name")
        .limit(staffLimit);
      if (error) throw error;
      return data.map((row) => ({
        id: requireViewColumn(row.staff_id, "staff_id"),
        displayName: requireViewColumn(row.display_name, "display_name"),
        title: row.title ?? "",
        photoPath: row.photo_path,
        serviceIds: requireViewColumn(row.service_ids, "service_ids"),
      }));
    },
  });
}

export function organizationBranchesQueryOptions(organizationSlug: string) {
  return queryOptions({
    queryKey: ["organization-public-branches", organizationSlug],
    queryFn: async (): Promise<OrganizationBranchSummary[]> => {
      const { data, error } = await supabase
        .from("public_branches")
        .select("slug, name, address, city, area, organization_name, organization_logo_path")
        .eq("organization_slug", organizationSlug)
        .order("name")
        .limit(branchLimit);
      if (error) throw error;
      return data.map((row) => ({
        slug: requireViewColumn(row.slug, "slug"),
        name: requireViewColumn(row.name, "name"),
        address: row.address ?? "",
        city: row.city ?? "",
        area: row.area ?? "",
        organizationName: requireViewColumn(row.organization_name, "organization_name"),
        organizationLogoPath: row.organization_logo_path,
      }));
    },
  });
}

// Services grouped under their categories, in catalogue order.
export function groupServicesByCategory(services: PublicBranchService[]) {
  const groups: { categoryId: string; categoryName: string; services: PublicBranchService[] }[] = [];
  for (const service of services) {
    const group = groups.find((entry) => entry.categoryId === service.categoryId);
    if (group) group.services.push(service);
    else groups.push({ categoryId: service.categoryId, categoryName: service.categoryName, services: [service] });
  }
  return groups;
}
