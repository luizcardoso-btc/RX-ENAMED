-- Eventos (congressos, feiras, eventos acadêmicos e apresentações) onde a Rx Med pode ter estande ou falar.
CREATE TABLE eventos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             text NOT NULL,
  tipo             text NOT NULL DEFAULT 'congresso' CHECK (tipo IN ('congresso', 'feira', 'academico', 'apresentacao', 'outro')),
  publico          text NOT NULL DEFAULT 'ambos' CHECK (publico IN ('enamed', 'revalida', 'ambos', 'faculdades')),
  inicio           date,
  fim              date,
  data_texto       text,
  cidade           text,
  pais             text NOT NULL DEFAULT 'Brasil',
  local            text,
  lat              double precision,
  lng              double precision,
  site             text,
  status           text NOT NULL DEFAULT 'ideia'
                   CHECK (status IN ('ideia', 'pesquisado', 'pedido_proposta', 'proposta_recebida', 'fechado', 'realizado', 'descartado')),
  prioridade       text NOT NULL DEFAULT 'media' CHECK (prioridade IN ('alta', 'media', 'baixa')),
  custo_centavos   integer CHECK (custo_centavos IS NULL OR custo_centavos >= 0),
  publico_estimado integer CHECK (publico_estimado IS NULL OR publico_estimado >= 0),
  contato_nome     text,
  contato_email    text,
  contato_telefone text,
  proxima_acao     text,
  proxima_data     date,
  notas            text,
  fonte            text,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  atualizado_por   uuid REFERENCES usuarios
);
CREATE INDEX eventos_inicio ON eventos (inicio);

-- Acompanhamento das faculdades de Medicina do Paraguai (a lista vem de conteudo/paraguai/paraguai.json).
CREATE TABLE paraguai_crm (
  universidade_id   text PRIMARY KEY,
  status            text NOT NULL DEFAULT 'nao_contatado'
                    CHECK (status IN ('nao_contatado', 'pesquisada', 'contato_feito', 'reuniao_agendada', 'visitada', 'proposta_enviada', 'parceria', 'sem_interesse')),
  prioridade        text NOT NULL DEFAULT 'media' CHECK (prioridade IN ('alta', 'media', 'baixa')),
  alunos_brasileiros integer CHECK (alunos_brasileiros IS NULL OR alunos_brasileiros >= 0),
  contato_nome      text,
  contato_cargo     text,
  contato_email     text,
  contato_telefone  text,
  proxima_acao      text,
  proxima_data      date,
  visita_data       date,
  cupom             text,
  notas             text,
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_por    uuid REFERENCES usuarios
);

-- Histórico de contatos de eventos e de faculdades do Paraguai.
CREATE TABLE prospeccao_interacoes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alvo_tipo  text NOT NULL CHECK (alvo_tipo IN ('evento', 'paraguai')),
  alvo_id    text NOT NULL,
  tipo       text NOT NULL CHECK (tipo IN ('email', 'ligacao', 'whatsapp', 'reuniao', 'visita', 'proposta', 'outro')),
  texto      text NOT NULL,
  em         timestamptz NOT NULL DEFAULT now(),
  admin_id   uuid REFERENCES usuarios
);
CREATE INDEX prospeccao_interacoes_alvo ON prospeccao_interacoes (alvo_tipo, alvo_id, em DESC);

-- A UMS já começa como prioridade alta: é a porta de entrada no Paraguai.
INSERT INTO paraguai_crm (universidade_id, status, prioridade, proxima_acao, notas)
VALUES ('ums', 'pesquisada', 'alta', 'Marcar a primeira apresentação do Rx Med Revalida', 'Ex-aluno da casa: usar o contato com a coordenação e com os estudantes brasileiros.');

-- Eventos levantados em novembro de 2026 (confirmar datas, estandes e preços com cada organizador).
INSERT INTO eventos (nome, tipo, publico, inicio, fim, data_texto, cidade, pais, local, lat, lng, site, status, prioridade, notas, fonte) VALUES
('Apresentação Rx Med Revalida na UMS', 'apresentacao', 'revalida', NULL, NULL, 'a marcar', 'Asunción', 'Paraguai', 'Universidad Privada María Serrana', -25.2637, -57.5759, NULL, 'ideia', 'alta',
 'Primeira apresentação no Paraguai, pela porta de entrada na UMS. Levar a plataforma em espanhol, uma estação da 2ª etapa ao vivo e cupom da turma.', NULL),
