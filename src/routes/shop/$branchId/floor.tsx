import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageHeading } from "@/components/PageHeading";
import { messages } from "@/lib/messages";

// The floor view's queue arrives in phase 5; until then the branch's landing page is empty.
export const Route = createFileRoute("/shop/$branchId/floor")({
  component: FloorPage,
});

function FloorPage() {
  const { branch } = Route.useRouteContext();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <PageHeading>{messages.shop.floorTitle}</PageHeading>
        <p className="text-muted-foreground">{branch.name}</p>
      </div>
      <EmptyState icon={CalendarClock}>{messages.shop.floorEmpty}</EmptyState>
    </div>
  );
}
