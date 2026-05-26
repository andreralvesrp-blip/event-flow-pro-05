import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, PlaceholderCard } from "@/components/AppLayout";

export const Route = createFileRoute("/contratos")({
  component: () => (
    <AppLayout title="Contratos">
      <PlaceholderCard>
        Em construção — Fase 3 traz a listagem após sincronizar do Clicksign.
      </PlaceholderCard>
    </AppLayout>
  ),
});
