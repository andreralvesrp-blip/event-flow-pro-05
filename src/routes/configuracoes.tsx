import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, PlaceholderCard } from "@/components/AppLayout";

export const Route = createFileRoute("/configuracoes")({
  component: () => (
    <AppLayout title="Configurações">
      <PlaceholderCard>Em construção — configurações virão em breve.</PlaceholderCard>
    </AppLayout>
  ),
});
