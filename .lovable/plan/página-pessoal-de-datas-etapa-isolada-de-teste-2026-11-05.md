# Página pessoal de datas — etapa isolada de teste

## Proteções
- Não alterar `lead-intake`, `lead-intake-v2`, `quote-dispatch`, formulários, widget, conteúdo dos e-mails ou envio de mensagens.
- Não publicar. Não criar item no menu lateral nem colocar links da página da cliente em cards, formulários ou e-mails.
- Acrescentar estruturas próprias no banco, sem apagar/renomear dados ou estruturas e sem triggers nas tabelas existentes. Essas adições entram no banco compartilhado imediatamente, mas não mudam os fluxos atuais.
- Criar links pessoais somente para oportunidades de `bs-orcamento-teste`, por ação interna autorizada, sem alterar a oportunidade. Entregar um link de teste no chat. Preparar o modo sem preço de `bs-kids-day`, mas não liberar links desse formulário nesta etapa.
- Se surgir conflito com essas proteções, interromper e informar antes de continuar.

## 1. Calendário nas Configurações
Criar a seção **Calendário**, acessível por Configurações, sem novo item lateral:
- Quatro campos: festas fechadas Bosque, pré-reservas Bosque, festas fechadas Vila Mariana e pré-reservas Vila Mariana.
- Lista de feriados com inclusão, edição e exclusão de datas, somente nessa nova lista.
- Configuração restrita ao responsável da empresa, conferida no servidor.
- Leitura do Google exclusivamente com a conta de serviço indicada e permissão de leitura. Não usar a conexão do Google Analytics nem autorizar gravações no Calendar.
- Consultar todas as páginas de eventos, expandir recorrências e ignorar eventos cancelados; calcular horários em São Paulo. Cache persistido por agenda de no máximo 60 segundos; falha ou resultado vencido nunca deve ser apresentado como disponibilidade confirmada.

### Feriados iniciais para conferir
Intervalo de 05/11/2026 até 05/09/2027:

| Data | Feriado nacional |
|---|---|
| 20/11/2026 | Dia Nacional de Zumbi e da Consciência Negra |
| 25/12/2026 | Natal |
| 01/01/2027 | Confraternização Universal |
| 21/04/2027 | Tiradentes |
| 01/05/2027 | Dia do Trabalho |

Não incluir automaticamente Carnaval, Quarta-feira de Cinzas, Sexta-feira Santa ou Corpus Christi como feriados nacionais. A lista será editável para acrescentar datas locais ou comerciais. 07/09/2027 fica fora dos dez meses desta etapa.

## 2. Turnos, preços e sugestões
- Implementar exatamente os limites de 15h, 17h e 17h30 e o máximo de duas festas fechadas por dia. Pré-reserva aplica a mesma ocupação com status **interesse**; festa fechada prevalece sobre interesse.
- Eventos de dia inteiro serão tratados conservadoramente como abrangendo os dois turnos, com fim exclusivo conforme o Google. Eventos sem informação suficiente não produzem indicação de disponibilidade.
- Cliente vê apenas **almoço** e **jantar**, com status disponível, interesse ou ocupado.
- Mostrar **A partir de R$ 11.030 / R$ 7.830 / R$ 6.830**, para 40 pagantes, nas faixas especificadas; feriado de fim de semana mantém sua faixa. Modo Kids Day sem valores.
- Data pedida aparece com seus dois turnos; sugestões disponíveis aparecem em grupos de até três, seguindo a ordem do pedido e sem repetir opções.
- Para pedidos nobre/intermediário: mesma data/casa, outra casa, outro dia do mesmo fim de semana, fins de semana anterior/seguinte até dois para cada lado em faixa nobre, depois sexta e domingo jantar próximos. Não sugerir segunda a quinta.
- Para pedidos segunda a quinta: mesma data e dias próximos de segunda a quinta. Sem selo **Mais em conta**. Nos demais pedidos, selo somente se a opção tiver faixa inferior à pedida.
- Interesse aparece apenas na data solicitada, nunca como sugestão. Não mostrar hoje nem passado. Além de dez meses, mostrar a mensagem de calendário ainda não aberto.

