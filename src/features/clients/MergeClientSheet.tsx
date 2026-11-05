import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { TaskSheet } from "@/components/TaskSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clientPageQueryOptions, clientsQueryKey, type ClientSummary } from "@/features/clients/client-queries";
import { cn } from "@/lib/class-names";
import { fillTemplate, messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

// Folds a duplicate record into this client: its visits and notes move here and the duplicate is
// removed (merge_clients). Records linked to two different accounts cannot be merged.
export function MergeClientSheet({
  organizationId,
  client,
  onClose,
}: {
  organizationId: string;
  client: ClientSummary;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(client.fullName.split(" ")[0] ?? "");
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const candidates = useQuery(clientPageQueryOptions(organizationId, search, 0));
  const merge = useMutation({
    mutationFn: async (duplicate: string) => {
      const { error } = await supabase.rpc("merge_clients", { p_keep_client_id: client.id, p_duplicate_client_id: duplicate });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: clientsQueryKey(organizationId) });
      toast.success(messages.clients.merged);
      onClose();
    },
  });
  const options = (candidates.data?.clients ?? []).filter((candidate) => candidate.id !== client.id);
  return (
    <TaskSheet open onOpenChange={(open) => (open ? null : onClose())} title={messages.clients.mergeTitle} description={messages.clients.mergeIntro}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="merge-search" className="text-base font-medium">
            {messages.clients.search}
          </Label>
          <Input id="merge-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-lg border">
          {options.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                aria-pressed={duplicateId === candidate.id}
                onClick={() => setDuplicateId(candidate.id)}
                className={cn(
                  "flex min-h-11 w-full flex-col px-3 py-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                  duplicateId === candidate.id && "bg-accent",
                )}
              >
                <span className="font-medium">{candidate.fullName}</span>
                <span className="text-sm text-muted-foreground tabular-nums">{candidate.mobileNumber ?? messages.clients.noMobile}</span>
              </button>
            </li>
          ))}
          {options.length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">{messages.clients.noMatches}</li> : null}
        </ul>
        <FormErrorAlert error={merge.error} />
        <Button disabled={!duplicateId || merge.isPending} onClick={() => duplicateId && merge.mutate(duplicateId)}>
          {fillTemplate(messages.clients.mergeButton, { name: client.fullName })}
        </Button>
      </div>
    </TaskSheet>
  );
}
