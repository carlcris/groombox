import { Circle, CircleCheck } from "lucide-react";
import { publishingChecklist, type BranchSetupStatus } from "@/features/organization/branch-setup-status";
import { messages } from "@/lib/messages";

export function PublishingChecklist({ status }: { status: BranchSetupStatus }) {
  return (
    <ul className="flex flex-col gap-2">
      {publishingChecklist(status).map((item) => (
        <li key={item.key} className="flex items-center gap-3">
          {item.done ? (
            <CircleCheck className="size-5 text-success" aria-hidden />
          ) : (
            <Circle className="size-5 text-muted-foreground" aria-hidden />
          )}
          <span className={item.done ? "text-muted-foreground" : undefined}>{item.label}</span>
          <span className="sr-only">: {item.done ? messages.checklist.done : messages.checklist.toDo}</span>
        </li>
      ))}
    </ul>
  );
}
