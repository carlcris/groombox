import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useLocation } from "@tanstack/react-router";
import { toast } from "sonner";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { readAnySession } from "@/features/auth/guest-session";
import { availableSlotsQueryKey } from "@/features/booking/availability-queries";
import { bookingPath } from "@/features/booking/booking-code";
import {
  anyStaff,
  bookingFlowSearchSchema,
  previousStep,
  readServiceIds,
  readStaffId,
  resolveStep,
  type BookingStep,
} from "@/features/booking/booking-flow-search";
import { BookingStepHeader } from "@/features/booking/BookingStepHeader";
import type { ClientDetails } from "@/features/booking/client-details";
import { DetailsStep } from "@/features/booking/DetailsStep";
import { publicBranchServicesQueryOptions, publicBranchStaffQueryOptions } from "@/features/booking/public-branch-queries";
import { ReviewStep } from "@/features/booking/ReviewStep";
import { ServiceStep } from "@/features/booking/ServiceStep";
import { StaffStep } from "@/features/booking/StaffStep";
import { TimeStep } from "@/features/booking/TimeStep";
import { messages } from "@/lib/messages";

// The booking flow, through to the held slot (app flow §4). Choices live in the URL; the client's
// details stay in memory for this visit.
export const Route = createFileRoute("/b/$branchSlug/book")({
  validateSearch: bookingFlowSearchSchema,
  beforeLoad: async () => ({ session: await readAnySession() }),
  component: BookingFlowPage,
});

const stepTitles: Record<BookingStep, string> = {
  services: messages.booking.stepServices,
  staff: messages.booking.stepStaff,
  time: messages.booking.stepTime,
  details: messages.booking.stepDetails,
  review: messages.booking.stepReview,
};

function BookingFlowPage() {
  const { publicBranch: branch, session } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [details, setDetails] = useState<ClientDetails | null>(null);
  const services = useQuery({ ...publicBranchServicesQueryOptions(branch?.id ?? ""), enabled: branch !== null });
  const staff = useQuery({ ...publicBranchStaffQueryOptions(branch?.id ?? ""), enabled: branch !== null });
  if (!branch) return null;

  // The details stay in memory, so a reloaded review step asks for them again.
  const requestedStep = resolveStep(search);
  const step = requestedStep === "review" && !details ? "details" : requestedStep;
  const serviceIds = readServiceIds(search);
  const staffId = readStaffId(search);
  const goTo = (nextStep: BookingStep, changes: Partial<typeof search> = {}) =>
    void navigate({ search: (previous) => ({ ...previous, ...changes, step: nextStep }) });
  const goBack = () => {
    const previous = previousStep(step);
    if (previous) goTo(previous);
    else void navigate({ to: "/b/$branchSlug", params: { branchSlug: branch.slug } });
  };

  const header = <BookingStepHeader title={stepTitles[step]} shopName={`${branch.organizationName} · ${branch.name}`} onBack={goBack} />;
  if (services.isPending || staff.isPending) {
    return (
      <>
        {header}
        <Skeleton className="h-64 rounded-xl" />
      </>
    );
  }
  if (services.isError || staff.isError) {
    return (
      <>
        {header}
        <QueryErrorState
          error={services.error ?? staff.error}
          onRetry={() => void Promise.all([services.refetch(), staff.refetch()])}
        />
      </>
    );
  }

  const chosenServices = serviceIds.flatMap((id) => services.data.find((service) => service.id === id) ?? []);
  const staffLabel = staffId
    ? (staff.data.find((member) => member.id === staffId)?.displayName ?? messages.booking.anyAvailable)
    : messages.booking.anyAvailable;

  return (
    <>
      {header}
      {step === "services" ? (
        <ServiceStep
          services={services.data}
          selectedIds={serviceIds}
          onChange={(ids) => void navigate({ search: (previous) => ({ ...previous, services: ids.join(",") || undefined }), replace: true })}
          onContinue={() => goTo("staff")}
        />
      ) : step === "staff" ? (
        <StaffStep
          staff={staff.data}
          serviceIds={serviceIds}
          selected={search.staff}
          onSelect={(choice) => goTo("time", { staff: choice, time: undefined })}
        />
      ) : step === "time" ? (
        <TimeStep
          branch={branch}
          serviceIds={serviceIds}
          staffId={staffId}
          date={search.date}
          selectedTime={search.time}
          onDateChange={(date) => void navigate({ search: (previous) => ({ ...previous, date, time: undefined }), replace: true })}
          onTimeSelect={(time, date) => goTo("details", { time, date, staff: search.staff ?? anyStaff })}
        />
      ) : step === "details" ? (
        <DetailsStep
          session={session}
          details={details}
          signInRedirect={location.href}
          onContinue={(entered) => {
            setDetails(entered);
            goTo("review");
          }}
        />
      ) : details && search.time && search.date ? (
        <ReviewStep
          request={{
            branch,
            services: chosenServices,
            staffId,
            staffLabel,
            businessDate: search.date,
            startAt: search.time,
            details,
          }}
          onHeld={(bookingCode) => void navigate({ href: bookingPath(bookingCode) })}
          onSlotTaken={() => {
            toast.error(messages.errors.slotUnavailable);
            void queryClient.invalidateQueries({ queryKey: availableSlotsQueryKey(branch.id) });
            goTo("time", { time: undefined });
          }}
        />
      ) : null}
    </>
  );
}
