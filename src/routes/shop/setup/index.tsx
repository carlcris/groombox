import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, ChevronRight, ClipboardList, Scissors, Store, Users, type LucideIcon } from "lucide-react";
import { PageHeading } from "@/components/PageHeading";
import { messages } from "@/lib/messages";

type SetupLink = {
  to: "/shop/setup/organization" | "/shop/setup/services" | "/shop/setup/staff" | "/shop/setup/branches" | "/shop/setup/policies";
  title: string;
  hint: string;
  icon: LucideIcon;
};

const setupLinks: SetupLink[] = [
  { to: "/shop/setup/organization", title: messages.setup.organization, hint: messages.setup.organizationHint, icon: Store },
  { to: "/shop/setup/services", title: messages.setup.services, hint: messages.setup.servicesHint, icon: Scissors },
  { to: "/shop/setup/staff", title: messages.setup.staff, hint: messages.setup.staffHint, icon: Users },
  { to: "/shop/setup/branches", title: messages.setup.branches, hint: messages.setup.branchesHint, icon: Building2 },
  { to: "/shop/setup/policies", title: messages.setup.policies, hint: messages.setup.policiesHint, icon: ClipboardList },
];

export const Route = createFileRoute("/shop/setup/")({
  component: SetupHubPage,
});

function SetupHubPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <PageHeading>{messages.setup.title}</PageHeading>
        <p className="text-muted-foreground">{messages.setup.intro}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {setupLinks.map((link) => (
          <li key={link.to}>
            <Link
              to={link.to}
              className="flex min-h-11 items-center gap-4 rounded-xl border bg-card p-4 shadow-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <link.icon className="size-6 text-primary" aria-hidden />
              <span className="flex flex-1 flex-col">
                <span className="text-lg font-medium">{link.title}</span>
                <span className="text-sm text-muted-foreground">{link.hint}</span>
              </span>
              <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
