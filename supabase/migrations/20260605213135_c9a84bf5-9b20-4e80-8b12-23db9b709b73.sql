
CREATE TABLE public.integrations_ga4 (
  tenant_id UUID NOT NULL PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  property_id TEXT,
  google_email TEXT,
  scope TEXT,
  connected_by_user_id UUID,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.integrations_ga4 TO service_role;
-- Authenticated may read a non-sensitive view (status only) via RPC, not via direct table access.
-- Restrict direct access: grant only SELECT of safe columns through a view.
GRANT SELECT (tenant_id, property_id, google_email, connected_at) ON public.integrations_ga4 TO authenticated;

ALTER TABLE public.integrations_ga4 ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read row(s) of their own tenant (only the columns granted above are visible).
CREATE POLICY "ga4_select_own_tenant"
  ON public.integrations_ga4 FOR SELECT
  TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- Writes are server-only (service_role); no INSERT/UPDATE/DELETE policies for authenticated.

CREATE TRIGGER integrations_ga4_set_updated_at
  BEFORE UPDATE ON public.integrations_ga4
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
