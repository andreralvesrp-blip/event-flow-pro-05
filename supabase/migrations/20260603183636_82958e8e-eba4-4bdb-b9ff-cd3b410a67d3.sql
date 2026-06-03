
ALTER TABLE public.nps_responses ALTER COLUMN score DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.submit_nps_response(
  _slug text,
  _score integer,
  _experience text,
  _comment text,
  _name text,
  _whatsapp text,
  _wants_google_review boolean,
  _wants_budget boolean
)
RETURNS TABLE(response_id uuid, classification nps_classification)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_unit_id UUID;
  v_tenant_id UUID;
  v_classification public.nps_classification;
  v_experience public.nps_experience;
  v_response_id UUID;
  v_client_id UUID;
BEGIN
  IF _experience NOT IN ('loved','ok','improve') THEN
    RAISE EXCEPTION 'invalid_experience';
  END IF;
  v_experience := _experience::public.nps_experience;

  v_classification := CASE v_experience
    WHEN 'loved'   THEN 'promotor'::public.nps_classification
    WHEN 'ok'      THEN 'neutro'::public.nps_classification
    WHEN 'improve' THEN 'detrator'::public.nps_classification
  END;

  IF _score IS NOT NULL AND (_score < 0 OR _score > 10) THEN
    RAISE EXCEPTION 'invalid_score';
  END IF;

  SELECT u.id, u.tenant_id INTO v_unit_id, v_tenant_id
  FROM public.units u
  WHERE u.slug = _slug AND u.is_active = true
  LIMIT 1;

  IF v_unit_id IS NULL THEN
    RAISE EXCEPTION 'unit_not_found';
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
$function$;
