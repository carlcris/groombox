import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { removeMember, teamQueryKey, type TeamMember } from "@/features/team/team-queries";
import { messages } from "@/lib/messages";

export function RemoveMemberDialog({
  organizationId,
  member,
  onClose,
}: {
  organizationId: string;
  member: TeamMember;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: removeMember,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: teamQueryKey(organizationId) });
      toast.success(messages.team.memberRemoved);
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">{messages.team.removeTitle}</DialogTitle>
          <DialogDescription>
            {member.fullName ?? messages.team.unnamed}. {messages.team.removeBody}
          </DialogDescription>
        </DialogHeader>
        <FormErrorAlert error={remove.error} />
        <DialogFooter className="gap-3">
          <Button variant="outline" onClick={onClose}>
            {messages.team.cancel}
          </Button>
          <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate(member.id)}>
            {messages.team.remove}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
