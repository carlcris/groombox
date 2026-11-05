import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { QueryErrorState } from "@/components/QueryErrorState";
import { NotTakingBookings } from "@/features/booking/NotTakingBookings";
import { PublicPageLayout } from "@/features/booking/PublicPageLayout";
import { publicBranchQueryOptions } from "@/features/booking/public-branch-queries";

// A branch's public pages. Anyone may open them, with or without a session; an unpublished or
// unknown branch is not taking online bookings (app flow §16).
export const Route = createFileRoute("/b/$branchSlug")({
  beforeLoad: async ({ context, params }) => ({
    publicBranch: await context.queryClient.fetchQuery(publicBranchQueryOptions(params.branchSlug)),
  }),
  component: BranchLayout,
  errorComponent: BranchError,
});

function BranchLayout() {
  const { publicBranch } = Route.useRouteContext();
  return <PublicPageLayout>{publicBranch ? <Outlet /> : <NotTakingBookings />}</PublicPageLayout>;
}

function BranchError({ error }: { error: unknown }) {
  const router = useRouter();
  return (
    <PublicPageLayout>
      <QueryErrorState error={error} onRetry={() => void router.invalidate()} />
    </PublicPageLayout>
  );
}
