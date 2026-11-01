# Servidor do RX ENAMED

Contas de alunos, checkout próprio com o Mercado Pago, liberação automática do acesso e painel administrativo.

## Como funciona

- **Checkout próprio** (`/checkout?plano=ciclo`). A tela é do RX; o Mercado Pago só processa:
  - **PIX:** QR code e copia-e-cola na nossa tela, com liberação automática.
  - **Cartão em até 12×:** formulário seguro do Mercado Pago (Card Payment Brick) com o visual do RX. Os dados do cartão vão criptografados direto para o Mercado Pago e nunca passam pelo nosso servidor.
  - **Boleto:** link e linha digitável.
- **O preço vem sempre do servidor** (`conteudo/planos.json`). O navegador só diz qual plano quer.
- **Liberação:** quando o Mercado Pago confirma, o aviso (webhook) chega em `/api/webhooks/mercadopago`.
  - O servidor confere a assinatura secreta, consulta o pagamento na API do Mercado Pago, confere o valor e cria a matrícula (período de acesso).
  - Avisos repetidos não duplicam nada.
  - Renovar antes de vencer soma os dias.
  - Reembolso ou contestação encerram o acesso.
- **Sem cobrança automática.** Cada pagamento libera o período do plano (`duracaoMeses` em `planos.json`).
- **Painel admin** (`/admin`):
  - receita do dia, do mês e do período, ticket médio, conversão e reembolsos;
  - alunos ativos, vencendo, inativos e só no gratuito;
  - receita por dia, vendas por plano e aprovação por forma de pagamento;
  - busca de alunos e exportação para planilha;
  - liberação manual de acesso (bolsa, cortesia), revogação e reembolso pelo próprio painel;
  - auditoria de todas as ações do admin.
- **Área do aluno:** em `/minha-conta`, o aluno vê o plano e os pagamentos. A plataforma (`/plataforma/`) consulta `/api/eu` e libera tudo para quem tem plano ativo. Quem não tem fica com os limites do gratuito.

## Colocar no ar (Render, cerca de 30 minutos)

1. **Código no GitHub:** o projeto precisa estar num repositório do GitHub. O Render publica a partir dele.
2. **Mercado Pago:**
   - Em [Suas integrações](https://www.mercadopago.com.br/developers/panel/app), crie uma aplicação do tipo "Checkout Transparente".
   - Em **Credenciais de produção**, copie a Public Key e o Access Token. Não mande esses dados por chat: eles vão direto no painel do Render.
   - Em "Parcelamento", defina quantas parcelas você absorve sem juros (o site anuncia até 6× no ciclo e na 2ª etapa e até 12× no anual).
   - Confirme que a conta tem uma chave PIX cadastrada.
3. **Render:**
   - Crie a conta em render.com e escolha **New > Blueprint**. Selecione o repositório: o arquivo `render.yaml` cria o servidor e o banco Postgres sozinho. O plano pago mais barato custa cerca de US$ 7/mês para o servidor e mais US$ 7/mês para o banco.
   - Preencha as variáveis pedidas:
     - `URL_BASE`: no começo, o endereço `https://rx-enamed.onrender.com`; depois, o seu domínio.
     - `MP_ACCESS_TOKEN` e `MP_PUBLIC_KEY`.
     - `RESEND_API_KEY` é opcional.
4. **Webhook:**
   - No Mercado Pago, vá em **Webhooks** e cadastre `URL_BASE/api/webhooks/mercadopago` com o evento **Pagamentos**.
   - Copie a assinatura secreta para `MP_WEBHOOK_SECRET` no Render e salve: o serviço reinicia sozinho.
5. **Admin:** entre no site, crie a conta com `luizcardoso476@gmail.com` (já configurado como admin) e abra `/admin`. O painel começa vazio.
6. **Teste real antes de abrir:**
   - Compre o plano mensal com PIX e confira que o acesso liberou e a venda apareceu no painel.
   - Reembolse pelo painel.
   - Para começar com o painel limpo, abra o Shell do serviço no Render e rode `cd servidor && npm run zerar -- --confirmar`. O comando apaga alunos, pedidos e vendas de teste e mantém as contas de admin.
7. **Domínio (opcional, recomendado para o Google):**
   - No Render, em **Settings > Custom Domains**, adicione `www.rxenamed.com.br` e crie no Registro.br o registro CNAME que ele indicar.
   - Troque `URL_BASE` pelo domínio e atualize a URL do webhook no Mercado Pago.

## Desenvolvimento

```
DATABASE_URL=postgres://... MP_ACCESS_TOKEN=TEST-... MP_PUBLIC_KEY=TEST-... MP_WEBHOOK_SECRET=... npm run iniciar
npm run teste      # precisa de um Postgres de testes em TEST_DATABASE_URL; usa um Mercado Pago simulado
```

## E-mails, cupons, afiliados e progresso

- **E-mails automáticos:** boas-vindas, PIX gerado (com o código), boleto gerado, pagamento aprovado, acesso vencendo (7 dias e 1 dia antes), acesso encerrado e recuperação de senha.
  - O envio é pelo Resend: crie a conta, verifique o domínio e preencha `RESEND_API_KEY`.
  - Todo envio aparece na ficha do aluno no painel. Nenhum aviso é mandado duas vezes.
- **Cupons:** percentual ou valor fixo, com limite de usos, validade, planos permitidos e afiliado vinculado.
  - O desconto é calculado no servidor, e o pedido nunca fica abaixo de R$ 5.
  - O uso só conta quando o pagamento é aprovado.
  - Link pronto: `/checkout?plano=ciclo&cupom=CODIGO`.
- **Afiliados:** link de indicação `/checkout?plano=ciclo&ref=CODIGO`, que vale por 30 dias no navegador de quem clicou, ou cupom vinculado ao afiliado.
  - A comissão é por percentual.
  - Ela só libera para pagamento depois dos 7 dias de garantia.
  - "Marcar como pago" fica registrado na auditoria.
- **Progresso na conta:** a área do aluno junta o progresso do navegador com o da conta ao entrar e salva a cada mudança. Dá para estudar no celular e no computador.

## Próximas etapas

- Renovação automática no cartão, pelas assinaturas do Mercado Pago.
- Área do afiliado, onde ele acompanha as próprias vendas.
