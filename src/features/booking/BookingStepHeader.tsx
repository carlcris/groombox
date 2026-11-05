import { ChevronLeft } from "lucide-react";
import { PageHeading } from "@/components/PageHeading";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";

// Step title with a back button (app flow §3).
export function BookingStepHeader({ title, shopName, onBack }: { title: string; shopName: string; onBack: () => void }) {
  return (
    <header className="flex items-start gap-2">
      <Button variant="ghost" size="icon" className="-ml-3" onClick={onBack} aria-label={messages.booking.back}>
        <ChevronLeft aria-hidden />
      </Button>
      <div className="flex flex-col gap-1 pt-1">
        <p className="text-sm text-muted-foreground">{shopName}</p>
        <PageHeading>{title}</PageHeading>
      </div>
    </header>
  );
}
