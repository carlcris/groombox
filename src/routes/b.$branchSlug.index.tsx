import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { QueryErrorState } from "@/components/QueryErrorState";
import { StickyActionBar } from "@/components/StickyActionBar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BranchHoursList, BranchProfile } from "@/features/booking/BranchProfile";
import {
  groupServicesByCategory,
  publicBranchServicesQueryOptions,
  publicBranchStaffQueryOptions,
} from "@/features/booking/public-branch-queries";
import { ServicePrice } from "@/features/booking/ServiceStep";
import { formatMinutes } from "@/lib/duration-formatting";
import { messages } from "@/lib/messages";

export const Route = createFileRoute("/b/$branchSlug/")({
  component: BranchPage,
});

function BranchPage() {
  const { publicBranch: branch } = Route.useRouteContext();
  const services = useQuery({ ...publicBranchServicesQueryOptions(branch?.id ?? ""), enabled: branch !== null });
  const staff = useQuery({ ...publicBranchStaffQueryOptions(branch?.id ?? ""), enabled: branch !== null });
  if (!branch) return null;

  return (
    <>
      <BranchProfile branch={branch} />

      <section aria-labelledby="services-heading" className="flex flex-col gap-3">
        <h2 id="services-heading" className="text-xl font-semibold">
          {messages.publicBranch.services}
        </h2>
        {services.isPending ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : services.isError ? (
          <QueryErrorState error={services.error} onRetry={() => void services.refetch()} />
        ) : (
          groupServicesByCategory(services.data).map((group) => (
            <div key={group.categoryId} className="flex flex-col gap-2">
              <h3 className="text-lg font-medium">{group.categoryName}</h3>
              <ul className="flex flex-col divide-y rounded-xl border bg-card shadow-sm">
                {group.services.map((service) => (
                  <li key={service.id} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{service.name}</span>
                      {service.description ? <span className="text-sm text-muted-foreground">{service.description}</span> : null}
                      <span className="text-sm text-muted-foreground">{formatMinutes(service.durationMinutes)}</span>
                    </div>
                    <span className="tabular-nums">
                      <ServicePrice service={service} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      {staff.data && staff.data.length > 0 ? (
        <section aria-labelledby="staff-heading" className="flex flex-col gap-3">
          <h2 id="staff-heading" className="text-xl font-semibold">
            {messages.publicBranch.staff}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {staff.data.map((member) => (
              <li key={member.id} className="rounded-full border bg-card px-3 py-1 text-sm">
                {member.displayName}
                {member.title ? <span className="text-muted-foreground"> · {member.title}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="hours-heading" className="flex flex-col gap-3">
        <h2 id="hours-heading" className="text-xl font-semibold">
          {messages.publicBranch.hours}
        </h2>
        <BranchHoursList branch={branch} />
      </section>

      <StickyActionBar>
        <Button asChild className="w-full">
          <Link to="/b/$branchSlug/book" params={{ branchSlug: branch.slug }}>
            {messages.publicBranch.book}
          </Link>
        </Button>
      </StickyActionBar>
    </>
  );
}
