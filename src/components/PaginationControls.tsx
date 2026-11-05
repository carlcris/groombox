import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";

export function PaginationControls({
  page,
  pageSize,
  totalCount,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  if (pageCount === 1) return null;
  return (
    <nav className="flex items-center justify-between gap-3" aria-label={messages.team.page}>
      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
        <ChevronLeft aria-hidden />
        {messages.team.previous}
      </Button>
      <span className="text-sm text-muted-foreground tabular-nums">
        {messages.team.page} {page + 1} / {pageCount}
      </span>
      <Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => onPageChange(page + 1)}>
        {messages.team.next}
        <ChevronRight aria-hidden />
      </Button>
    </nav>
  );
}
