import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, PlaceholderCard } from "@/components/AppLayout";

export const Route = createFileRoute("/financeiro")({
  component: () => (
    <AppLayout title="Financeiro">
      <PlaceholderCard>Em construção — visão financeira virá em breve.</PlaceholderCard>
    </AppLayout>
  ),
});
