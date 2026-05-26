import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, PlaceholderCard } from "@/components/AppLayout";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <AppLayout title="Dashboard">
      <PlaceholderCard>Em construção — indicadores virão depois.</PlaceholderCard>
    </AppLayout>
  ),
});
