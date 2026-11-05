import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { PageHeading } from "@/components/PageHeading";
import { messages } from "@/lib/messages";

export function SetupPageLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link to="/shop/setup" className="flex min-h-11 items-center gap-1 self-start text-primary underline-offset-4 hover:underline">
          <ChevronLeft className="size-5" aria-hidden />
          {messages.setup.title}
        </Link>
        <PageHeading>{title}</PageHeading>
      </div>
      {children}
    </div>
  );
}
