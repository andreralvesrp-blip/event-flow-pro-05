
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS manually_edited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manually_edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS manually_edited_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS canceled_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancellation_financial_action text,
  ADD COLUMN IF NOT EXISTS manual_status_override boolean NOT NULL DEFAULT false;

ALTER TABLE public.contract_installments
  ADD COLUMN IF NOT EXISTS manually_edited boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manually_edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS manually_edited_by uuid REFERENCES public.users(id) ON DELETE SET NULL;
