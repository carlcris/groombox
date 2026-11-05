import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { QueryErrorState } from "@/components/QueryErrorState";
import { SetupSection } from "@/components/SetupSection";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { branchSetupQueryKey, upcomingClosuresQueryOptions } from "@/features/branch-setup/branch-setup-queries";
import { DateRangeForm, type DateRangeEntry } from "@/features/branch-setup/DateRangeForm";
import type { WorkBranch } from "@/features/organization/membership-queries";
import { formatDateTime } from "@/lib/date-formatting";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

export function ClosuresSection({ branch }: { branch: WorkBranch }) {
  const queryClient = useQueryClient();
  const closures = useQuery(upcomingClosuresQueryOptions(branch.id));
  const refresh = () => queryClient.invalidateQueries({ queryKey: branchSetupQueryKey(branch.id) });
  const add = useMutation({
    mutationFn: async (entry: DateRangeEntry) => {
      const { error } = await supabase.from("branch_closures").insert({
        organization_id: branch.organizationId,
        branch_id: branch.id,
        starts_at: entry.startsAt,
        ends_at: entry.endsAt,
        reason: entry.reason,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (closureId: string) => {
      const { error } = await supabase.from("branch_closures").delete().eq("id", closureId);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  return (
    <SetupSection id="closures-section" title={messages.branchSetup.closures} intro={messages.branchSetup.closuresIntro}>
      {closures.isPending ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : closures.isError ? (
        <QueryErrorState error={closures.error} onRetry={() => void closures.refetch()} />
      ) : closures.data.length === 0 ? (
        <p className="text-muted-foreground">{messages.branchSetup.noClosures}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {closures.data.map((closure) => (
            <li key={closure.id} className="flex items-center gap-3 rounded-lg border p-3">
              <span className="flex-1 tabular-nums">
                {formatDateTime(closure.startsAt, branch.timezone)} – {formatDateTime(closure.endsAt, branch.timezone)}
                {closure.reason ? <span className="block text-sm text-muted-foreground">{closure.reason}</span> : null}
              </span>
              <Button variant="ghost" size="icon" aria-label={messages.setup.remove} disabled={remove.isPending}
                onClick={() => remove.mutate(closure.id)}>
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <DateRangeForm
        idPrefix="closure"
        timeZone={branch.timezone}
        fromLabel={messages.branchSetup.closedFrom}
        untilLabel={messages.branchSetup.closedUntil}
        submitLabel={messages.branchSetup.addClosure}
        isSaving={add.isPending}
        error={add.error ?? remove.error}
        onSubmit={(entry, reset) => add.mutate(entry, { onSuccess: reset })}
      />
    </SetupSection>
  );
}
