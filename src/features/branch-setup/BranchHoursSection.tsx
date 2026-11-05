import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { QueryErrorState } from "@/components/QueryErrorState";
import { SetupSection } from "@/components/SetupSection";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { branchHoursQueryOptions, branchSetupQueryKey } from "@/features/branch-setup/branch-setup-queries";
import { refreshBranchData } from "@/features/organization/branch-cache";
import {
  toBranchHoursPayload,
  toWeekHours,
  weekHoursSchema,
  type DayHours,
} from "@/features/organization/branch-hours-schema";
import type { WorkBranch } from "@/features/organization/membership-queries";
import { WeekHoursEditor } from "@/features/organization/WeekHoursEditor";
import { firstFieldError } from "@/components/FormField";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

export function BranchHoursSection({ branch, isPublished }: { branch: WorkBranch; isPublished: boolean }) {
  const hours = useQuery(branchHoursQueryOptions(branch.id));
  return (
    <SetupSection id="hours-section" title={messages.branchSetup.hours} intro={messages.onboarding.hoursIntro}>
      {hours.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : hours.isError ? (
        <QueryErrorState error={hours.error} onRetry={() => void hours.refetch()} />
      ) : (
        <BranchHoursForm branch={branch} isPublished={isPublished} initialHours={toWeekHours(hours.data)} />
      )}
    </SetupSection>
  );
}

function BranchHoursForm({
  branch,
  isPublished,
  initialHours,
}: {
  branch: WorkBranch;
  isPublished: boolean;
  initialHours: DayHours[];
}) {
  const queryClient = useQueryClient();
  // A published branch keeps at least one open day (SET-10).
  const schema = z.object({ hours: weekHoursSchema(branch.businessDayStart, { requireOpenDay: isPublished }) });
  const save = useMutation({
    mutationFn: async (hours: DayHours[]) => {
      const { error } = await supabase.rpc("set_branch_hours", {
        p_branch_id: branch.id,
        p_hours: toBranchHoursPayload(hours),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: branchSetupQueryKey(branch.id) }),
        refreshBranchData(queryClient, branch.organizationId),
      ]);
      toast.success(messages.branchSetup.hoursSaved);
    },
  });
  const form = useForm({
    defaultValues: { hours: initialHours },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: schema },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(value.hours).catch(() => undefined);
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
      <form.Subscribe selector={(state) => state.submissionAttempts > 0}>
        {(submitted) => (
          <form.Field name="hours">
            {(field) => {
              const openDayProblem = firstFieldError(field.state.meta.errors);
              return (
                <>
                  <WeekHoursEditor idPrefix="branch" value={field.state.value} businessDayStart={branch.businessDayStart}
                    showProblems={submitted} onChange={field.handleChange} />
                  {openDayProblem === messages.publishGuards.lastOpenDay ? (
                    <p role="alert" className="text-sm text-danger">{openDayProblem}</p>
                  ) : null}
                </>
              );
            }}
          </form.Field>
        )}
      </form.Subscribe>
      <FormErrorAlert error={save.error} />
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" disabled={isSubmitting} className="md:self-start">
            {messages.branchSetup.saveHours}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
