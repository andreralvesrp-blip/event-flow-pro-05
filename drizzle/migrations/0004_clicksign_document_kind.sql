ALTER TABLE public.clicksign_webhook_events
  ADD COLUMN IF NOT EXISTS document_kind text,
  ADD COLUMN IF NOT EXISTS linked_contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_clicksign_events_needs_review ON public.clicksign_webhook_events(tenant_id) WHERE needs_review;