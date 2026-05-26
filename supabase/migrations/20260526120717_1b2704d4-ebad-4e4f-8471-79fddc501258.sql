CREATE TABLE IF NOT EXISTS public.clicksign_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_name varchar,
  document_key varchar,
  status varchar,
  payload jsonb NOT NULL,
  processed boolean DEFAULT false NOT NULL,
  processing_error text,
  received_at timestamptz DEFAULT now() NOT NULL,
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_clicksign_events_tenant_received
  ON public.clicksign_webhook_events(tenant_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_clicksign_events_document_key
  ON public.clicksign_webhook_events(document_key);

ALTER TABLE public.clicksign_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clicksign_events_select ON public.clicksign_webhook_events;
CREATE POLICY clicksign_events_select ON public.clicksign_webhook_events
  FOR SELECT TO authenticated
  USING (tenant_id = private.current_tenant_id());

-- Idempotency: ensure unique document_key per tenant for upsert
CREATE UNIQUE INDEX IF NOT EXISTS uq_contracts_tenant_doc_key
  ON public.contracts(tenant_id, clicksign_document_key)
  WHERE clicksign_document_key IS NOT NULL;