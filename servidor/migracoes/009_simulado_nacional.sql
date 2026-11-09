-- Faculdade do aluno (ranking por faculdade e relatório da turma) e consentimento para a coordenação ver o desempenho individual.
-- faculdade: 'br:<código do curso no INEP>', 'py:<id da universidade no Paraguai>' ou 'outra'.
ALTER TABLE usuarios
  ADD COLUMN faculdade text CHECK (faculdade IS NULL OR faculdade ~ '^(br:[0-9]{1,10}|py:[a-z0-9-]{2,40}|outra)$'),
  ADD COLUMN faculdade_outra text,
  ADD COLUMN compartilhar_faculdade boolean NOT NULL DEFAULT false;
CREATE INDEX usuarios_faculdade ON usuarios (faculdade) WHERE faculdade IS NOT NULL;

-- Simulado nacional gratuito: edições com janela de datas e um caderno fixo, corrigido no servidor.
CREATE TABLE simulados_nacionais (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         text NOT NULL,
  exame        text NOT NULL CHECK (exame IN ('enamed', 'revalida')),
  inicio       timestamptz NOT NULL,
  fim          timestamptz NOT NULL CHECK (fim > inicio),
  duracao_min  integer NOT NULL CHECK (duracao_min BETWEEN 10 AND 600),
  questoes     jsonb NOT NULL,
  publicado    boolean NOT NULL DEFAULT true,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  criado_por   uuid REFERENCES usuarios
);

CREATE TABLE simulado_participacoes (
  simulado_id  uuid NOT NULL REFERENCES simulados_nacionais ON DELETE CASCADE,
  usuario_id   uuid NOT NULL REFERENCES usuarios ON DELETE CASCADE,
  faculdade    text,
  etapa        text,
  iniciado_em  timestamptz NOT NULL DEFAULT now(),
  enviado_em   timestamptz,
  no_tempo     boolean,
  respostas    jsonb,
  acertos      integer,
  total        integer,
  nota         numeric(5, 2),
  por_area     jsonb,
  PRIMARY KEY (simulado_id, usuario_id)
);
CREATE INDEX simulado_participacoes_ranking ON simulado_participacoes (simulado_id, nota DESC) WHERE enviado_em IS NOT NULL;

-- Link de leitura do relatório da turma para a coordenação (o token fica só com quem recebe o link).
CREATE TABLE relatorio_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  text NOT NULL UNIQUE,
  faculdade   text NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  expira_em   timestamptz NOT NULL,
  revogado_em timestamptz,
  criado_por  uuid REFERENCES usuarios
);
