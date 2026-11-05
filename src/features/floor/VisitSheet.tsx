import { useState } from "react";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { firstFieldError } from "@/components/FormField";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { TaskSheet } from "@/components/TaskSheet";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { BookingStatusBadge } from "@/features/booking/BookingStatusBadge";
import { branchStaffQueryOptions } from "@/features/branch-setup/branch-setup-queries";
import { StaffSelectField } from "@/features/floor/StaffSelectField";
import { availableVisitActions } from "@/features/floor/visit-actions";
import type { Visit } from "@/features/floor/visit-queries";
import { rescheduleSchema, startServiceSchema } from "@/features/floor/visit-schemas";
import { useVisitMutations } from "@/features/floor/useVisitMutations";
import type { WorkBranch } from "@/features/organization/membership-queries";
import { branchLocalToIso, formatDateTime, formatTime, isoToBranchLocal } from "@/lib/date-formatting";
import { fillTemplate, messages } from "@/lib/messages";

export type VisitSheetMode = "details" | "start" | "reschedule" | "cancel";

function StartForm({ branch, visit, onDone }: { branch: WorkBranch; visit: Visit; onDone: () => void }) {
  const staff = useQuery(branchStaffQueryOptions(branch.id));
  const { start } = useVisitMutations(branch.id);
  const form = useForm({
    defaultValues: { staffId: visit.staffId },
    // Validate on submit, then re-check on every change until the form is fixed.
    validationLogic: revalidateLogic(),
    validators: { onDynamic: startServiceSchema },
    onSubmit: async ({ value }) => {
      await start.mutateAsync({ bookingId: visit.id, staffId: value.staffId }).then(onDone, () => undefined);
    },
  });
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="staffId">
        {(field) => (
          <StaffSelectField
            id="start-staff"
            label={messages.floor.startWith}
            staff={staff.data ?? []}
            value={field.state.value}
            error={firstFieldError(field.state.meta.errors)}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <FormErrorAlert error={start.error} />
      <Button type="submit" disabled={start.isPending}>
        {messages.floor.start}
      </Button>
    </form>
  );
}

function RescheduleForm({ branch, visit, onDone }: { branch: WorkBranch; visit: Visit; onDone: () => void }) {
  const staff = useQuery(branchStaffQueryOptions(branch.id));
  const { reschedule } = useVisitMutations(branch.id);
  const current = visit.startAt ? isoToBranchLocal(visit.startAt, branch.timezone) : "";
  const form = useForm({
    defaultValues: { staffId: visit.staffId, date: current.slice(0, 10), time: current.slice(11, 16) },
    // Validate on submit, then re-check on every change until the form is fixed.
    validationLogic: revalidateLogic(),
    validators: { onDynamic: rescheduleSchema },
    onSubmit: async ({ value }) => {
      if (!value.staffId) return;
      await reschedule
        .mutateAsync({
          bookingId: visit.id,
          startAt: branchLocalToIso(`${value.date}T${value.time}`, branch.timezone),
          staffId: value.staffId,
        })
        .then(onDone, () => undefined);
    },
  });
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="staffId">
        {(field) => (
          <StaffSelectField
            id="reschedule-staff"
            label={messages.floor.staff}
            staff={staff.data ?? []}
            value={field.state.value}
            error={firstFieldError(field.state.meta.errors)}
            onChange={field.handleChange}
          />
        )}
      </form.Field>
      <div className="grid grid-cols-2 gap-3">
        <form.Field name="date">
          {(field) => (
            <TextField
              id="reschedule-date"
              label={messages.floor.date}
              type="date"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
        <form.Field name="time">
          {(field) => (
            <TextField
              id="reschedule-time"
              label={messages.floor.time}
              type="time"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={field.handleChange}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
      </div>
      <FormErrorAlert error={reschedule.error} />
      <Button type="submit" disabled={reschedule.isPending}>
        {messages.floor.save}
      </Button>
    </form>
  );
}

function CancelForm({ branch, visit, onDone, onBack }: { branch: WorkBranch; visit: Visit; onDone: () => void; onBack: () => void }) {
  const [reason, setReason] = useState("");
  const { cancel } = useVisitMutations(branch.id);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">{messages.floor.cancelBody}</p>
      <TextField id="cancel-visit-reason" label={messages.bookingPage.cancelReason} value={reason} errors={[]} onChange={setReason} onBlur={() => undefined} />
      <FormErrorAlert error={cancel.error} />
      <Button
        variant="destructive"
        disabled={cancel.isPending}
        onClick={() => cancel.mutateAsync({ bookingId: visit.id, reason }).then(onDone, () => undefined)}
      >
        {messages.floor.cancelVisit}
      </Button>
      <Button variant="outline" onClick={onBack}>
        {messages.floor.keepVisit}
      </Button>
    </div>
  );
}

const modeTitles: Record<VisitSheetMode, string> = {
  details: messages.floor.visitTitle,
  start: messages.floor.startTitle,
  reschedule: messages.floor.rescheduleTitle,
  cancel: messages.floor.cancelTitle,
};

// One visit's details and the moves the shop can make from its status (app flow §5), shared by the
// floor and the calendar.
export function VisitSheet({
  branch,
  visit,
  initialMode,
  onClose,
}: {
  branch: WorkBranch;
  visit: Visit;
  initialMode: VisitSheetMode;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<VisitSheetMode>(initialMode);
  const { checkIn, start, noShow } = useVisitMutations(branch.id);
  const actions = availableVisitActions(visit);
  const pendingError = checkIn.error ?? start.error ?? noShow.error;

  return (
    <TaskSheet open onOpenChange={(open) => (open ? null : onClose())} title={modeTitles[mode]} description={visit.clientName}>
      {mode === "start" ? (
        <StartForm branch={branch} visit={visit} onDone={onClose} />
      ) : mode === "reschedule" ? (
        <RescheduleForm branch={branch} visit={visit} onDone={onClose} />
      ) : mode === "cancel" ? (
        <CancelForm branch={branch} visit={visit} onDone={onClose} onBack={() => setMode("details")} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <BookingStatusBadge status={visit.status} />
            {visit.queueNumber ? (
              <span className="text-sm tabular-nums">{fillTemplate(messages.floor.queueNumber, { number: String(visit.queueNumber) })}</span>
            ) : null}
          </div>
          <dl className="flex flex-col gap-2">
            <div className="flex flex-col">
              <dt className="text-sm text-muted-foreground">{messages.floor.services}</dt>
              <dd>{visit.serviceNames.join(", ")}</dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-sm text-muted-foreground">{messages.floor.staff}</dt>
              <dd>{visit.staffName ?? messages.floor.anyStaff}</dd>
            </div>
            {visit.startAt ? (
              <div className="flex flex-col">
                <dt className="text-sm text-muted-foreground">{messages.booking.when}</dt>
                <dd className="tabular-nums">
                  {formatDateTime(visit.startAt, branch.timezone)}
                  {visit.endAt ? ` – ${formatTime(visit.endAt, branch.timezone)}` : ""}
                </dd>
              </div>
            ) : null}
            {visit.clientNote ? (
              <div className="flex flex-col">
                <dt className="text-sm text-muted-foreground">{messages.floor.note}</dt>
                <dd>{visit.clientNote}</dd>
              </div>
            ) : null}
          </dl>
          <FormErrorAlert error={pendingError} />
          <div className="flex flex-col gap-3">
            {visit.status === "in_service" ? (
              <Button asChild>
                <Link to="/shop/$branchId/visit/$bookingId" params={{ branchId: branch.id, bookingId: visit.id }} onClick={onClose}>
                  {messages.visit.checkout}
                </Link>
              </Button>
            ) : null}
            {actions.includes("check_in") ? (
              <Button disabled={checkIn.isPending} onClick={() => checkIn.mutateAsync(visit.id).then(onClose, () => undefined)}>
                {messages.floor.checkIn}
              </Button>
            ) : null}
            {actions.includes("start") ? (
              visit.status === "waiting" ? (
                <Button onClick={() => setMode("start")}>{messages.floor.start}</Button>
              ) : (
                <Button
                  disabled={start.isPending}
                  onClick={() => start.mutateAsync({ bookingId: visit.id, staffId: null }).then(onClose, () => undefined)}
                >
                  {messages.floor.start}
                </Button>
              )
            ) : null}
            {actions.includes("reschedule") ? (
              <Button variant="outline" onClick={() => setMode("reschedule")}>
                {messages.floor.reschedule}
              </Button>
            ) : null}
            {actions.includes("no_show") ? (
              <Button variant="outline" disabled={noShow.isPending} onClick={() => noShow.mutateAsync(visit.id).then(onClose, () => undefined)}>
                {messages.floor.noShow}
              </Button>
            ) : null}
            {actions.includes("cancel") ? (
              <Button variant="outline" className="text-danger" onClick={() => setMode("cancel")}>
                {messages.floor.cancelVisit}
              </Button>
            ) : null}
            <Button asChild variant="ghost">
              <Link to="/shop/$branchId/visit/$bookingId" params={{ branchId: branch.id, bookingId: visit.id }} onClick={onClose}>
                {messages.visit.open}
              </Link>
            </Button>
          </div>
        </div>
      )}
    </TaskSheet>
  );
}
