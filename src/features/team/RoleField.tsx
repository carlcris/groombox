import { FormField } from "@/components/FormField";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { assignableRoles, type AssignableRole } from "@/features/team/member-schemas";
import { messages } from "@/lib/messages";

export function RoleField({ id, value, onChange }: { id: string; value: AssignableRole; onChange: (role: AssignableRole) => void }) {
  return (
    <FormField id={id} label={messages.team.role}>
      <Select value={value} onValueChange={(role) => onChange(role as AssignableRole)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {assignableRoles.map((role) => (
            <SelectItem key={role} value={role} className="min-h-11 text-base">
              {messages.roles[role]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );
}
