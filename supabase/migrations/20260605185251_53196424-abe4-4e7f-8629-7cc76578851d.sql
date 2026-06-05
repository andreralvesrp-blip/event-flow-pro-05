ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS utm_term text,
  ADD COLUMN IF NOT EXISTS gclid text,
  ADD COLUMN IF NOT EXISTS fbclid text,
  ADD COLUMN IF NOT EXISTS landing_page text,
  ADD COLUMN IF NOT EXISTS referrer text;

CREATE INDEX IF NOT EXISTS idx_opportunities_created_at ON public.opportunities (created_at);
CREATE INDEX IF NOT EXISTS idx_opportunities_utm ON public.opportunities (utm_source, utm_medium, utm_campaign);
CREATE INDEX IF NOT EXISTS idx_visits_scheduled_at ON public.visits (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_contracts_finalized_at ON public.contracts (finalized_at);