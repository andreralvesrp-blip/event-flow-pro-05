// Endereço base dos links pessoais de datas.
// Prévia usa o próprio endereço de prévia; fora dela, sempre o domínio de orçamento.
export const PERSONAL_LINK_DOMAIN = "https://orcamento.kidspoint.com.br";
const PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]*e25b8b15-a9da-421a-b551-371c2a0fbe15[a-z0-9.-]*\.(lovable\.app|lovableproject\.com)$/;

export function personalLinkBase(requestOrigin?: string | null): string {
  return requestOrigin && PREVIEW_ORIGIN.test(requestOrigin) ? requestOrigin : PERSONAL_LINK_DOMAIN;
}

/** Página inicial do domínio de orçamento redireciona ao site do buffet. */
export function homeRedirectFor(url: URL): string | null {
  return url.hostname === "orcamento.kidspoint.com.br" && (url.pathname === "/" || url.pathname === "")
    ? "https://buffetinfantil.kidspoint.com.br"
    : null;
}
