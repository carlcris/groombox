import { FormField } from "@/components/FormField";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BranchStaffMember } from "@/features/branch-setup/branch-setup-queries";

const noStaff = "none";

// A staff member assigned to the branch; with an empty label, the choice may also be left open.
export function StaffSelectField({
  id,
  label,
  staff,
  value,
  emptyLabel,
  error,
  onChange,
}: {
  id: string;
  label: string;
  staff: BranchStaffMember[];
  value: string | null;
  emptyLabel?: string;
  error?: string;
  onChange: (staffId: string | null) => void;
}) {
  return (
    <FormField id={id} label={label} error={error}>
      <Select value={value ?? noStaff} onValueChange={(choice) => onChange(choice === noStaff ? null : choice)}>
        <SelectTrigger id={id} aria-invalid={error ? true : undefined}>
          <SelectValue placeholder={emptyLabel} />
        </SelectTrigger>
        <SelectContent>
          {emptyLabel ? (
            <SelectItem value={noStaff} className="min-h-11 text-base">
              {emptyLabel}
            </SelectItem>
          ) : null}
          {staff.map((member) => (
            <SelectItem key={member.id} value={member.id} className="min-h-11 text-base">
              {member.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}
