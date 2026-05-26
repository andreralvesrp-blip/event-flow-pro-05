import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/contratos")({
  beforeLoad: () => {
    throw redirect({ to: "/festas" });
  },
});
