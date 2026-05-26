CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('vendedor', 'gestor', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE client_status AS ENUM ('lead', 'cliente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE contract_status AS ENUM ('rascunho', 'aguardando_assinaturas', 'assinado', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  slug varchar(60) UNIQUE NOT NULL,
  cnpj varchar(18),
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  email varchar UNIQUE NOT NULL,
  full_name varchar NOT NULL,
  role user_role DEFAULT 'vendedor' NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON public.users(tenant_id);

CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key varchar(60) NOT NULL,
  value text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (tenant_id, key)
);
CREATE INDEX IF NOT EXISTS idx_settings_tenant_key ON public.system_settings(tenant_id, key);

CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cpf varchar(11) NOT NULL,
  full_name varchar NOT NULL,
  email varchar,
  phone varchar(11),
  address_full text,
  mother_name varchar,
  father_name varchar,
  how_met varchar,
  status client_status DEFAULT 'lead' NOT NULL,
  first_contact_at timestamptz DEFAULT now() NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (tenant_id, cpf)
);
CREATE INDEX IF NOT EXISTS idx_clients_tenant_cpf ON public.clients(tenant_id, cpf);
CREATE INDEX IF NOT EXISTS idx_clients_tenant_status ON public.clients(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_clients_tenant_created ON public.clients(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  clicksign_document_key varchar(120) UNIQUE,
  clicksign_template_name varchar(120),
  clicksign_signed_pdf_url text,
  status contract_status DEFAULT 'assinado' NOT NULL,
  event_date date,
  event_start_time time,
  event_end_time time,
  guest_count int,
  celebrant_name varchar,
  celebrant_age int,
  decoration text,
  cake text,
  tasting_menu text,
  hot_dish text,
  observations text,
  children_pay_from_age int,
  total_value decimal(10,2),
  installment_count int,
  payment_method varchar,
  client_signed_at timestamptz,
  manager_signed_at timestamptz,
  finalized_at timestamptz,
  webhook_received_at timestamptz DEFAULT now() NOT NULL,
  raw_webhook_payload jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant_status ON public.contracts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_contracts_tenant_finalized ON public.contracts(tenant_id, finalized_at DESC);
CREATE INDEX IF NOT EXISTS idx_contracts_client ON public.contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_event_date ON public.contracts(tenant_id, event_date);

CREATE TABLE IF NOT EXISTS public.contract_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  order_index int NOT NULL,
  due_date date NOT NULL,
  amount decimal(10,2) NOT NULL,
  payment_method varchar NOT NULL,
  paid boolean DEFAULT false NOT NULL,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_installments_contract ON public.contract_installments(contract_id);
CREATE INDEX IF NOT EXISTS idx_installments_tenant_due ON public.contract_installments(tenant_id, due_date);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;
CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_settings_updated_at ON public.system_settings;
CREATE TRIGGER trg_settings_updated_at BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_clients_updated_at ON public.clients;
CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_contracts_updated_at ON public.contracts;
CREATE TRIGGER trg_contracts_updated_at BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.promote_lead_to_cliente()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'assinado'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'assinado')
  THEN
    UPDATE public.clients SET status = 'cliente'
    WHERE id = NEW.client_id AND status = 'lead';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_promote_client ON public.contracts;
CREATE TRIGGER trg_contract_promote_client
  AFTER INSERT OR UPDATE OF status ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.promote_lead_to_cliente();

ALTER TABLE public.tenants                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_installments  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid();
$$;

DROP POLICY IF EXISTS tenants_select ON public.tenants;
CREATE POLICY tenants_select ON public.tenants
  FOR SELECT TO authenticated
  USING (id = public.current_tenant_id());

DROP POLICY IF EXISTS users_select ON public.users;
CREATE POLICY users_select ON public.users
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS users_admin_write ON public.users;
CREATE POLICY users_admin_write ON public.users
  FOR ALL TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  )
  WITH CHECK (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS settings_all ON public.system_settings;
CREATE POLICY settings_all ON public.system_settings
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS clients_all ON public.clients;
CREATE POLICY clients_all ON public.clients
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS contracts_all ON public.contracts;
CREATE POLICY contracts_all ON public.contracts
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS installments_all ON public.contract_installments;
CREATE POLICY installments_all ON public.contract_installments
  FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

INSERT INTO public.tenants (name, slug, cnpj)
VALUES ('Kids Point', 'kids-point', '50.074.085/0001-20')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.system_settings (tenant_id, key, value, description)
SELECT t.id, k.key, k.value, k.description
FROM public.tenants t
CROSS JOIN (VALUES
  ('nome_buffet', 'Kids Point', 'Nome do buffet exibido nas telas'),
  ('razao_social', 'KIDS POINT SAÚDE EVENTOS E SERVIÇOS DE BUFFET LTDA', 'Razão social'),
  ('cnpj', '50.074.085/0001-20', 'CNPJ'),
  ('endereco_buffet', 'Rua Tiquatira, 394, Bosque da Saúde, São Paulo - SP, CEP 04137-110', 'Endereço'),
  ('email_gestor', 'gestor@kidspoint.com.br', 'E-mail do gestor (editar)'),
  ('telefone_buffet', '(11) 0000-0000', 'Telefone (editar)'),
  ('clicksign_webhook_secret', '', 'HMAC secret pro webhook (preencher na Fase 2)')
) AS k(key, value, description)
WHERE t.slug = 'kids-point'
ON CONFLICT (tenant_id, key) DO NOTHING;