import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { SetupSection } from "@/components/SetupSection";
import { Button } from "@/components/ui/button";
import { branchSetupStatusQueryKey } from "@/features/organization/branch-setup-status";
import {
  organizationSettingsQueryKey,
  type OrganizationSettings,
} from "@/features/organization/organization-settings-queries";
import { formatDate } from "@/lib/date-formatting";
import { fillTemplate, messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

export function TermsAcceptance({ settings }: { settings: OrganizationSettings }) {
  const queryClient = useQueryClient();
  const accept = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("accept_terms", { p_organization_id: settings.id });
      if (error) throw error;
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: organizationSettingsQueryKey(settings.id) }),
        queryClient.invalidateQueries({ queryKey: branchSetupStatusQueryKey(settings.id) }),
      ]),
  });
  return (
    <SetupSection id="terms-section" title={messages.policies.termsSection}>
      <p>{messages.policies.termsBody}</p>
      {settings.termsAcceptedAt ? (
        <p className="flex items-center gap-2 text-success">
          <CircleCheck className="size-5" aria-hidden />
          {fillTemplate(messages.policies.termsAccepted, { date: formatDate(settings.termsAcceptedAt) })}
        </p>
      ) : (
        <>
          <FormErrorAlert error={accept.error} />
          <Button className="md:self-start" disabled={accept.isPending} onClick={() => accept.mutate()}>
            {messages.policies.acceptTerms}
          </Button>
        </>
      )}
    </SetupSection>
  );
}