## 3. Página pessoal da cliente
- Página pública separada, sem tela de entrada no sistema e sem indexação, exibindo somente o primeiro nome da cliente.
- Link imprevisível por oportunidade; sem telefone, e-mail, identificação interna ou detalhes dos eventos das agendas na resposta pública.
- Mostrar casa, endereço, turno, valor quando aplicável e selo. A outra casa recebe destaque visual forte.
- **Prefiro outra data na {casa de origem}** e **Ver outra casa** recalculam as opções sem recarregar a página inteira.
- **Quero esta data**, **Entrar na fila desta data** e **Falar com a equipe** abrem o WhatsApp da casa escolhida com nome, data, turno e casa na mensagem.
- Reconsultar disponibilidade antes de registrar a escolha; mudança ou falha da agenda não pode ser tratada como reserva.
- Mostrar as mensagens de interesse, falha de agenda e o aviso fixo solicitado. Fila não é reserva nem pré-reserva.
- Bosque: Rua Tiquatira, 394; WhatsApp 5511914454455. Vila Mariana: Rua Padre Machado, 1161; WhatsApp 5511937123020.

## 4. Registro e resumo no Kanban
- Registrar abriu, viu opção, escolheu data, entrou na fila, mudou de casa e falou com a equipe, com data/hora, casa, data da festa e turno quando aplicáveis.
- Mostrar resumo nos cards das oportunidades, reunindo todas as escolhas. Leads sem interações permanecem visualmente como estão.
- Guardar casa escolhida nos registros próprios, sem mudar origem, etapa, unidade ou data da oportunidade e sem criar reserva, festa, mensagem automática ou FUP.

## Detalhes técnicos
- Novas estruturas isoladas para configurações/feriados, links pessoais, interações e cache de agenda. Aplicar permissões explícitas e acesso por empresa; sem acesso anônimo direto às tabelas.
- Página em `/datas/$token`; endpoints novos separados. Validar o token no servidor antes de ler ou registrar interações, com respostas mínimas e sem cache público de dados pessoais. Token gerado criptograficamente no servidor; guardar hash para validação e evitar expor o segredo em relatórios ou logs.
- Configuração e geração de link exigem sessão validada e acesso à oportunidade da mesma empresa. A restrição a `bs-orcamento-teste` também será verificada no servidor.
- Autenticação Google com `GOOGLE_SERVICE_ACCOUNT_JSON` somente no servidor e escopo `calendar.readonly`; nenhuma operação de escrita no Google.
- Testes pequenos para cada regra de turno, limites, faixa/preço, feriado, sugestão, janela de dez meses e liberação de links. Conferir página em computador/celular, resumo, isolamento dos formulários e rejeição de token inválido.

## Conta de serviço: passo a passo após implementação
1. Entrar no Google Cloud, criar um projeto e ativar **Google Calendar API**.
2. Em **Contas de serviço**, criar uma conta. Criar uma chave do tipo JSON e baixar o arquivo; não colar seu conteúdo no chat.
3. Guardar o conteúdo no formulário seguro de segredo **GOOGLE_SERVICE_ACCOUNT_JSON**, que será solicitado separadamente. Lovable Cloud mantém essa chave privada.
4. Copiar o e-mail da conta de serviço, terminado em `iam.gserviceaccount.com`.
5. Em cada uma das quatro agendas do Google Calendar, abrir **Configurações e compartilhamento**, compartilhar com esse e-mail e escolher **Ver todos os detalhes dos eventos**, nunca permissão de edição.
6. Em **Integrar agenda**, copiar o **ID da agenda** e colar no campo correspondente em Configurações → Calendário.
7. Conferir a leitura das quatro agendas e abrir o link pessoal de uma oportunidade de teste.

## Entrega e o que depende de publicar
- Informar as estruturas acrescentadas, lista de feriados, instruções e link de teste, sem publicar.
- Banco: adições e feriados passam a existir imediatamente; nenhum fluxo publicado as utilizará nesta etapa.
- Página, controles, leitura das agendas e resumo dos cards: disponíveis no preview; chegam ao site publicado somente após publicação posterior autorizada.
- A leitura real das agendas depende da chave e dos quatro IDs. Sem eles, verificar regras e segurança com testes controlados e mostrar a mensagem de confirmação com a equipe, sem fingir disponibilidade real.