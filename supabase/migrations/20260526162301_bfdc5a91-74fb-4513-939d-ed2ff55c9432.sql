ALTER TABLE public.contracts
ADD COLUMN IF NOT EXISTS event_weekday_raw text,
ADD COLUMN IF NOT EXISTS contract_form_date date,
ADD COLUMN IF NOT EXISTS payment_schedule_raw text,
ADD COLUMN IF NOT EXISTS kids_menu text,
ADD COLUMN IF NOT EXISTS additional_services text,
ADD COLUMN IF NOT EXISTS contracted_company_email text;

ALTER TABLE public.contract_installments
ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pendente',
ADD COLUMN IF NOT EXISTS charge_customer boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS card_installments int,
ADD COLUMN IF NOT EXISTS raw_line text;