import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { TaskSheet } from "@/components/TaskSheet";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";
import { supabase } from "@/lib/supabase-client";

export function CancelBookingDialog({
  bookingId,
  open,
  onOpenChange,
  onCancelled,
}: {
  bookingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled: () => void;
}) {
  const [reason, setReason] = useState("");
  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("cancel_booking", {
        p_booking_id: bookingId,
        p_reason: reason.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      onOpenChange(false);
      toast.success(messages.bookingPage.cancelled);
      onCancelled();
    },
  });
  return (
    <TaskSheet open={open} onOpenChange={onOpenChange} title={messages.bookingPage.cancelTitle} description={messages.bookingPage.cancelBody}>
      <div className="flex flex-col gap-4">
        <TextField
          id="cancel-reason"
          label={messages.bookingPage.cancelReason}
          value={reason}
          errors={[]}
          onChange={setReason}
          onBlur={() => undefined}
        />
        <FormErrorAlert error={cancel.error} />
        <div className="flex flex-col gap-3 md:flex-row-reverse">
          <Button variant="destructive" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            {messages.bookingPage.cancel}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {messages.bookingPage.keepBooking}
          </Button>
        </div>
      </div>
    </TaskSheet>
  );
}
