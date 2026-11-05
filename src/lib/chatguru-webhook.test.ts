import { describe, it, expect } from 'vitest';
import { buildChatguruPayload, firstAndLast, CHATGURU_FORM } from './chatguru-webhook.server';

describe('webhook ChatGuru', () => {
  it('só vale para bs-orcamento-teste', () => expect(CHATGURU_FORM).toBe('bs-orcamento-teste'));
  it('nome = primeiro nome e sobrenome', () => { expect(firstAndLast(' Ana Maria  Souza ')).toBe('Ana Souza'); expect(firstAndLast('Ana')).toBe('Ana'); });
  it('monta o JSON combinado', () => expect(buildChatguruPayload({ opportunityId: 'op1', unitSlug: 'bosque-da-saude', fullName: 'André Ricardo Alves', phone: '5511999999999', email: 'a@b.com', desiredDate: '2027-04-04', link: 'https://x/datas/t', source: 'site' })).toEqual({ evento: 'novo_orcamento', unidade: 'bosque', nome: 'André Alves', telefone: '5511999999999', email: 'a@b.com', data_festa: '04/04/2027', link_datas: 'https://x/datas/t', origem: 'site', id_oportunidade: 'op1', teste: true }));
});
