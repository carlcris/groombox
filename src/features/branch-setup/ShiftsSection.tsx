import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { CheckboxField } from "@/components/CheckboxField";
import { fieldIds, FormField } from "@/components/FormField";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { QueryErrorState } from "@/components/QueryErrorState";
import { SetupSection } from "@/components/SetupSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  branchSetupQueryKey,
  branchShiftsQueryOptions,
  branchStaffQueryOptions,
  type BranchShift,
  type BranchStaffMember,
} from "@/features/branch-setup/branch-setup-queries";
import { refreshBranchData } from "@/features/organization/branch-cache";
import { findTimeRangeProblems, weekdayDisplayOrder, type TimeRangeProblem } from "@/features/organization/branch-hours-schema";
import type { WorkBranch } from "@/features/organization/membership-queries";
import { PublishGuardError } from "@/features/organization/publish-guard-error";
import { formatTimeOfDay } from "@/lib/date-formatting";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

const shiftWording: Record<TimeRangeProblem, string> = {
  starts_too_early: messages.validation.shiftStartsFromBusinessDayStart,
  ends_too_late: messages.validation.shiftEndsByBusinessDayStart,
  ends_before_start: messages.validation.shiftEndsAfterStarts,
};

function describeShift(shift: BranchShift): string {
  const ends = formatTimeOfDay(shift.endsAt);
  return `${messages.hours.days[shift.dayOfWeek]} ${formatTimeOfDay(shift.startsAt)} – ${ends}${shift.endsNextDay ? ` (${messages.branchSetup.endsNextDay.toLowerCase()})` : ""}`;
}

export function ShiftsSection({ branch, isPublished }: { branch: WorkBranch; isPublished: boolean }) {
  const queryClient = useQueryClient();
  const staff = useQuery(branchStaffQueryOptions(branch.id));
  const shifts = useQuery(branchShiftsQueryOptions(branch.id));
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: branchSetupQueryKey(branch.id) }),
      refreshBranchData(queryClient, branch.organizationId),
    ]);

  const remove = useMutation({
    mutationFn: async (shift: BranchShift) => {
      // A published branch keeps at least one bookable staff member with a shift (SET-10).
      if (isPublished) {
        const bookableIds = new Set((staff.data ?? []).filter((member) => member.isBookable).map((member) => member.id));
        const remaining = (shifts.data ?? []).filter((other) => other.id !== shift.id && bookableIds.has(other.staffId));
        if (remaining.length === 0) throw new PublishGuardError(messages.publishGuards.lastStaffShift);
      }
      const { error } = await supabase.from("staff_shifts").delete().eq("id", shift.id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  if (staff.isPending || shifts.isPending) {
    return (
      <SetupSection id="shifts-section" title={messages.branchSetup.shifts}>
        <Skeleton className="h-32 rounded-xl" />
      </SetupSection>
    );
  }
  if (staff.isError || shifts.isError) {
    return (
      <SetupSection id="shifts-section" title={messages.branchSetup.shifts}>
        <QueryErrorState error={staff.error ?? shifts.error} onRetry={() => void Promise.all([staff.refetch(), shifts.refetch()])} />
      </SetupSection>
    );
  }

  return (
    <SetupSection id="shifts-section" title={messages.branchSetup.shifts}>
      {staff.data.length === 0 ? (
        <p className="text-muted-foreground">{messages.branchSetup.noStaffAssigned}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {staff.data.map((member) => {
              const memberShifts = shifts.data.filter((shift) => shift.staffId === member.id);
              return (
                <li key={member.id} className="flex flex-col gap-2 rounded-lg border p-3">
                  <span className="font-medium">{member.displayName}</span>
                  {memberShifts.length === 0 ? (
                    <span className="text-sm text-muted-foreground">{messages.branchSetup.noShifts}</span>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {memberShifts.map((shift) => (
                        <li key={shift.id} className="flex items-center gap-2">
                          <span className="flex-1 text-sm tabular-nums">{describeShift(shift)}</span>
                          <Button variant="ghost" size="icon" aria-label={`${messages.setup.remove} ${describeShift(shift)}`}
                            disabled={remove.isPending} onClick={() => remove.mutate(shift)}>
                            <Trash2 aria-hidden />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          <FormErrorAlert error={remove.error} />
          <AddShiftForm branch={branch} staff={staff.data} onAdded={refresh} />
        </>
      )}
    </SetupSection>
  );
}

function AddShiftForm({
  branch,
  staff,
  onAdded,
}: {
  branch: WorkBranch;
  staff: BranchStaffMember[];
  onAdded: () => Promise<unknown>;
}) {
  const [staffId, setStaffId] = useState(staff[0]?.id ?? "");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startsAt, setStartsAt] = useState("10:00");
  const [endsAt, setEndsAt] = useState("19:00");
  const [endsNextDay, setEndsNextDay] = useState(false);
  const [problems, setProblems] = useState<{ startsAt?: string; endsAt?: string }>({});
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("staff_shifts").insert({
        organization_id: branch.organizationId,
        staff_id: staffId,
        branch_id: branch.id,
        day_of_week: Number(dayOfWeek),
        starts_at: startsAt,
        ends_at: endsAt,
        ends_next_day: endsNextDay,
      });
      if (error) throw error;
    },
    onSuccess: onAdded,
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-4 rounded-lg bg-muted p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const found = findTimeRangeProblems({ startsAt, endsAt, endsNextDay }, branch.businessDayStart);
        const next = {
          startsAt: found.startsAt ? shiftWording[found.startsAt] : undefined,
          endsAt: found.endsAt ? shiftWording[found.endsAt] : undefined,
        };
        setProblems(next);
        if (!next.startsAt && !next.endsAt) add.mutate();
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <FormField id="shift-staff" label={messages.branchSetup.staffMember}>
          <Select value={staffId} onValueChange={setStaffId}>
            <SelectTrigger id="shift-staff"><SelectValue /></SelectTrigger>
            <SelectContent>
              {staff.map((member) => (
                <SelectItem key={member.id} value={member.id} className="min-h-11 text-base">{member.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="shift-day" label={messages.branchSetup.day}>
          <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
            <SelectTrigger id="shift-day"><SelectValue /></SelectTrigger>
            <SelectContent>
              {weekdayDisplayOrder.map((day) => (
                <SelectItem key={day} value={String(day)} className="min-h-11 text-base">{messages.hours.days[day]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="shift-starts" label={messages.branchSetup.starts} error={problems.startsAt}>
          <Input id="shift-starts" type="time" value={startsAt} aria-invalid={problems.startsAt ? true : undefined}
            aria-describedby={fieldIds("shift-starts").errorId} onChange={(event) => setStartsAt(event.target.value)} />
        </FormField>
        <FormField id="shift-ends" label={messages.branchSetup.ends} error={problems.endsAt}>
          <Input id="shift-ends" type="time" value={endsAt} aria-invalid={problems.endsAt ? true : undefined}
            aria-describedby={fieldIds("shift-ends").errorId} onChange={(event) => setEndsAt(event.target.value)} />
        </FormField>
      </div>
      <CheckboxField label={messages.branchSetup.endsNextDay} checked={endsNextDay} onChange={setEndsNextDay} />
      <FormErrorAlert error={add.error} />
      <Button type="submit" variant="outline" disabled={add.isPending || !staffId} className="md:self-start">
        <Plus aria-hidden />
        {messages.branchSetup.addShift}
      </Button>
    </form>
  );
}
