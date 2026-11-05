import type { Database } from "@/types/database.types";

export type OrganizationCategory = Database["public"]["Enums"]["org_category"];

export const organizationCategories = [
  "salon",
  "barbershop",
  "spa",
  "nails",
  "lashes_brows",
  "other",
] as const satisfies readonly OrganizationCategory[];
