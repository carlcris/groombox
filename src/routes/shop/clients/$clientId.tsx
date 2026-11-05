import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarX, Merge, Pencil, UserCheck } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeading } from "@/components/PageHeading";
import { PaginationControls } from "@/components/PaginationControls";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingStatusBadge } from "@/features/booking/BookingStatusBadge";
import { ClientEditSheet } from "@/features/clients/ClientEditSheet";
import { clientNotesQueryOptions, clientPageSize, clientQueryOptions, clientVisitsQueryOptions } from "@/features/clients/client-queries";
import { MergeClientSheet } from "@/features/clients/MergeClientSheet";
import { formatBusinessDate, formatDateTime } from "@/lib/date-formatting";
import { messages } from "@/lib/messages";

export const Route = createFileRoute("/shop/clients/$clientId")({
  component: ClientPage,
});

function ClientPage() {
  const { clientId } = Route.useParams();
  const { currentMembership } = Route.useRouteContext();
  const organizationId = currentMembership.organizationId;
  const [openSheet, setOpenSheet] = useState<"edit" | "merge" | null>(null);
  const [page, setPage] = useState(0);
  const client = useQuery(clientQueryOptions(organizationId, clientId));
  const notes = useQuery(clientNotesQueryOptions(organizationId, clientId));
  const visits = useQuery(clientVisitsQueryOptions(organizationId, clientId, page));

  if (client.isPending || notes.isPending) return <Skeleton className="h-64 max-w-3xl rounded-xl" />;
  if (client.isError || notes.isError) {
    return <QueryErrorState error={client.error ?? notes.error} onRetry={() => void Promise.all([client.refetch(), notes.refetch()])} />;
  }
  if (!client.data) return <EmptyState icon={CalendarX}>{messages.clients.noMatches}</EmptyState>;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <PageHeading>{client.data.fullName}</PageHeading>
          <p className="text-muted-foreground tabular-nums">{client.data.mobileNumber ?? messages.clients.noMobile}</p>
          {client.data.hasAccount ? (
            <p className="flex items-center gap-2 text-sm">
              <UserCheck className="size-5" aria-hidden />
              {messages.clients.linkedAccount}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setOpenSheet("edit")}>
            <Pencil aria-hidden />
            {messages.clients.edit}
          </Button>
          <Button variant="outline" onClick={() => setOpenSheet("merge")}>
            <Merge aria-hidden />
            {messages.clients.merge}
          </Button>
        </div>
      </div>

      <section aria-labelledby="client-notes-heading" className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
        <h2 id="client-notes-heading" className="text-lg font-medium">
          {messages.clients.notes}
        </h2>
        <p className="whitespace-pre-line text-muted-foreground">{notes.data || messages.clients.notesHint}</p>
      </section>

      <section aria-labelledby="client-history-heading" className="flex flex-col gap-3">
        <h2 id="client-history-heading" className="text-xl font-semibold">
          {messages.clients.history}
        </h2>
        {visits.isPending ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : visits.isError ? (
          <QueryErrorState error={visits.error} onRetry={() => void visits.refetch()} />
        ) : visits.data.totalCount === 0 ? (
          <p className="text-muted-foreground">{messages.clients.noHistory}</p>
        ) : (
          <>
            <ul className="flex flex-col divide-y rounded-xl border bg-card shadow-sm">
              {visits.data.visits.map((visit) => (
                <li key={visit.id}>
                  <Link
                    to="/shop/$branchId/visit/$bookingId"
                    params={{ branchId: visit.branchId, bookingId: visit.id }}
                    className="flex min-h-11 flex-col gap-1 px-4 py-3 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring md:flex-row md:items-center md:justify-between"
                  >
                  <span className="flex flex-col">
                    <span className="font-medium tabular-nums">
                      {visit.startAt ? formatDateTime(visit.startAt, visit.branchTimezone) : formatBusinessDate(visit.businessDate)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {visit.serviceNames.join(", ")} · {visit.branchName}
                    </span>
                  </span>
                  <BookingStatusBadge status={visit.status} />
                  </Link>
                </li>
              ))}
            </ul>
            <PaginationControls page={page} pageSize={clientPageSize} totalCount={visits.data.totalCount} onPageChange={setPage} />
          </>
        )}
      </section>

      {openSheet === "edit" ? (
        <ClientEditSheet organizationId={organizationId} client={client.data} notes={notes.data} onClose={() => setOpenSheet(null)} />
      ) : null}
      {openSheet === "merge" ? <MergeClientSheet organizationId={organizationId} client={client.data} onClose={() => setOpenSheet(null)} /> : null}
    </div>
  );
}
