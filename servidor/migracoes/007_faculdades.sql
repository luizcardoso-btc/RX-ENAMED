-- Prospecção de escolas médicas: o acompanhamento de cada curso (a lista vem de conteudo/faculdades/escolas-medicas.json).
CREATE TABLE faculdades_crm (
  curso_id       integer PRIMARY KEY,
  status         text NOT NULL DEFAULT 'nao_contatado'
                 CHECK (status IN ('nao_contatado', 'pesquisada', 'contato_feito', 'reuniao_agendada', 'visitada', 'proposta_enviada', 'parceria', 'sem_interesse')),
  prioridade     text NOT NULL DEFAULT 'media' CHECK (prioridade IN ('alta', 'media', 'baixa')),
  contato_nome   text,
  contato_cargo  text,
  contato_email  text,
  contato_telefone text,
  proxima_acao   text,
  proxima_data   date,
  visita_data    date,
  cupom          text,
  notas          text,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid REFERENCES usuarios
);

-- Histórico de contatos com cada escola (ligação, e-mail, reunião, visita...).
CREATE TABLE faculdades_interacoes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id   integer NOT NULL,
  tipo       text NOT NULL CHECK (tipo IN ('email', 'ligacao', 'whatsapp', 'reuniao', 'visita', 'proposta', 'outro')),
  texto      text NOT NULL,
  em         timestamptz NOT NULL DEFAULT now(),
  admin_id   uuid REFERENCES usuarios
);
CREATE INDEX faculdades_interacoes_curso ON faculdades_interacoes (curso_id, em DESC);
