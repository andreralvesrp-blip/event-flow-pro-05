# Roadmap — Formulário v2 "orcamento_automatico"

- [x] PASSO 0: backup CSV (clients, opportunities, forms) + PDF em public/
- [x] Migration quote_auto_form_v1: forms.flow_version + config de envio; clients.phone_normalized + backfill; opportunities.email + consentimento; índice desired_date; quote_sends; opportunity_stage_history; lead_intake_rate_log; form bs-orcamento-teste
- [x] Rota /api/public/lead-intake-v2 (edge functions novas são bloqueadas neste projeto; lead-intake original intocada)
- [x] Rota /api/public/quote-dispatch + src/lib/quote-dispatch.server.ts (e-mail Resend + WhatsApp desligado, dedupe 24h)
- [x] f.$slug.tsx: fluxo orcamento_automatico (sem aniversariante/idade, e-mail obrigatório, consentimento, checkbox marketing, honeypot, mensagens finais)
- [x] /formularios: coluna Versão, troca com confirmação, campos de config de envio
- [x] Marketing: bs-orcamento-teste excluído
- [x] Oportunidades: e-mail + status de envios no card, histórico + Reenviar no detalhe, filtro "Só falhas de envio"
- [x] Build OK; testes de endpoint (config, honeypot, wrong_flow_version, lead real) + Playwright (v2 e v1)
- [x] Secret RESEND_API_KEY cadastrado pelo usuário
- [ ] Pendente do usuário: publicar (PDF público + rotas novas) e verificar domínio kidspoint.com.br no Resend

## Página pessoal de datas — sem publicação
- [x] Ajustar valores e ícones; incluir pré-reservas nas sugestões e fila; medir WhatsApp antes/depois e entregar prints de celular.
- [x] Plano aprovado; cinco feriados nacionais incluídos.
- [x] Configurações de Calendário, feriados, links pessoais, cache e interações isolados.
- [x] Leitura Google Calendar preparada; instruções de conta de serviço fornecidas.
- [x] Turnos, preços, ordenação e proteção com testes controlados.
- [x] Página pessoal sem indexação e sem links nos fluxos existentes; link inexistente rejeitado.
- [x] Resumo de interações nos cards; Calendário conferido com sessão real.
- [x] Conector Google Calendar e quatro agendas conferidos; sem conta de serviço adicional.
- [x] Link de oportunidade teste verificado com dados reais; fila de 04/12/2026 jantar Bosque registrada e lida no card.
- [x] Cartões com preço/'para 40 pagantes', aviso amarelo removido; períodos sem atendimento (recesso 21/12/2026–05/01/2027) em Calendário e na página.
