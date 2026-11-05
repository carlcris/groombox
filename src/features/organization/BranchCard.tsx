import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Copy, CreditCard, Eye, EyeOff, MapPin, Pencil, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { refreshBranchData } from "@/features/organization/branch-cache";
import type { OwnedBranch } from "@/features/organization/branch-queries";
import { isReadyToPublish, type BranchSetupStatus } from "@/features/organization/branch-setup-status";
import { BranchDetailsSheet } from "@/features/organization/BranchDetailsSheet";
import { PaymentDetailsSheet } from "@/features/organization/PaymentDetailsSheet";
import { PublishingChecklist } from "@/features/organization/PublishingChecklist";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

type OpenSheet = "details" | "payment" | "deactivate" | null;

export function BranchCard({
  organizationId,
  branch,
  status,
}: {
  organizationId: string;
  branch: OwnedBranch;
  status: BranchSetupStatus | undefined;
}) {
  const queryClient = useQueryClient();
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);
  const bookingLink = `${window.location.origin}/b/${branch.slug}`;

  const setPublished = useMutation({
    mutationFn: async (isPublished: boolean) => {
      const { error } = await supabase.from("branches").update({ is_published: isPublished }).eq("id", branch.id);
      if (error) throw error;
      return isPublished;
    },
    onSuccess: async (isPublished) => {
      await refreshBranchData(queryClient, organizationId);
      toast.success(isPublished ? messages.branches.publishedToast : messages.branches.unpublishedToast);
    },
  });

  // Deactivating needs the branch unpublished (and, once bookings exist, none upcoming).
  const deactivate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("branches").update({ is_active: false }).eq("id", branch.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setOpenSheet(null);
      await refreshBranchData(queryClient, organizationId);
      toast.success(messages.branches.deactivated);
    },
  });

  const ready = status ? isReadyToPublish(status) : false;

  return (
    <li className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm md:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">{branch.name}</h2>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="size-5" aria-hidden />
            {[branch.address, branch.area, branch.city].filter(Boolean).join(", ")}
          </p>
        </div>
        <Badge
          variant="secondary"
          className={branch.isPublished ? "rounded-full bg-success-surface text-success" : "rounded-full"}
        >
          {branch.isPublished ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
          {branch.isPublished ? messages.branches.published : messages.branches.notPublished}
        </Badge>
      </div>

      {branch.isPublished ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{messages.branches.publishedNotice}</p>
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => void navigator.clipboard.writeText(bookingLink).then(() => toast.success(messages.branches.linkCopied))}
          >
            <Copy aria-hidden />
            {messages.branches.copyLink}
          </Button>
        </div>
      ) : status ? (
        <div className="flex flex-col gap-3 rounded-lg bg-muted p-4">
          <h3 className="font-medium">{messages.checklist.title}</h3>
          <PublishingChecklist status={status} />
          {ready ? <p className="text-sm text-muted-foreground">{messages.checklist.ready}</p> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpenSheet("details")}>
          <Pencil aria-hidden />
          {messages.branches.details}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setOpenSheet("payment")}>
          <CreditCard aria-hidden />
          {messages.branches.paymentDetails}
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/shop/$branchId/setup" params={{ branchId: branch.id }}>
            <Settings2 aria-hidden />
            {messages.branches.branchSetup}
          </Link>
        </Button>
      </div>

      <FormErrorAlert error={setPublished.error} />
      <div className="flex flex-wrap gap-2">
        {branch.isPublished ? (
          <Button variant="outline" disabled={setPublished.isPending} onClick={() => setPublished.mutate(false)}>
            {messages.branches.unpublish}
          </Button>
        ) : (
          <>
            <Button disabled={!ready || setPublished.isPending} onClick={() => setPublished.mutate(true)}>
              {messages.branches.publish}
            </Button>
            <Button variant="ghost" className="text-danger" onClick={() => setOpenSheet("deactivate")}>
              {messages.branches.deactivate}
            </Button>
          </>
        )}
      </div>

      {openSheet === "details" ? (
        <BranchDetailsSheet organizationId={organizationId} branch={branch} onClose={() => setOpenSheet(null)} />
      ) : null}
      {openSheet === "payment" ? (
        <PaymentDetailsSheet organizationId={organizationId} branch={branch} onClose={() => setOpenSheet(null)} />
      ) : null}
      <Dialog open={openSheet === "deactivate"} onOpenChange={(open) => (open ? null : setOpenSheet(null))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">{messages.branches.deactivateTitle}</DialogTitle>
            <DialogDescription>{messages.branches.deactivateBody}</DialogDescription>
          </DialogHeader>
          <FormErrorAlert error={deactivate.error} />
          <DialogFooter className="gap-3">
            <Button variant="outline" onClick={() => setOpenSheet(null)}>
              {messages.setup.cancel}
            </Button>
            <Button variant="destructive" disabled={deactivate.isPending} onClick={() => deactivate.mutate()}>
              {messages.branches.deactivate}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
