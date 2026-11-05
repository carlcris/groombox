import { createFileRoute } from "@tanstack/react-router";
import { SetupPageLayout } from "@/components/SetupPageLayout";
import { SetupSection } from "@/components/SetupSection";
import { CategoryManager } from "@/features/catalogue/CategoryManager";
import { ServiceList } from "@/features/catalogue/ServiceList";
import { messages } from "@/lib/messages";

export const Route = createFileRoute("/shop/setup/services")({
  component: ServicesPage,
});

function ServicesPage() {
  const { currentMembership } = Route.useRouteContext();
  return (
    <SetupPageLayout title={messages.catalogue.title}>
      <SetupSection id="categories-section" title={messages.catalogue.categories}>
        <CategoryManager organizationId={currentMembership.organizationId} />
      </SetupSection>
      <ServiceList organizationId={currentMembership.organizationId} />
    </SetupPageLayout>
  );
}
