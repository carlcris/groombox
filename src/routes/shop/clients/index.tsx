import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Users } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeading } from "@/components/PageHeading";
import { PaginationControls } from "@/components/PaginationControls";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { clientPageQueryOptions, clientPageSize } from "@/features/clients/client-queries";
import { messages } from "@/lib/messages";

export const Route = createFileRoute("/shop/clients/")({
  component: ClientsPage,
});

const searchDelayMs = 250;

function ClientsPage() {
  const { currentMembership } = Route.useRouteContext();
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(term);
      setPage(0);
    }, searchDelayMs);
    return () => window.clearTimeout(timer);
  }, [term]);
  const clients = useQuery(clientPageQueryOptions(currentMembership.organizationId, search, page));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <PageHeading>{messages.clients.title}</PageHeading>
        <p className="text-muted-foreground">{messages.clients.intro}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="client-list-search" className="text-base font-medium">
          {messages.clients.search}
        </Label>
        <Input id="client-list-search" type="search" value={term} onChange={(event) => setTerm(event.target.value)} />
      </div>
      {clients.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : clients.isError ? (
        <QueryErrorState error={clients.error} onRetry={() => void clients.refetch()} />
      ) : clients.data.totalCount === 0 ? (
        <EmptyState icon={Users}>{search.trim() ? messages.clients.noMatches : messages.clients.empty}</EmptyState>
      ) : (
        <>
          <ul className="flex flex-col divide-y rounded-xl border bg-card shadow-sm">
            {clients.data.clients.map((client) => (
              <li key={client.id}>
                <Link
                  to="/shop/clients/$clientId"
                  params={{ clientId: client.id }}
                  className="flex min-h-11 items-center gap-3 px-4 py-3 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex flex-1 flex-col">
                    <span className="font-medium">{client.fullName}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">{client.mobileNumber ?? messages.clients.noMobile}</span>
                  </span>
                  <ChevronRight className="text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <PaginationControls page={page} pageSize={clientPageSize} totalCount={clients.data.totalCount} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
