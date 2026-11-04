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
