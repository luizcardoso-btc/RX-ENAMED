-- Segurança: bloqueio por tentativas, verificação em duas etapas (TOTP), sessões rastreáveis, limites de requisição e LGPD.
ALTER TABLE usuarios
  ADD COLUMN falhas_login integer NOT NULL DEFAULT 0,
  ADD COLUMN bloqueado_ate timestamptz,
  ADD COLUMN totp_segredo text,
  ADD COLUMN totp_pendente text,
  ADD COLUMN totp_ativo boolean NOT NULL DEFAULT false,
  ADD COLUMN totp_recuperacao text[] NOT NULL DEFAULT '{}',
  ADD COLUMN aceite_termos_em timestamptz,
  ADD COLUMN excluido_em timestamptz;

ALTER TABLE sessoes
  ADD COLUMN mfa_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN ip text,
  ADD COLUMN agente text,
  ADD COLUMN ultimo_uso timestamptz NOT NULL DEFAULT now();

-- Limites de requisição por janela de tempo (valem entre reinícios e entre instâncias).
CREATE TABLE limites (
  chave  text NOT NULL,
  em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX limites_chave_em ON limites (chave, em);
