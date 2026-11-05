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
- [ ] Aprovar plano e esclarecer feriados/limite de liberação dos links.
- [ ] Acrescentar configurações de Calendário, feriados, links pessoais e interações isolados.
- [ ] Preparar Google Calendar somente leitura e orientar conta de serviço.
- [ ] Implementar cálculo dos turnos, preços e ordenação com testes.
- [ ] Criar página pública pessoal sem indexação nem links nos fluxos existentes.
- [ ] Resumir interações nos cards e verificar página/isolamento.
- [ ] Pendente do usuário: fornecer conta de serviço e IDs das quatro agendas para conferência real.
