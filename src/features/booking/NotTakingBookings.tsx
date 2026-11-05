import { Store } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeading } from "@/components/PageHeading";
import { messages } from "@/lib/messages";

// A branch that is unpublished, deactivated, or unknown (app flow §16).
export function NotTakingBookings() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeading>{messages.publicBranch.notTakingBookingsTitle}</PageHeading>
      <EmptyState icon={Store}>{messages.publicBranch.notTakingBookingsBody}</EmptyState>
    </div>
  );
}
