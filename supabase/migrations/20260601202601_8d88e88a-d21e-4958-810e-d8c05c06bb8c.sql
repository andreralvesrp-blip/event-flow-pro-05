-- Enums
CREATE TYPE public.nps_classification AS ENUM ('detrator','neutro','promotor');
CREATE TYPE public.nps_experience    AS ENUM ('loved','ok','improve');
CREATE TYPE public.nps_status        AS ENUM ('novo','visto','resolvido');

-- Table
CREATE TABLE public.nps_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT private.current_tenant_id(),
  unit_id UUID NOT NULL REFERENCES public.units(id),
  event_id UUID REFERENCES public.contracts(id),
  score INT NOT NULL CHECK (score BETWEEN 0 AND 10),
  classification public.nps_classification NOT NULL,
  experience public.nps_experience,
  comment TEXT,
  name TEXT,
  whatsapp TEXT,
  wants_google_review BOOLEAN NOT NULL DEFAULT false,
  redirected_to_google BOOLEAN NOT NULL DEFAULT false,
  status public.nps_status NOT NULL DEFAULT 'novo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nps_responses TO authenticated;
GRANT ALL ON public.nps_responses TO service_role;

ALTER TABLE public.nps_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY nps_responses_all ON public.nps_responses
  FOR ALL
  TO authenticated
  USING (tenant_id = private.current_tenant_id()
         AND unit_id IN (SELECT private.accessible_unit_ids()))
  WITH CHECK (tenant_id = private.current_tenant_id()
              AND unit_id IN (SELECT private.accessible_unit_ids()));

CREATE TRIGGER nps_responses_set_updated_at
  BEFORE UPDATE ON public.nps_responses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Link opportunity -> nps_response
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS nps_response_id UUID REFERENCES public.nps_responses(id);

-- =============== PUBLIC RPCs ===============

-- get_public_unit: returns minimal public info for a unit by slug
CREATE OR REPLACE FUNCTION public.get_public_unit(_slug text)
RETURNS TABLE (
  unit_id UUID,
  name TEXT,
  logo_url TEXT,
  google_reviews_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.name, u.logo_url, u.google_reviews_url
  FROM public.units u
  WHERE u.slug = _slug AND u.is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_unit(text) TO anon, authenticated;

-- submit_nps_response
CREATE OR REPLACE FUNCTION public.submit_nps_response(
  _slug text,
  _score int,
  _experience text,
  _comment text,
  _name text,
  _whatsapp text,
  _wants_google_review boolean,
  _wants_budget boolean
)
RETURNS TABLE (response_id UUID, classification public.nps_classification)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit_id UUID;
  v_tenant_id UUID;
  v_classification public.nps_classification;
  v_experience public.nps_experience;
  v_response_id UUID;
  v_client_id UUID;
BEGIN
  IF _score IS NULL OR _score < 0 OR _score > 10 THEN
    RAISE EXCEPTION 'invalid_score';
  END IF;

  SELECT u.id, u.tenant_id INTO v_unit_id, v_tenant_id
  FROM public.units u
  WHERE u.slug = _slug AND u.is_active = true
  LIMIT 1;

  IF v_unit_id IS NULL THEN
    RAISE EXCEPTION 'unit_not_found';
  END IF;

  v_classification := CASE
    WHEN _score <= 6 THEN 'detrator'::public.nps_classification
    WHEN _score <= 8 THEN 'neutro'::public.nps_classification
    ELSE 'promotor'::public.nps_classification
  END;

  IF _experience IN ('loved','ok','improve') THEN
    v_experience := _experience::public.nps_experience;
  ELSE
    v_experience := NULL;
  END IF;

  INSERT INTO public.nps_responses (
    tenant_id, unit_id, score, classification, experience,
    comment, name, whatsapp, wants_google_review
  ) VALUES (
    v_tenant_id, v_unit_id, _score, v_classification, v_experience,
    NULLIF(trim(_comment),''), NULLIF(trim(_name),''), NULLIF(trim(_whatsapp),''),
    COALESCE(_wants_google_review, false)
  )
  RETURNING id INTO v_response_id;

  -- Optional budget opportunity
  IF COALESCE(_wants_budget, false) = true
     AND NULLIF(trim(_whatsapp),'') IS NOT NULL THEN

    SELECT c.id INTO v_client_id
    FROM public.clients c
    WHERE c.tenant_id = v_tenant_id
      AND c.phone = trim(_whatsapp)
    ORDER BY c.created_at DESC
    LIMIT 1;

    IF v_client_id IS NULL THEN
      INSERT INTO public.clients (tenant_id, unit_id, full_name, phone, source, status)
      VALUES (
        v_tenant_id, v_unit_id,
        COALESCE(NULLIF(trim(_name),''), 'Indicação NPS'),
        trim(_whatsapp),
        'veio_em_festa'::public.opportunity_source,
        'lead'::public.client_status
      )
      RETURNING id INTO v_client_id;
    END IF;

    INSERT INTO public.opportunities (
      tenant_id, unit_id, client_id, stage, source, nps_response_id
    ) VALUES (
      v_tenant_id, v_unit_id, v_client_id,
      'em_conversa'::public.opportunity_stage,
      'veio_em_festa'::public.opportunity_source,
      v_response_id
    );
  END IF;

  RETURN QUERY SELECT v_response_id, v_classification;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_nps_response(text,int,text,text,text,text,boolean,boolean) TO anon, authenticated;

-- mark_nps_google_redirect
CREATE OR REPLACE FUNCTION public.mark_nps_google_redirect(_response_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.nps_responses
  SET redirected_to_google = true
  WHERE id = _response_id;
$$;

GRANT EXECUTE ON FUNCTION public.mark_nps_google_redirect(uuid) TO anon, authenticated;
