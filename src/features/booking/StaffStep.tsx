import { UserRound, Users } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { anyStaff } from "@/features/booking/booking-flow-search";
import type { PublicStaffMember } from "@/features/booking/public-branch-queries";
import { cn } from "@/lib/class-names";
import { messages } from "@/lib/messages";
import { publicImageUrl } from "@/lib/stored-images";

function StaffChoice({
  label,
  hint,
  photoPath,
  selected,
  onSelect,
}: {
  label: string;
  hint: string;
  photoPath: string | null;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "flex min-h-11 w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left shadow-sm transition-colors duration-150 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          selected && "border-primary bg-accent",
        )}
      >
        {photoPath ? (
          <img src={publicImageUrl("shop-media", photoPath)} alt="" className="size-12 rounded-full object-cover" />
        ) : (
          <span className="flex size-12 items-center justify-center rounded-full bg-muted">
            {label === messages.booking.anyAvailable ? <Users className="size-6" aria-hidden /> : <UserRound className="size-6" aria-hidden />}
          </span>
        )}
        <span className="flex flex-col">
          <span className="font-medium">{label}</span>
          {hint ? <span className="text-sm text-muted-foreground">{hint}</span> : null}
        </span>
      </button>
    </li>
  );
}

// Step 2: a staff member who performs every chosen service, or "Any available" first (design
// brief §5).
export function StaffStep({
  staff,
  serviceIds,
  selected,
  onSelect,
}: {
  staff: PublicStaffMember[];
  serviceIds: string[];
  selected: string | undefined;
  onSelect: (staff: string) => void;
}) {
  const qualified = staff.filter((member) => serviceIds.every((serviceId) => member.serviceIds.includes(serviceId)));
  if (qualified.length === 0) return <EmptyState icon={Users}>{messages.booking.noStaffForServices}</EmptyState>;
  return (
    <ul className="flex flex-col gap-3">
      <StaffChoice
        label={messages.booking.anyAvailable}
        hint={messages.booking.anyAvailableHint}
        photoPath={null}
        selected={selected === anyStaff}
        onSelect={() => onSelect(anyStaff)}
      />
      {qualified.map((member) => (
        <StaffChoice
          key={member.id}
          label={member.displayName}
          hint={member.title}
          photoPath={member.photoPath}
          selected={selected === member.id}
          onSelect={() => onSelect(member.id)}
        />
      ))}
    </ul>
  );
}
