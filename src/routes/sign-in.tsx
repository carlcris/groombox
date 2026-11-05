import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { CenteredPage } from "@/components/CenteredPage";
import { PageHeading } from "@/components/PageHeading";
import { readAccountSession, safeRedirectPath } from "@/features/auth/auth-session";
import { GoogleSignInButton } from "@/features/auth/GoogleSignInButton";
import { SignInForm } from "@/features/auth/SignInForm";
import { messages } from "@/lib/messages";

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: safeRedirectPath(search.redirect),
  }),
  beforeLoad: async ({ search }) => {
    if (await readAccountSession()) throw redirect({ href: search.redirect ?? "/" });
  },
  component: SignInPage,
});

function SignInPage() {
  const { redirect: redirectPath } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <CenteredPage>
      <div className="flex flex-col gap-2">
        <PageHeading>{messages.auth.signInTitle}</PageHeading>
        <p className="text-muted-foreground">{messages.auth.signInIntro}</p>
      </div>
      <SignInForm onSignedIn={() => void navigate({ href: redirectPath ?? "/" })} />
      <p className="text-center text-sm text-muted-foreground">{messages.auth.or}</p>
      <GoogleSignInButton redirectPath={redirectPath ?? "/"} />
      <p className="text-center">
        {messages.auth.noAccount}{" "}
        <Link to="/sign-up" search={{ redirect: redirectPath }} className="font-medium text-primary underline-offset-4 hover:underline">
          {messages.auth.createAccountLink}
        </Link>
      </p>
    </CenteredPage>
  );
}
