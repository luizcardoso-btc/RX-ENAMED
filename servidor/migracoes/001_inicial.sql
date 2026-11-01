-- Contas, sessões, pedidos, matrículas (acesso), avisos do Mercado Pago e auditoria das ações do admin.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE usuarios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,
  email       text NOT NULL,
  senha_hash  text NOT NULL,
  papel       text NOT NULL DEFAULT 'aluno' CHECK (papel IN ('aluno', 'admin')),
  cpf         text,
  telefone    text,
  pais        text NOT NULL DEFAULT 'BR',
  criado_em   timestamptz NOT NULL DEFAULT now(),
  ultimo_acesso timestamptz
);
CREATE UNIQUE INDEX usuarios_email ON usuarios (lower(email));

CREATE TABLE sessoes (
  token_hash  text PRIMARY KEY,
  usuario_id  uuid NOT NULL REFERENCES usuarios ON DELETE CASCADE,
  criada_em   timestamptz NOT NULL DEFAULT now(),
  expira_em   timestamptz NOT NULL
);
CREATE INDEX sessoes_usuario ON sessoes (usuario_id);

-- Um pedido é uma tentativa de compra. O preço fica gravado no pedido (mudanças de preço não afetam o histórico).
CREATE TABLE pedidos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      uuid NOT NULL REFERENCES usuarios,
  plano_id        text NOT NULL,
  valor_centavos  integer NOT NULL CHECK (valor_centavos > 0),
  metodo          text NOT NULL CHECK (metodo IN ('pix', 'cartao', 'boleto')),
  parcelas        integer NOT NULL DEFAULT 1,
  status          text NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente', 'aprovado', 'recusado', 'cancelado', 'reembolsado', 'expirado', 'contestado')),
  status_detalhe  text,
  mp_pagamento_id text UNIQUE,
  pagamento       jsonb NOT NULL DEFAULT '{}'::jsonb, -- QR do PIX, link do boleto, bandeira e final do cartão
  criado_em       timestamptz NOT NULL DEFAULT now(),
  pago_em         timestamptz,
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pedidos_usuario ON pedidos (usuario_id);
CREATE INDEX pedidos_status_data ON pedidos (status, criado_em);

-- Uma matrícula é um período de acesso. Vem de um pedido aprovado ou de uma liberação manual do admin.
CREATE TABLE matriculas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  uuid NOT NULL REFERENCES usuarios,
  plano_id    text NOT NULL,
  inicio      timestamptz NOT NULL DEFAULT now(),
  fim         timestamptz NOT NULL,
  status      text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'cancelada')),
  pedido_id   uuid UNIQUE REFERENCES pedidos,
  origem      text NOT NULL CHECK (origem IN ('pagamento', 'manual')),
  observacao  text,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX matriculas_usuario ON matriculas (usuario_id, fim);

-- Todo aviso recebido do Mercado Pago fica registrado, processado ou não, para auditoria e reprocessamento.
CREATE TABLE avisos_pagamento (
  id           bigserial PRIMARY KEY,
  recebido_em  timestamptz NOT NULL DEFAULT now(),
  tipo         text,
  recurso_id   text,
  assinatura_ok boolean NOT NULL,
  corpo        jsonb NOT NULL,
  resultado    text
);

CREATE TABLE auditoria (
  id          bigserial PRIMARY KEY,
  em          timestamptz NOT NULL DEFAULT now(),
  admin_id    uuid REFERENCES usuarios,
  acao        text NOT NULL,
  alvo        text,
  detalhes    jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE migracoes (nome text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now());
