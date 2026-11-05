import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { FormField } from "@/components/FormField";
import { QueryErrorState } from "@/components/QueryErrorState";
import { SetupSection } from "@/components/SetupSection";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  branchSetupQueryKey,
  branchStaffQueryOptions,
  upcomingTimeOffQueryOptions,
} from "@/features/branch-setup/branch-setup-queries";
import { DateRangeForm, type DateRangeEntry } from "@/features/branch-setup/DateRangeForm";
import type { WorkBranch } from "@/features/organization/membership-queries";
import { formatDateTime } from "@/lib/date-formatting";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

export function TimeOffSection({ branch }: { branch: WorkBranch }) {
  const queryClient = useQueryClient();
  const staff = useQuery(branchStaffQueryOptions(branch.id));
  const staffIds = (staff.data ?? []).map((member) => member.id);
  const timeOff = useQuery(upcomingTimeOffQueryOptions(branch.id, staffIds));
  const [staffId, setStaffId] = useState<string>("");
  const selectedStaffId = staffId || staffIds[0] || "";
  const refresh = () => queryClient.invalidateQueries({ queryKey: branchSetupQueryKey(branch.id) });

  const add = useMutation({
    mutationFn: async (entry: DateRangeEntry) => {
      const { error } = await supabase.from("staff_time_off").insert({
        organization_id: branch.organizationId,
        staff_id: selectedStaffId,
        starts_at: entry.startsAt,
        ends_at: entry.endsAt,
        reason: entry.reason,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (timeOffId: string) => {
      const { error } = await supabase.from("staff_time_off").delete().eq("id", timeOffId);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  if (staff.isPending) {
    return (
      <SetupSection id="time-off-section" title={messages.branchSetup.timeOff}>
        <Skeleton className="h-16 rounded-xl" />
      </SetupSection>
    );
  }
  if (staff.isError) {
    return (
      <SetupSection id="time-off-section" title={messages.branchSetup.timeOff}>
        <QueryErrorState error={staff.error} onRetry={() => void staff.refetch()} />
      </SetupSection>
    );
  }

  const names = new Map(staff.data.map((member) => [member.id, member.displayName]));
  return (
    <SetupSection id="time-off-section" title={messages.branchSetup.timeOff}>
      {staff.data.length === 0 ? (
        <p className="text-muted-foreground">{messages.branchSetup.noStaffAssigned}</p>
      ) : (
        <>
          {timeOff.isError ? (
            <QueryErrorState error={timeOff.error} onRetry={() => void timeOff.refetch()} />
          ) : (timeOff.data ?? []).length === 0 ? (
            <p className="text-muted-foreground">{messages.branchSetup.noTimeOff}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(timeOff.data ?? []).map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <span className="flex-1">
                    <span className="font-medium">{names.get(entry.staffId)}</span>
                    <span className="block text-sm tabular-nums">
                      {formatDateTime(entry.startsAt, branch.timezone)} – {formatDateTime(entry.endsAt, branch.timezone)}
                    </span>
                    {entry.reason ? <span className="block text-sm text-muted-foreground">{entry.reason}</span> : null}
                  </span>
                  <Button variant="ghost" size="icon" aria-label={messages.setup.remove} disabled={remove.isPending}
                    onClick={() => remove.mutate(entry.id)}>
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <DateRangeForm
            idPrefix="time-off"
            timeZone={branch.timezone}
            fromLabel={messages.branchSetup.from}
            untilLabel={messages.branchSetup.until}
            submitLabel={messages.branchSetup.addTimeOff}
            isSaving={add.isPending}
            error={add.error ?? remove.error}
            extraFields={
              <FormField id="time-off-staff" label={messages.branchSetup.staffMember}>
                <Select value={selectedStaffId} onValueChange={setStaffId}>
                  <SelectTrigger id="time-off-staff"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {staff.data.map((member) => (
                      <SelectItem key={member.id} value={member.id} className="min-h-11 text-base">{member.displayName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            }
            onSubmit={(entry, reset) => add.mutate(entry, { onSuccess: reset })}
          />
        </>
      )}
    </SetupSection>
  );
}
