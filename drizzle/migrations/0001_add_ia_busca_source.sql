ALTER TYPE public.opportunity_source ADD VALUE IF NOT EXISTS 'ia_busca';

CREATE OR REPLACE FUNCTION public.classify_lead_source(
  _gclid text, _fbclid text, _utm_source text, _utm_medium text, _referrer text, _landing_page text,
  _gbraid text DEFAULT NULL, _wbraid text DEFAULT NULL
)
RETURNS public.opportunity_source
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_utm_source text := lower(trim(coalesce(_utm_source, '')));
  v_utm_medium text := lower(trim(coalesce(_utm_medium, '')));
  v_referrer   text := lower(trim(coalesce(_referrer, '')));
  v_ref_host   text;
  v_land_host  text;
BEGIN
  IF NULLIF(trim(coalesce(_gclid, '')), '') IS NOT NULL
     OR NULLIF(trim(coalesce(_gbraid, '')), '') IS NOT NULL
     OR NULLIF(trim(coalesce(_wbraid, '')), '') IS NOT NULL THEN
    RETURN 'ga'::public.opportunity_source;
  END IF;

  IF v_utm_medium IN ('paid', 'cpc', 'ppc', 'paidsocial')
     AND v_utm_source IN ('ig', 'fb', 'an', 'facebook', 'instagram', 'meta') THEN
    RETURN 'meta'::public.opportunity_source;
  END IF;

  IF v_utm_source IN ('gmb', 'gbp', 'google_business') THEN
    RETURN 'google_meu_negocio'::public.opportunity_source;
  END IF;

  IF v_referrer LIKE '%google.%' THEN
    RETURN 'google_organico'::public.opportunity_source;
  END IF;

  IF v_referrer LIKE '%instagram.com%' OR v_referrer LIKE '%facebook.com%' THEN
    RETURN 'social_organico'::public.opportunity_source;
  END IF;

  IF v_referrer LIKE '%wl.co%' OR v_referrer LIKE '%wa.me%' OR v_referrer LIKE '%whatsapp%' THEN
    RETURN 'whatsapp_link'::public.opportunity_source;
  END IF;

  -- Busca por IA (antes de "direto")
  IF v_utm_source ~ '(chatgpt|openai|perplexity|gemini|copilot|claude\.ai)'
     OR v_referrer ~ '(chatgpt|openai|perplexity|gemini|copilot|claude\.ai)' THEN
    RETURN 'ia_busca'::public.opportunity_source;
  END IF;

  v_ref_host := regexp_replace(v_referrer, '^https?://([^/]+).*$', '\1');
  v_ref_host := regexp_replace(v_ref_host, '^www\.', '');
  v_land_host := regexp_replace(lower(trim(coalesce(_landing_page, ''))), '^https?://([^/]+).*$', '\1');
  v_land_host := regexp_replace(v_land_host, '^www\.', '');

  IF v_referrer = '' OR (v_land_host <> '' AND v_ref_host = v_land_host) THEN
    RETURN 'direto'::public.opportunity_source;
  END IF;

  RETURN 'outro'::public.opportunity_source;
END;
$$;