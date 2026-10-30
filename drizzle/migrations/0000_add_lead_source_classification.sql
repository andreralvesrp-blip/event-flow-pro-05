ALTER TYPE public.opportunity_source ADD VALUE IF NOT EXISTS 'google_organico';
ALTER TYPE public.opportunity_source ADD VALUE IF NOT EXISTS 'google_meu_negocio';
ALTER TYPE public.opportunity_source ADD VALUE IF NOT EXISTS 'social_organico';
ALTER TYPE public.opportunity_source ADD VALUE IF NOT EXISTS 'whatsapp_link';
ALTER TYPE public.opportunity_source ADD VALUE IF NOT EXISTS 'direto';

CREATE OR REPLACE FUNCTION public.classify_lead_source(
  _gclid text,
  _fbclid text,
  _utm_source text,
  _utm_medium text,
  _referrer text,
  _landing_page text,
  _gbraid text DEFAULT NULL,
  _wbraid text DEFAULT NULL
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
  -- a) Google Ads: gclid (ou gbraid/wbraid) preenchido
  IF NULLIF(trim(coalesce(_gclid, '')), '') IS NOT NULL
     OR NULLIF(trim(coalesce(_gbraid, '')), '') IS NOT NULL
     OR NULLIF(trim(coalesce(_wbraid, '')), '') IS NOT NULL THEN
    RETURN 'ga'::public.opportunity_source;
  END IF;

  -- b) Meta Ads: medium pago + source de meta
  IF v_utm_medium IN ('paid', 'cpc', 'ppc', 'paidsocial')
     AND v_utm_source IN ('ig', 'fb', 'an', 'facebook', 'instagram', 'meta') THEN
    RETURN 'meta'::public.opportunity_source;
  END IF;

  -- c) Google Meu Negócio
  IF v_utm_source IN ('gmb', 'gbp', 'google_business') THEN
    RETURN 'google_meu_negocio'::public.opportunity_source;
  END IF;

  -- d) Google orgânico
  IF v_referrer LIKE '%google.%' THEN
    RETURN 'google_organico'::public.opportunity_source;
  END IF;

  -- e) Social orgânico (inclui subdomínios l., m., lm.)
  IF v_referrer LIKE '%instagram.com%' OR v_referrer LIKE '%facebook.com%' THEN
    RETURN 'social_organico'::public.opportunity_source;
  END IF;

  -- f) Link compartilhado no WhatsApp
  IF v_referrer LIKE '%wl.co%' OR v_referrer LIKE '%wa.me%' OR v_referrer LIKE '%whatsapp%' THEN
    RETURN 'whatsapp_link'::public.opportunity_source;
  END IF;

  -- g) Direto: referrer vazio OU mesmo domínio do landing_page
  v_ref_host := regexp_replace(v_referrer, '^https?://([^/]+).*$', '\1');
  v_ref_host := regexp_replace(v_ref_host, '^www\.', '');
  v_land_host := regexp_replace(lower(trim(coalesce(_landing_page, ''))), '^https?://([^/]+).*$', '\1');
  v_land_host := regexp_replace(v_land_host, '^www\.', '');

  IF v_referrer = '' OR (v_land_host <> '' AND v_ref_host = v_land_host) THEN
    RETURN 'direto'::public.opportunity_source;
  END IF;

  -- h) qualquer outro caso
  RETURN 'outro'::public.opportunity_source;
END;
$$;

GRANT EXECUTE ON FUNCTION public.classify_lead_source(text, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classify_lead_source(text, text, text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.classify_lead_source(text, text, text, text, text, text, text, text) TO anon;