import { fieldIds, firstFieldError } from "@/components/FormField";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { WorkBranch } from "@/features/organization/membership-queries";
import { messages } from "@/lib/messages";

export function BranchChoiceField({
  id,
  branches,
  value,
  errors,
  onChange,
}: {
  id: string;
  branches: WorkBranch[];
  value: string[];
  errors: readonly unknown[];
  onChange: (branchIds: string[]) => void;
}) {
  const error = firstFieldError(errors);
  const { errorId } = fieldIds(id);
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={errorId} aria-invalid={error ? true : undefined}>
      <legend className="mb-2 text-base font-medium">{messages.team.branches}</legend>
      {branches.map((branch) => (
        <Label key={branch.id} className="flex min-h-11 items-center gap-3 text-base font-normal">
          <Checkbox
            checked={value.includes(branch.id)}
            onCheckedChange={(checked) =>
              onChange(checked === true ? [...value, branch.id] : value.filter((branchId) => branchId !== branch.id))
            }
          />
          {branch.name}
        </Label>
      ))}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
