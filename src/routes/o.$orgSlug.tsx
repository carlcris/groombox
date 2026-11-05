import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ChevronRight, MapPin } from "lucide-react";
import { PageHeading } from "@/components/PageHeading";
import { QueryErrorState } from "@/components/QueryErrorState";
import { NotTakingBookings } from "@/features/booking/NotTakingBookings";
import { PublicPageLayout } from "@/features/booking/PublicPageLayout";
import { organizationBranchesQueryOptions } from "@/features/booking/public-branch-queries";
import { fillTemplate, messages } from "@/lib/messages";
import { publicImageUrl } from "@/lib/stored-images";

// An organization's published branches (BKG-1).
export const Route = createFileRoute("/o/$orgSlug")({
  loader: ({ context, params }) => context.queryClient.fetchQuery(organizationBranchesQueryOptions(params.orgSlug)),
  component: OrganizationPage,
  errorComponent: OrganizationError,
});

function OrganizationPage() {
  const branches = Route.useLoaderData();
  const first = branches[0];
  return (
    <PublicPageLayout>
      {!first ? (
        <NotTakingBookings />
      ) : (
        <>
          <header className="flex items-center gap-3">
            {first.organizationLogoPath ? (
              <img
                src={publicImageUrl("shop-media", first.organizationLogoPath)}
                alt={fillTemplate(messages.publicBranch.logo, { organization: first.organizationName })}
                className="size-14 rounded-xl border object-cover"
              />
            ) : null}
            <div className="flex flex-col gap-1">
              <PageHeading>{first.organizationName}</PageHeading>
              <p className="text-muted-foreground">{messages.publicBranch.chooseBranch}</p>
            </div>
          </header>
          <ul className="flex flex-col gap-3" aria-label={messages.publicBranch.branches}>
            {branches.map((branch) => (
              <li key={branch.slug}>
                <Link
                  to="/b/$branchSlug"
                  params={{ branchSlug: branch.slug }}
                  className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <span className="flex flex-1 flex-col gap-1">
                    <span className="text-lg font-medium">{branch.name}</span>
                    <span className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="size-4 shrink-0" aria-hidden />
                      {[branch.address, branch.area, branch.city].filter(Boolean).join(", ")}
                    </span>
                  </span>
                  <ChevronRight aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </PublicPageLayout>
  );
}

function OrganizationError({ error }: { error: unknown }) {
  const router = useRouter();
  return (
    <PublicPageLayout>
      <QueryErrorState error={error} onRetry={() => void router.invalidate()} />
    </PublicPageLayout>
  );
}