('19º Congresso Brasileiro de Medicina de Família e Comunidade (CBMFC)', 'congresso', 'ambos', '2027-04-22', '2027-04-25', 'pré-congresso em 21/04', 'Porto Alegre', 'Brasil', 'Centro de Eventos PUCRS', -30.0596, -51.1730, 'https://sbmfc.org.br/19cbmfc/', 'pesquisado', 'alta',
 'Muitos estudantes e residentes; SUS e MFC caem no ENAMED e no Revalida. Pedir o kit de patrocínio.', 'https://sbmfc.org.br/19cbmfc/'),
('COBEM 2027 · Congresso Brasileiro de Educação Médica (ABEM)', 'congresso', 'faculdades', NULL, NULL, 'data a confirmar (2026 foi em setembro)', 'Rio de Janeiro', 'Brasil', NULL, -22.9068, -43.1729, 'https://website.abem-educmed.org.br/', 'pesquisado', 'alta',
 'Coordenadores e professores das escolas médicas: melhor evento para parcerias institucionais (aba Faculdades).', 'https://website.abem-educmed.org.br/wp-content/uploads/2025/01/CONVITE-PARA-CADIDATURAS-DE-EMPRESAS-DE-EVENTOS-PARA-SEDIAR-COBENS-2026-E-2027.pdf'),
('Congresso Brasileiro dos Estudantes de Medicina (DENEM)', 'academico', 'enamed', NULL, NULL, '7 a 14 de janeiro (ano a confirmar)', 'Brasília', 'Brasil', 'Universidade de Brasília', -15.7631, -47.8706, 'https://doity.com.br/congresso-brasileiro-dos-estudantes-de-medicina', 'pesquisado', 'media',
 'Evento nacional só de estudantes. Confirmar edição e se aceita patrocínio.', 'https://doity.com.br/congresso-brasileiro-dos-estudantes-de-medicina'),
('COMU · Congresso Médico Universitário da FMUSP', 'academico', 'enamed', NULL, NULL, 'anual, data a confirmar', 'São Paulo', 'Brasil', 'Faculdade de Medicina da USP', -23.5558, -46.6700, NULL, 'pesquisado', 'media',
 'Organizado pelo Departamento Científico; já passou de 1.200 participantes, quase todos estudantes.', 'https://revistas.usp.br/revistadc/en/article/view/207644'),
('SOCESP 2027 · Congresso de Cardiologia do Estado de São Paulo', 'congresso', 'ambos', '2027-05-27', '2027-05-29', NULL, 'São Paulo', 'Brasil', 'Transamerica Expo Center', -23.6280, -46.7143, NULL, 'pesquisado', 'media',
 'Combina com o destaque de ECG. Estande provavelmente caro: pedir proposta antes.', 'https://www.usebip.com/blogs/bip-insights/calendario-de-congressos-medicos-2027'),
('19º Congresso Brasileiro de Clínica Médica (CBCM 2027)', 'congresso', 'ambos', NULL, NULL, 'data a confirmar', 'São Paulo', 'Brasil', NULL, -23.5505, -46.6333, NULL, 'pesquisado', 'media',
 'Clínica é a área que mais cai nas provas.', 'https://www.usebip.com/blogs/bip-insights/calendario-de-congressos-medicos-2027'),
('Congresso Brasileiro de Cardiologia (SBC) 2027', 'congresso', 'ambos', NULL, NULL, 'costuma ser em setembro; cidade a confirmar', NULL, 'Brasil', NULL, NULL, NULL, 'https://www.portal.cardiol.br/', 'ideia', 'baixa',
 'Grande e caro; só se houver espaço para startups ou educação.', NULL),
('Hospitalar 2027', 'feira', 'ambos', '2027-05-18', '2027-05-21', NULL, 'São Paulo', 'Brasil', 'São Paulo Expo', -23.6446, -46.6252, 'https://hospitalar.com/en', 'descartado', 'baixa',
 'Feira de hospitais e indústria: quase não há estudantes. Não recomendado.', 'https://hospitalar.com/en');
