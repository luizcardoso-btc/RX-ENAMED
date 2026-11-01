-- E-mails transacionais, recuperação de senha, cupons, afiliados e progresso do aluno na conta.

-- Todo e-mail enviado (ou tentado) fica registrado. "chave" evita mandar o mesmo aviso duas vezes.
CREATE TABLE emails (
  id          bigserial PRIMARY KEY,
  usuario_id  uuid REFERENCES usuarios ON DELETE SET NULL,
  para        text NOT NULL,
  modelo      text NOT NULL,
  assunto     text NOT NULL,
  chave       text UNIQUE,
  status      text NOT NULL DEFAULT 'enviado' CHECK (status IN ('enviado', 'falhou', 'simulado')),
  erro        text,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX emails_usuario ON emails (usuario_id, criado_em);

CREATE TABLE redefinicoes_senha (
  token_hash  text PRIMARY KEY,
  usuario_id  uuid NOT NULL REFERENCES usuarios ON DELETE CASCADE,
  expira_em   timestamptz NOT NULL,
  usado_em    timestamptz
);

CREATE TABLE afiliados (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                 text NOT NULL,
  email                text NOT NULL,
  codigo               text NOT NULL,
  comissao_percentual  numeric(5,2) NOT NULL DEFAULT 20 CHECK (comissao_percentual BETWEEN 0 AND 90),
  chave_pix            text,
  ativo                boolean NOT NULL DEFAULT true,
  criado_em            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX afiliados_codigo ON afiliados (upper(codigo));

CREATE TABLE cupons (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo       text NOT NULL,
  tipo         text NOT NULL CHECK (tipo IN ('percentual', 'fixo')),
  valor        integer NOT NULL CHECK (valor > 0),        -- percentual: 1 a 90; fixo: centavos
  planos       text[],                                    -- vazio = todos os planos
  valido_ate   timestamptz,
  limite_usos  integer,
  usos         integer NOT NULL DEFAULT 0,
  afiliado_id  uuid REFERENCES afiliados,
  ativo        boolean NOT NULL DEFAULT true,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  CHECK (tipo <> 'percentual' OR valor <= 90)
);
CREATE UNIQUE INDEX cupons_codigo ON cupons (upper(codigo));

ALTER TABLE pedidos
  ADD COLUMN valor_original_centavos integer,
  ADD COLUMN cupom_id uuid REFERENCES cupons,
  ADD COLUMN desconto_centavos integer NOT NULL DEFAULT 0,
  ADD COLUMN afiliado_id uuid REFERENCES afiliados,
  ADD COLUMN comissao_centavos integer NOT NULL DEFAULT 0,
  ADD COLUMN comissao_paga_em timestamptz,
  ADD COLUMN cupom_contado boolean NOT NULL DEFAULT false;
CREATE INDEX pedidos_afiliado ON pedidos (afiliado_id) WHERE afiliado_id IS NOT NULL;

-- Progresso de estudo do aluno (o mesmo objeto que a plataforma guarda no navegador).
CREATE TABLE progresso (
  usuario_id     uuid PRIMARY KEY REFERENCES usuarios ON DELETE CASCADE,
  dados          jsonb NOT NULL,
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
