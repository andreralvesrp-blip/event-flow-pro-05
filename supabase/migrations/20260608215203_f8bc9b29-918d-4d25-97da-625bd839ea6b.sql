
-- 1) Add columns to opportunities
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS gbraid text,
  ADD COLUMN IF NOT EXISTS wbraid text,
  ADD COLUMN IF NOT EXISTS fbp text,
  ADD COLUMN IF NOT EXISTS fbc text,
  ADD COLUMN IF NOT EXISTS form_slug text,
  ADD COLUMN IF NOT EXISTS marketing_event_id uuid,
  ADD COLUMN IF NOT EXISTS lead_event_id uuid;

CREATE INDEX IF NOT EXISTS idx_opp_lead_event_id ON public.opportunities(lead_event_id);
CREATE INDEX IF NOT EXISTS idx_opp_gclid ON public.opportunities(gclid) WHERE gclid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opp_fbclid ON public.opportunities(fbclid) WHERE fbclid IS NOT NULL;

-- 2) conversion_events table
CREATE TABLE IF NOT EXISTS public.conversion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  unit_id uuid REFERENCES public.units(id),
  event_name text NOT NULL,
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  visit_id uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  value numeric,
  currency text NOT NULL DEFAULT 'BRL',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  -- media identifiers snapshot (for offline conversions / CAPI)
  gclid text,
  gbraid text,
  wbraid text,
  fbclid text,
  fbp text,
  fbc text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  landing_page text,
  referrer text,
  form_slug text,
  lead_event_id uuid,
  -- send status
  sent_to_google_at timestamptz,
  sent_to_meta_at timestamptz,
  google_status text,
  meta_status text,
  google_error text,
  meta_error text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.conversion_events TO authenticated;
GRANT ALL ON public.conversion_events TO service_role;

ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversion_events_select_tenant
  ON public.conversion_events FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

CREATE INDEX idx_conversion_events_opp ON public.conversion_events(opportunity_id);
CREATE INDEX idx_conversion_events_tenant_event ON public.conversion_events(tenant_id, event_name, occurred_at DESC);
CREATE INDEX idx_conversion_events_pending_google ON public.conversion_events(tenant_id, occurred_at) WHERE sent_to_google_at IS NULL;
CREATE INDEX idx_conversion_events_pending_meta ON public.conversion_events(tenant_id, occurred_at) WHERE sent_to_meta_at IS NULL;

CREATE TRIGGER conversion_events_set_updated_at
  BEFORE UPDATE ON public.conversion_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Helper that snapshots opportunity media fields into a conversion event
CREATE OR REPLACE FUNCTION public.record_conversion_event(
  _event_name text,
  _opportunity_id uuid,
  _contract_id uuid DEFAULT NULL,
  _visit_id uuid DEFAULT NULL,
  _value numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.opportunities%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO o FROM public.opportunities WHERE id = _opportunity_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.conversion_events (
    tenant_id, unit_id, event_name, opportunity_id, contract_id, visit_id, value,
    gclid, gbraid, wbraid, fbclid, fbp, fbc,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    landing_page, referrer, form_slug, lead_event_id
  ) VALUES (
    o.tenant_id, o.unit_id, _event_name, o.id, _contract_id, _visit_id, _value,
    o.gclid, o.gbraid, o.wbraid, o.fbclid, o.fbp, o.fbc,
    o.utm_source, o.utm_medium, o.utm_campaign, o.utm_content, o.utm_term,
    o.landing_page, o.referrer, o.form_slug, o.lead_event_id
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 4) Triggers on visits
CREATE OR REPLACE FUNCTION public.trg_visits_conversion_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.record_conversion_event('visit_scheduled', NEW.opportunity_id, NULL, NEW.id, NULL);
    IF NEW.status = 'realizada' THEN
      PERFORM public.record_conversion_event('visit_completed', NEW.opportunity_id, NULL, NEW.id, NULL);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'realizada' AND OLD.status IS DISTINCT FROM 'realizada' THEN
      PERFORM public.record_conversion_event('visit_completed', NEW.opportunity_id, NULL, NEW.id, NULL);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS visits_conversion_events ON public.visits;
CREATE TRIGGER visits_conversion_events
  AFTER INSERT OR UPDATE ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.trg_visits_conversion_events();

-- 5) Trigger on contracts (won = assinado)
CREATE OR REPLACE FUNCTION public.trg_contracts_conversion_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'assinado'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'assinado')
     AND NEW.opportunity_id IS NOT NULL
  THEN
    PERFORM public.record_conversion_event('contract_won', NEW.opportunity_id, NEW.id, NULL, NEW.total_value);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contracts_conversion_events ON public.contracts;
CREATE TRIGGER contracts_conversion_events
  AFTER INSERT OR UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.trg_contracts_conversion_events();
