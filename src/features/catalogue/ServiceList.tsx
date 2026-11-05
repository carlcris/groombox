import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Scissors } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PaginationControls } from "@/components/PaginationControls";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  categoriesQueryOptions,
  servicePageSize,
  servicesPageQueryOptions,
  type CatalogueService,
} from "@/features/catalogue/catalogue-queries";
import { ServiceSheet } from "@/features/catalogue/ServiceSheet";
import { ownedBranchesQueryOptions } from "@/features/organization/branch-queries";
import { branchSetupStatusQueryOptions } from "@/features/organization/branch-setup-status";
import { fillTemplate, messages } from "@/lib/messages";
import { formatMinutes } from "@/lib/duration-formatting";
import { formatPeso } from "@/lib/money-formatting";

export function ServiceList({ organizationId }: { organizationId: string }) {
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<CatalogueService | "new" | null>(null);
  const categories = useQuery(categoriesQueryOptions(organizationId));
  const services = useQuery({ ...servicesPageQueryOptions(organizationId, page), placeholderData: keepPreviousData });
  const branches = useQuery(ownedBranchesQueryOptions(organizationId));
  const statuses = useQuery(branchSetupStatusQueryOptions(organizationId));

  if (services.isPending || categories.isPending) return <Skeleton className="h-32 rounded-xl" />;
  if (services.isError) return <QueryErrorState error={services.error} onRetry={() => void services.refetch()} />;
  if (categories.isError) return <QueryErrorState error={categories.error} onRetry={() => void categories.refetch()} />;

  const categoryNames = new Map(categories.data.map((category) => [category.id, category.name]));
  const addButton = (
    <Button disabled={categories.data.length === 0} onClick={() => setEditing("new")}>
      <Plus aria-hidden />
      {messages.catalogue.addService}
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      {services.data.totalCount === 0 ? (
        <EmptyState icon={Scissors} action={addButton}>
          {categories.data.length === 0 ? messages.catalogue.noCategories : messages.catalogue.noServices}
        </EmptyState>
      ) : (
        <>
          <div className="md:self-end">{addButton}</div>
          <ul className="flex flex-col gap-3">
            {services.data.items.map((service) => (
              <li key={service.id} className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-medium">{service.name}</span>
                    {service.isActive ? null : (
                      <Badge variant="secondary" className="rounded-full">
                        {messages.catalogue.hidden}
                      </Badge>
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {categoryNames.get(service.categoryId)} · {formatMinutes(service.durationMinutes)} ·{" "}
                    {service.priceIsStarting
                      ? fillTemplate(messages.catalogue.startingAt, { price: formatPeso(service.price) })
                      : formatPeso(service.price)}
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEditing(service)} aria-label={`${messages.setup.edit} ${service.name}`}>
                  <Pencil aria-hidden />
                  {messages.setup.edit}
                </Button>
              </li>
            ))}
          </ul>
          <PaginationControls page={page} pageSize={servicePageSize} totalCount={services.data.totalCount} onPageChange={setPage} />
        </>
      )}
      {editing ? (
        <ServiceSheet
          organizationId={organizationId}
          categories={categories.data}
          service={editing === "new" ? null : editing}
          branches={branches.data ?? []}
          statuses={statuses.data ?? []}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
