import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, PlaceholderCard } from "@/components/AppLayout";

export const Route = createFileRoute("/clientes")({
  component: () => (
    <AppLayout title="Clientes">
      <PlaceholderCard>Em construção — Fase 3 traz a listagem.</PlaceholderCard>
    </AppLayout>
  ),
});
