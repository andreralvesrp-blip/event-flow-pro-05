import { describe, it, expect } from "vitest";
import { personalLinkBase, homeRedirectFor } from "./personal-link-base";

describe("endereço dos links pessoais", () => {
  it("publicado usa orcamento.kidspoint.com.br, mesmo vindo de kids-point-hub", () => {
    expect(personalLinkBase("https://kids-point-hub.lovable.app")).toBe("https://orcamento.kidspoint.com.br");
    expect(personalLinkBase("https://buffetinfantil.kidspoint.com.br")).toBe("https://orcamento.kidspoint.com.br");
    expect(personalLinkBase(null)).toBe("https://orcamento.kidspoint.com.br");
  });
  it("prévia usa o endereço da prévia", () => {
    const p = "https://id-preview--e25b8b15-a9da-421a-b551-371c2a0fbe15.lovable.app";
    expect(personalLinkBase(p)).toBe(p);
  });
  it("só a página inicial do domínio de orçamento redireciona", () => {
    expect(homeRedirectFor(new URL("https://orcamento.kidspoint.com.br/"))).toBe("https://buffetinfantil.kidspoint.com.br");
    expect(homeRedirectFor(new URL("https://orcamento.kidspoint.com.br/datas/abc"))).toBeNull();
    expect(homeRedirectFor(new URL("https://kids-point-hub.lovable.app/"))).toBeNull();
  });
});
