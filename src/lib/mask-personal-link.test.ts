import { describe, it, expect } from "vitest";
import { maskPersonalLink } from "./chatguru-webhook.server";
describe("maskPersonalLink", () => {
  it("guarda o endereço sem o código", () => {
    expect(maskPersonalLink("https://orcamento.kidspoint.com.br/datas/Lz3pW_tJhK9N94EK4d8F-3xMnZRr27TjkGWkWvTNMxQ")).toBe("https://orcamento.kidspoint.com.br/datas/(código)");
  });
  it("sem link fica vazio", () => { expect(maskPersonalLink(null)).toBeNull(); });
});
