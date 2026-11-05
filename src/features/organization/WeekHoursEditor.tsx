import { fieldIds, FormField } from "@/components/FormField";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  findDayHoursProblems,
  weekdayDisplayOrder,
  type DayHours,
} from "@/features/organization/branch-hours-schema";
import { messages } from "@/lib/messages";

// Seven days of opening hours. Each day's problems show under its fields once `showProblems` is
// set, which forms do after the first submit.
export function WeekHoursEditor({
  idPrefix,
  value,
  businessDayStart,
  showProblems,
  onChange,
}: {
  idPrefix: string;
  value: DayHours[];
  businessDayStart: string;
  showProblems: boolean;
  onChange: (hours: DayHours[]) => void;
}) {
  function updateDay(dayOfWeek: number, change: Partial<DayHours>) {
    onChange(value.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, ...change } : day)));
  }

  return (
    <ul className="flex flex-col gap-3">
      {weekdayDisplayOrder.map((dayOfWeek) => {
        const day = value.find((candidate) => candidate.dayOfWeek === dayOfWeek);
        if (!day) return null;
        const problems = showProblems ? findDayHoursProblems(day, businessDayStart) : {};
        const opensId = `${idPrefix}-opens-${dayOfWeek}`;
        const closesId = `${idPrefix}-closes-${dayOfWeek}`;
        return (
          <li key={dayOfWeek} className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-medium">{messages.hours.days[dayOfWeek]}</h3>
              <Label className="flex min-h-11 items-center gap-2 text-base font-normal">
                <Checkbox
                  checked={day.isClosed}
                  onCheckedChange={(checked) => updateDay(dayOfWeek, { isClosed: checked === true })}
                />
                {messages.hours.closed}
              </Label>
            </div>
            {day.isClosed ? null : (
              <div className="grid grid-cols-2 gap-3">
                <FormField id={opensId} label={messages.hours.opens} error={problems.opensAt}>
                  <Input
                    id={opensId}
                    type="time"
                    value={day.opensAt}
                    aria-invalid={problems.opensAt ? true : undefined}
                    aria-describedby={fieldIds(opensId).errorId}
                    onChange={(event) => updateDay(dayOfWeek, { opensAt: event.target.value })}
                  />
                </FormField>
                <FormField id={closesId} label={messages.hours.closes} error={problems.closesAt}>
                  <Input
                    id={closesId}
                    type="time"
                    value={day.closesAt}
                    aria-invalid={problems.closesAt ? true : undefined}
                    aria-describedby={fieldIds(closesId).errorId}
                    onChange={(event) => updateDay(dayOfWeek, { closesAt: event.target.value })}
                  />
                </FormField>
                <Label className="col-span-2 flex min-h-11 items-center gap-2 text-base font-normal">
                  <Checkbox
                    checked={day.closesNextDay}
                    onCheckedChange={(checked) => updateDay(dayOfWeek, { closesNextDay: checked === true })}
                  />
                  {messages.hours.closesNextDay}
                </Label>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
