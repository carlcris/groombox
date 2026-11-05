import { useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { PageHeading } from "@/components/PageHeading";
import { Button } from "@/components/ui/button";
import { CreateInviteSheet } from "@/features/team/CreateInviteSheet";
import { OpenInviteList } from "@/features/team/OpenInviteList";
import { TeamMemberList } from "@/features/team/TeamMemberList";
import { messages } from "@/lib/messages";

// Members and invites, for the owner only (ACC-3, ACC-4).
export const Route = createFileRoute("/shop/team")({
  beforeLoad: ({ context }) => {
    if (context.currentMembership.role !== "owner") throw redirect({ to: "/shop" });
  },
  component: TeamPage,
});

function TeamPage() {
  const { currentMembership, branches } = Route.useRouteContext();
  const [inviteOpen, setInviteOpen] = useState(false);
  const organizationId = currentMembership.organizationId;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1">
          <PageHeading>{messages.team.title}</PageHeading>
          <p className="text-muted-foreground">{messages.team.intro}</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus aria-hidden />
          {messages.team.invite}
        </Button>
      </div>
      <section className="flex flex-col gap-3" aria-labelledby="members-heading">
        <h2 id="members-heading" className="text-xl font-semibold">
          {messages.team.members}
        </h2>
        <TeamMemberList organizationId={organizationId} branches={branches} />
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="invites-heading">
        <h2 id="invites-heading" className="text-xl font-semibold">
          {messages.team.invites}
        </h2>
        <OpenInviteList organizationId={organizationId} branches={branches} />
      </section>
      <CreateInviteSheet
        organizationId={organizationId}
        branches={branches}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />
    </div>
  );
}
