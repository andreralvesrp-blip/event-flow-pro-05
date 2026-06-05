ALTER TABLE public.marketing_events ADD COLUMN IF NOT EXISTS visitor_id text;
CREATE INDEX IF NOT EXISTS marketing_events_visitor_idx ON public.marketing_events (visitor_id);