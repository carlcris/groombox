import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { CenteredPage } from "@/components/CenteredPage";
import { PageHeading } from "@/components/PageHeading";
import { readAccountSession, safeRedirectPath } from "@/features/auth/auth-session";
import { SocialSignInButtons } from "@/features/auth/SocialSignInButtons";
import { SignUpForm } from "@/features/auth/SignUpForm";
import { messages } from "@/lib/messages";

export const Route = createFileRoute("/sign-up")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: safeRedirectPath(search.redirect),
  }),
  beforeLoad: async ({ search }) => {
    if (await readAccountSession()) throw redirect({ href: search.redirect ?? "/" });
  },
  component: SignUpPage,
});

function SignUpPage() {
  const { redirect: redirectPath } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <CenteredPage>
      <div className="flex flex-col gap-2">
        <PageHeading>{messages.auth.signUpTitle}</PageHeading>
        <p className="text-muted-foreground">{messages.auth.signUpIntro}</p>
      </div>
      <SignUpForm onSignedIn={() => void navigate({ href: redirectPath ?? "/" })} />
      <p className="text-center text-sm text-muted-foreground">{messages.auth.or}</p>
      <SocialSignInButtons providers={["google"]} redirectPath={redirectPath ?? "/"} />
      <p className="text-center">
        {messages.auth.haveAccount}{" "}
        <Link to="/sign-in" search={{ redirect: redirectPath }} className="font-medium text-primary underline-offset-4 hover:underline">
          {messages.auth.signInLink}
        </Link>
      </p>
    </CenteredPage>
  );
}
