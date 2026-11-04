-- Prática da 2ª etapa (habilidades clínicas): tentativas de estação, resultados, simulados de 5 e 10 estações
-- e salas de treino em dupla (médico + ator). Só cria tabelas novas; nenhuma tabela existente é alterada.

-- Uma tentativa é uma passagem por uma estação. Guarda o que o candidato falou e o que foi revelado,
-- para a correção (sugestão automática ou IA) e para liberar o PEP só depois de encerrar.
CREATE TABLE pratica_tentativas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid NOT NULL REFERENCES usuarios ON DELETE CASCADE,
  estacao_id    text NOT NULL,
  estacao_versao integer NOT NULL DEFAULT 1,
  modo          text NOT NULL CHECK (modo IN ('gratuito', 'roteiro', 'ia', 'dupla')),
  simulado_id   uuid,
  falas         jsonb NOT NULL DEFAULT '[]',
  revelados     jsonb NOT NULL DEFAULT '[]',
  conclusao     text NOT NULL DEFAULT '',
  iniciada_em   timestamptz NOT NULL DEFAULT now(),
  encerrada_em  timestamptz
);
CREATE INDEX pratica_tentativas_usuario ON pratica_tentativas (usuario_id, iniciada_em DESC);

-- Resultado corrigido pelo PEP (autoavaliação, IA ou ator na dupla).
CREATE TABLE pratica_resultados (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid NOT NULL REFERENCES usuarios ON DELETE CASCADE,
  estacao_id    text NOT NULL,
  estacao_versao integer NOT NULL DEFAULT 1,
  area          text NOT NULL,
  modo          text NOT NULL,
  avaliado_por  text NOT NULL CHECK (avaliado_por IN ('autoavaliacao', 'ia', 'ator')),
  avaliador_id  uuid REFERENCES usuarios ON DELETE SET NULL,
  tentativa_id  uuid REFERENCES pratica_tentativas ON DELETE SET NULL,
  simulado_id   uuid,
  sala_codigo   text,
  nota          numeric(5, 3) NOT NULL CHECK (nota >= 0 AND nota <= 10),
  itens         jsonb NOT NULL,
  criticos      jsonb NOT NULL DEFAULT '[]',
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pratica_resultados_usuario ON pratica_resultados (usuario_id, criado_em DESC);

-- Simulado de 1, 5 ou 10 estações, com a distribuição do edital escolhido.
CREATE TABLE pratica_simulados (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    uuid NOT NULL REFERENCES usuarios ON DELETE CASCADE,
  edital        text NOT NULL,
  estacoes      jsonb NOT NULL,
  minutos       integer NOT NULL DEFAULT 10,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  concluido_em  timestamptz,
  nota          numeric(5, 3)
);
CREATE INDEX pratica_simulados_usuario ON pratica_simulados (usuario_id, criado_em DESC);

-- Sala de treino em dupla. O médico (candidato) só vê o impresso da porta e o que o ator liberar;
-- o ator vê o roteiro, os impressos e o PEP, e avalia. A chamada de vídeo é externa (Google Meet).
CREATE TABLE pratica_salas (
  codigo        text PRIMARY KEY,
  criador_id    uuid NOT NULL REFERENCES usuarios ON DELETE CASCADE,
  medico_id     uuid REFERENCES usuarios ON DELETE SET NULL,
  ator_id       uuid REFERENCES usuarios ON DELETE SET NULL,
  estacao_id    text,
  estado        text NOT NULL DEFAULT 'aguardando' CHECK (estado IN ('aguardando', 'em_andamento', 'encerrada')),
  modo_prova    boolean NOT NULL DEFAULT true,
  meet_url      text,
  minutos       integer NOT NULL DEFAULT 10,
  liberados     jsonb NOT NULL DEFAULT '[]',
  avaliacao     jsonb NOT NULL DEFAULT '{}',
  resultado     jsonb,
  iniciada_em   timestamptz,
  encerrada_em  timestamptz,
  criada_em     timestamptz NOT NULL DEFAULT now(),
  atualizada_em timestamptz NOT NULL DEFAULT now(),
  expira_em     timestamptz NOT NULL DEFAULT now() + interval '6 hours'
);
CREATE INDEX pratica_salas_expira ON pratica_salas (expira_em);

-- Mensagens de texto da sala (opcionais: a conversa principal acontece na chamada de vídeo).
CREATE TABLE pratica_sala_eventos (
  id            bigserial PRIMARY KEY,
  codigo        text NOT NULL REFERENCES pratica_salas ON DELETE CASCADE,
  autor_id      uuid REFERENCES usuarios ON DELETE SET NULL,
  tipo          text NOT NULL,
  dados         jsonb NOT NULL DEFAULT '{}',
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pratica_sala_eventos_codigo ON pratica_sala_eventos (codigo, id);
