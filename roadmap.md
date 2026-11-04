# Roadmap — Formulário v2 "orcamento_automatico"

- [x] PASSO 0: backup CSV (clients, opportunities, forms) + PDF em public/
- [ ] Migration: forms.flow_version + config de envio; clients.phone_normalized + backfill; opportunities.email + consentimento; índice desired_date; tabela quote_sends; tabela opportunity_stage_history; celebrant_name/age nullable; criar form bs-orcamento-teste
- [ ] Edge function lead-intake-v2 (só orcamento_automatico, honeypot, rate limit por IP/telefone no banco, e-mail, sem alterar lead-intake)
- [ ] Edge function quote-dispatch (e-mail Resend + WhatsApp desligado, sem bloquear lead, dedupe 24h)
- [ ] f.$slug.tsx: fluxo orcamento_automatico (sem aniversariante/idade, etapa contato com e-mail, consentimento, checkbox marketing, honeypot, mensagens finais)
- [ ] /formularios: mostrar versão, trocar com confirmação
- [ ] Marketing: excluir bs-orcamento-teste
- [ ] Oportunidades: card com data da festa, e-mail, status de envios, botão Reenviar, filtro de falhas, nome do responsável como fallback
- [ ] Deploy edge functions + verificar build
- [ ] Relatório final (backups, secrets, banco, o que vale na hora vs publicar, como testar)
