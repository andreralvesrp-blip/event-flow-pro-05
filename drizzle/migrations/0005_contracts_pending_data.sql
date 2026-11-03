ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS data_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signed_file_name text,
  ADD COLUMN IF NOT EXISTS signed_pdf_path text,
  ADD COLUMN IF NOT EXISTS suggested_data jsonb,
  ADD COLUMN IF NOT EXISTS suggested_at timestamptz,
  ADD COLUMN IF NOT EXISTS data_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS data_confirmed_by uuid;
CREATE INDEX IF NOT EXISTS idx_contracts_data_pending ON public.contracts(tenant_id) WHERE data_pending;