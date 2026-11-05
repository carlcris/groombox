import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import type { BookingStatus } from "@/features/booking/booking-link-queries";
import { QueueCard } from "@/features/floor/QueueCard";
import { useVisitMutations } from "@/features/floor/useVisitMutations";
import type { Visit } from "@/features/floor/visit-queries";
import { VisitSheet, type VisitSheetMode } from "@/features/floor/VisitSheet";
import type { WorkBranch } from "@/features/organization/membership-queries";
import { cn } from "@/lib/class-names";
import { messages } from "@/lib/messages";

type QueueTab = "waiting" | "in_service" | "upcoming" | "done";

const tabStatuses: Record<QueueTab, BookingStatus[]> = {
  waiting: ["waiting", "checked_in"],
  in_service: ["in_service"],
  upcoming: ["confirmed", "held", "payment_submitted", "needs_resubmission", "review_expired_pending_resolution"],
  done: ["completed", "no_show", "cancelled"],
};

const tabLabels: Record<QueueTab, string> = {
  waiting: messages.floor.waiting,
  in_service: messages.floor.inService,
  upcoming: messages.floor.upcoming,
  done: messages.floor.done,
};

const tabEmpty: Record<QueueTab, string> = {
  waiting: messages.floor.emptyWaiting,
  in_service: messages.floor.emptyInService,
  upcoming: messages.floor.emptyUpcoming,
  done: messages.floor.emptyDone,
};

const tabs = Object.keys(tabStatuses) as QueueTab[];

// Today's visits: one list with tabs on phones, four columns side by side from tablets up
// (design brief §6).
export function FloorQueue({ branch, visits }: { branch: WorkBranch; visits: Visit[] }) {
  const [activeTab, setActiveTab] = useState<QueueTab>("waiting");
  const [openVisit, setOpenVisit] = useState<{ visit: Visit; mode: VisitSheetMode } | null>(null);
  const { checkIn, start } = useVisitMutations(branch.id);

  const runNext = (visit: Visit) => {
    if (visit.status === "confirmed") checkIn.mutate(visit.id);
    else if (visit.status === "checked_in") start.mutate({ bookingId: visit.id, staffId: null });
    else setOpenVisit({ visit, mode: "start" });
  };

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label={messages.shop.floorTitle} className="flex gap-1 rounded-lg bg-muted p-1 md:hidden">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "min-h-11 flex-1 rounded-md px-2 text-sm font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activeTab === tab && "bg-card text-foreground shadow-sm",
            )}
          >
            {tabLabels[tab]} <span className="tabular-nums">{visits.filter((visit) => tabStatuses[tab].includes(visit.status)).length}</span>
          </button>
        ))}
      </div>
      <FormErrorAlert error={checkIn.error ?? start.error} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {tabs.map((tab) => {
          const tabVisits = visits.filter((visit) => tabStatuses[tab].includes(visit.status));
          return (
            <section
              key={tab}
              aria-labelledby={`floor-${tab}`}
              className={cn("flex flex-col gap-3", activeTab !== tab && "hidden md:flex")}
            >
              <h2 id={`floor-${tab}`} className="hidden text-xl font-semibold md:block">
                {tabLabels[tab]} <span className="text-muted-foreground tabular-nums">{tabVisits.length}</span>
              </h2>
              {tabVisits.length === 0 ? (
                <EmptyState icon={CalendarClock}>{tabEmpty[tab]}</EmptyState>
              ) : (
                <ul className="flex flex-col gap-3">
                  {tabVisits.map((visit) => (
                    <QueueCard
                      key={visit.id}
                      branchId={branch.id}
                      visit={visit}
                      timeZone={branch.timezone}
                      isBusy={checkIn.isPending || start.isPending}
                      onNext={() => runNext(visit)}
                      onDetails={() => setOpenVisit({ visit, mode: "details" })}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      {openVisit ? (
        <VisitSheet branch={branch} visit={openVisit.visit} initialMode={openVisit.mode} onClose={() => setOpenVisit(null)} />
      ) : null}
    </div>
  );
}
