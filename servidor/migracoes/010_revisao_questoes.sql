-- Revisão médica das questões autorais (e das importadas): só as aprovadas chegam aos alunos.
CREATE TABLE revisoes_questoes (
  questao_id    text PRIMARY KEY,
  status        text NOT NULL CHECK (status IN ('aprovada', 'corrigir', 'reprovada')),
  gabarito      text CHECK (gabarito IS NULL OR gabarito ~ '^[A-E]$'),
  revisor       text NOT NULL,
  crm           text,
  observacao    text,
  revisado_por  uuid REFERENCES usuarios,
  revisado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX revisoes_questoes_status ON revisoes_questoes (status);
