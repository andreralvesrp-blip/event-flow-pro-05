ALTER TABLE public.contracts
ADD COLUMN IF NOT EXISTS event_weekday_raw text,
ADD COLUMN IF NOT EXISTS contract_form_date date,
ADD COLUMN IF NOT EXISTS payment_schedule_raw text;