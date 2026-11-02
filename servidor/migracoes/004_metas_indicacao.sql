-- Metas do negócio, contagem anônima de visitas e programa de indicação entre alunos.
CREATE TABLE configuracoes (
  chave  text PRIMARY KEY,
  valor  jsonb NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO configuracoes (chave, valor) VALUES
  ('metas', '{"usuarios": 100, "receitaCentavos": 100000000, "prazo": null}');

-- Visitas por dia e página. Visitante único = hash diário de IP + navegador com segredo que muda todo dia:
-- não dá para rastrear a pessoa nem de um dia para o outro (sem cookies, LGPD).
CREATE TABLE visitas (
  dia      date NOT NULL,
  pagina   text NOT NULL,
  total    integer NOT NULL DEFAULT 0,
  unicos   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, pagina)
);
CREATE TABLE visitantes_dia (
  dia    date NOT NULL,
  hash   text NOT NULL,
  PRIMARY KEY (dia, hash)
);

ALTER TABLE usuarios
  ADD COLUMN codigo_indicacao text,
  ADD COLUMN indicado_por uuid REFERENCES usuarios,
  ADD COLUMN origem text;
CREATE UNIQUE INDEX usuarios_codigo_indicacao ON usuarios (upper(codigo_indicacao));
CREATE INDEX usuarios_indicado_por ON usuarios (indicado_por) WHERE indicado_por IS NOT NULL;

ALTER TABLE pedidos ADD COLUMN desconto_indicacao boolean NOT NULL DEFAULT false;

ALTER TABLE matriculas DROP CONSTRAINT IF EXISTS matriculas_origem_check;
ALTER TABLE matriculas ADD CONSTRAINT matriculas_origem_check CHECK (origem IN ('pagamento', 'manual', 'indicacao'));

-- Uma recompensa por aluno indicado (na primeira compra aprovada dele).
CREATE TABLE recompensas_indicacao (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicado_id   uuid NOT NULL UNIQUE REFERENCES usuarios,
  indicador_id  uuid NOT NULL REFERENCES usuarios,
  pedido_id     uuid NOT NULL REFERENCES pedidos,
  matricula_id  uuid REFERENCES matriculas,
  dias          integer NOT NULL,
  status        text NOT NULL DEFAULT 'concedida' CHECK (status IN ('concedida', 'cancelada')),
  criado_em     timestamptz NOT NULL DEFAULT now()
);
