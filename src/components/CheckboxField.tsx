import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function CheckboxField({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="flex min-h-11 items-center gap-3 text-base font-normal">
        <Checkbox checked={checked} disabled={disabled} onCheckedChange={(value) => onChange(value === true)} />
        {label}
      </Label>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
