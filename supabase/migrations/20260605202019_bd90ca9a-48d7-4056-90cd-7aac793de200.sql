
CREATE TABLE public.marketing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  form_slug text,
  open_method text,
  page_location text,
  page_path text,
  referrer text,
  landing_page text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  gclid text,
  fbclid text,
  session_id text,
  user_agent text,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.marketing_events TO authenticated;
GRANT ALL ON public.marketing_events TO service_role;

ALTER TABLE public.marketing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing_events_select_tenant"
ON public.marketing_events
FOR SELECT
TO authenticated
USING (tenant_id = public.current_tenant_id());

CREATE INDEX marketing_events_tenant_created_idx
  ON public.marketing_events (tenant_id, created_at DESC);
CREATE INDEX marketing_events_unit_created_idx
  ON public.marketing_events (unit_id, created_at DESC);
CREATE INDEX marketing_events_event_idx
  ON public.marketing_events (event_name, created_at DESC);
CREATE INDEX marketing_events_session_idx
  ON public.marketing_events (session_id);
CREATE INDEX marketing_events_campaign_idx
  ON public.marketing_events (utm_source, utm_medium, utm_campaign);
