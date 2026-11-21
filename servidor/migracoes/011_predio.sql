-- Prédio da Rx Med: as peças de marketing que o time monta (pauta da semana), com aprovação, publicação e métricas.
CREATE TABLE predio_pecas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semana        date NOT NULL,
  dia           date NOT NULL,
  slot          text NOT NULL,
  formato       text NOT NULL CHECK (formato IN ('carrossel', 'reels', 'story')),
  pilar         text NOT NULL,
  titulo        text NOT NULL,
  agente        text NOT NULL,
  conteudo      jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'aprovada', 'postada', 'descartada')),
  horario       text,
  link          text,
  metricas      jsonb NOT NULL DEFAULT '{}',
  questao_id    text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES usuarios,
  UNIQUE (dia, slot)
);
CREATE INDEX predio_pecas_semana ON predio_pecas (semana);
CREATE INDEX predio_pecas_questao ON predio_pecas (questao_id) WHERE questao_id IS NOT NULL;
INSERT INTO configuracoes (chave, valor) VALUES ('predio', '{}') ON CONFLICT DO NOTHING;
