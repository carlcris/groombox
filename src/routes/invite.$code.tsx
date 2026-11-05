import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CircleAlert } from "lucide-react";
import { CenteredPage } from "@/components/CenteredPage";
import { FormErrorAlert } from "@/components/FormErrorAlert";
import { PageHeading } from "@/components/PageHeading";
import { QueryErrorState } from "@/components/QueryErrorState";
import { Button } from "@/components/ui/button";
import { readAccountSession } from "@/features/auth/auth-session";
import { storeOrganizationId } from "@/features/organization/current-workplace";
import { myBranchesQueryOptions, myMembershipsQueryOptions } from "@/features/organization/membership-queries";
import { acceptInvite, invitePreviewQueryOptions } from "@/features/team/invite-preview-query";
import { formatDateTime } from "@/lib/date-formatting";
import { fillTemplate, messages } from "@/lib/messages";

// The invitee sees the organization, role, and branches before signing in (app flow §11).
export const Route = createFileRoute("/invite/$code")({
  beforeLoad: async () => ({ session: await readAccountSession() }),
  loader: ({ context, params }) => context.queryClient.fetchQuery(invitePreviewQueryOptions(params.code)),
  component: InvitePage,
  errorComponent: ({ error, reset }) => (
    <CenteredPage>
      <QueryErrorState error={error} onRetry={reset} />
    </CenteredPage>
  ),
});

function InvitePage() {
  const { code } = Route.useParams();
  const { session } = Route.useRouteContext();
  const { data: preview } = useSuspenseQuery(invitePreviewQueryOptions(code));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const invitePath = `/invite/${code}`;

  const join = useMutation({
    mutationFn: () => acceptInvite(code),
    onSuccess: async (organizationId) => {
      if (!session) return;
      storeOrganizationId(organizationId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: myMembershipsQueryOptions(session.user.id).queryKey }),
        queryClient.invalidateQueries({ queryKey: myBranchesQueryOptions(session.user.id).queryKey }),
      ]);
      await navigate({ to: "/shop" });
    },
  });

  if (!preview) {
    return (
      <CenteredPage>
        <div role="alert" className="flex flex-col gap-3 rounded-xl border bg-card p-6 shadow-sm">
          <CircleAlert className="size-6 text-danger" aria-hidden />
          <PageHeading>{messages.invite.unavailableTitle}</PageHeading>
          <p>{messages.errors.inviteUnavailable}</p>
        </div>
      </CenteredPage>
    );
  }

  const role = messages.roles[preview.role].toLowerCase();
  return (
    <CenteredPage>
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm">
        <PageHeading>{messages.invite.title}</PageHeading>
        <p className="text-lg">{fillTemplate(messages.invite.body, { organization: preview.organizationName, role })}</p>
        <dl className="flex flex-col gap-3">
          <div>
            <dt className="text-sm text-muted-foreground">{messages.invite.branches}</dt>
            <dd>{preview.branchNames.join(", ")}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">{messages.invite.expires}</dt>
            <dd>
              <time dateTime={preview.expiresAt}>{formatDateTime(preview.expiresAt)}</time>
            </dd>
          </div>
        </dl>
      </div>
      {session ? (
        <div className="flex flex-col gap-3">
          <FormErrorAlert error={join.error} />
          <Button disabled={join.isPending} onClick={() => join.mutate()}>
            {fillTemplate(messages.invite.join, { organization: preview.organizationName })}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Button asChild>
            <Link to="/sign-up" search={{ redirect: invitePath }}>
              {messages.invite.signUpToJoin}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/sign-in" search={{ redirect: invitePath }}>
              {messages.invite.signInToJoin}
            </Link>
          </Button>
        </div>
      )}
    </CenteredPage>
  );
}
