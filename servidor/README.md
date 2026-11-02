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

## Colocar no ar no Railway

O repositório tem um `Dockerfile` e um `railway.json`: o Railway monta a imagem, roda as migrações do banco ao iniciar e confere `/api/saude` antes de trocar a versão no ar.

Variáveis do serviço (aba **Variables**):

| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{rx-enamed-banco.DATABASE_URL}}` (referência ao banco do projeto, pela rede interna) |
| `URL_BASE` | `https://<seu-servico>.up.railway.app` no começo, depois o seu domínio |
| `ADMIN_EMAILS` | `luizcardoso476@gmail.com` |
| `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY` | credenciais de **produção** do Mercado Pago |
| `MP_WEBHOOK_SECRET` | assinatura secreta do webhook (Mercado Pago > Webhooks) |
| `MP_DESCRICAO_FATURA` | `RXENAMED` |
| `RESEND_API_KEY`, `EMAIL_REMETENTE`, `EMAIL_RESPONDER_PARA` | e-mails automáticos (opcional no começo) |
| `ANTHROPIC_API_KEY` | opcional: liga a conversa por IA nas estações da Prática e as correções por IA. O simulador clínico funciona sem ela |
| `IA_LIMITE_DIA_PAGO`, `IA_LIMITE_DIA_GRATIS`, `IA_MODELO` | interações com a IA por dia (padrão 300 e 15) e modelo (padrão `claude-opus-5-5`) |
| `LEGAL_EMPRESA`, `LEGAL_DOCUMENTO`, `LEGAL_EMAIL` | nome, CNPJ (ou CPF) e e-mail mostrados nos Termos e na Política de Privacidade |

Sem as chaves do Mercado Pago o site sobe normalmente e o checkout mostra "pagamentos em breve".

## Segurança

- **Transporte:** HTTPS obrigatório. Redirecionamento automático e HSTS de 2 anos com `preload`.
- **Cabeçalhos:**
  - política de conteúdo (CSP) sem scripts soltos: só rodam scripts com assinatura sha256 calculada no início e os domínios do Mercado Pago;
  - `object-src 'none'`;
  - proteção contra embutir o site em outra página (`frame-ancestors 'none'` e `X-Frame-Options: DENY`);
  - `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP e CORP.
- **Senhas:**
  - guardadas com scrypt (N=32768), com os parâmetros no próprio hash, refeitas sozinhas quando o custo sobe;
  - mínimo de 10 caracteres com letras e número ou símbolo, recusando senhas comuns e senhas que contêm o e-mail.
- **Login:**
  - mesma resposta e mesmo tempo para e-mail inexistente ou senha errada;
  - conta bloqueada após 8 erros, por 15 minutos, dobrando até 24 horas;
  - limite por IP guardado no banco.
- **Sessões:**
  - cookie `__Host-` com `HttpOnly`, `Secure` e `SameSite=Lax`;
  - token aleatório de 256 bits guardado só como hash, válido por 30 dias;
  - "sair de todos os aparelhos";
  - todas as sessões caem quando a senha é redefinida ou quando a verificação em duas etapas é ativada.
- **Admin:**
  - verificação em duas etapas (TOTP) obrigatória em produção, com 10 códigos de recuperação de uso único;
  - auditoria de todas as ações.
- **CSRF:** requisições que alteram dados precisam vir do próprio site (Origin ou Referer) e em JSON.
- **Abuso:**
  - limites por IP em cadastro, login, recuperação de senha, cupom e pagamento, mais um limite geral da API;
  - corpo das requisições limitado a 100 KB;
  - tempo máximo de 15 segundos por consulta ao banco.
- **Pagamentos:**
  - preço sempre calculado no servidor;
  - webhook com assinatura HMAC, janela de tempo e confirmação do pagamento direto na API do Mercado Pago;
  - valor conferido;
  - processamento idempotente;
  - dados do cartão nunca passam pelo servidor.
- **LGPD:**
  - aceite dos Termos e da Política de Privacidade no cadastro, com data;
  - exportação dos dados e exclusão da conta pelo próprio aluno, com anonimização: pagamentos ficam guardados sem identificação, por obrigação fiscal.
- **Infraestrutura:**
  - imagem Docker com só o necessário, rodando como usuário sem privilégios;
  - sem segredos no código;
  - dependências sem vulnerabilidades conhecidas (`npm audit`).

Antes de abrir as vendas:
1. Ative os backups do Postgres no Railway (aba do banco > **Backups**).
2. Cadastre o domínio próprio.
3. Faça uma compra real de valor baixo e reembolse pelo painel.

## Colocar no ar no Render (alternativa)

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
