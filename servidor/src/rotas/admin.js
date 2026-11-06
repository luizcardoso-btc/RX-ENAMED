import { Router } from 'express';
import { exigirLogin, exigirAdmin } from './autenticacao.js';
import { aplicarPagamento } from '../pagamentos.js';
import { somarMeses } from '../planos.js';
import { resumoMetas, lerMetas } from '../metas.js';
import { existsSync, readFileSync } from 'node:fs';

const ETAPAS = { 1: '1º ano', 2: '2º ano', 3: '3º ano', 4: '4º ano', 5: '5º ano (internato)', 6: '6º ano (internato)', formado: 'Formado no Brasil', exterior: 'Formado no exterior' };

// Escolas médicas do Brasil (INEP, Censo da Educação Superior) para a prospecção de parcerias.
const ARQ_FACULDADES = new URL('../../../conteudo/faculdades/escolas-medicas.json', import.meta.url).pathname;
const FACULDADES = existsSync(ARQ_FACULDADES) ? JSON.parse(readFileSync(ARQ_FACULDADES, 'utf8')) : { escolas: [] };
const POR_CURSO = new Map(FACULDADES.escolas.map((e) => [e.curso, e]));
const STATUS_FACULDADE = ['nao_contatado', 'pesquisada', 'contato_feito', 'reuniao_agendada', 'visitada', 'proposta_enviada', 'parceria', 'sem_interesse'];
const TIPOS_INTERACAO = ['email', 'ligacao', 'whatsapp', 'reuniao', 'visita', 'proposta', 'outro'];
const CAMPOS_CRM = ['status', 'prioridade', 'contato_nome', 'contato_cargo', 'contato_email', 'contato_telefone', 'proxima_acao', 'proxima_data', 'visita_data', 'cupom', 'notas'];
const dataISO = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

const POR_PAGINA = 50;
// Situação do aluno calculada no banco: ativo (acesso vigente), vencendo (termina em até 7 dias), expirado (já teve) ou gratuito (nunca pagou).
const SITUACAO = `
  CASE
    WHEN m.fim IS NOT NULL AND m.fim > now() AND m.fim <= now() + interval '7 days' THEN 'vencendo'
    WHEN m.fim IS NOT NULL AND m.fim > now() THEN 'ativo'
    WHEN h.teve THEN 'expirado'
    ELSE 'gratuito'
  END`;
const BASE_ALUNOS = `
  FROM usuarios u
  LEFT JOIN LATERAL (SELECT plano_id, fim FROM matriculas WHERE usuario_id = u.id AND status = 'ativa' AND inicio <= now() AND fim > now()
                     ORDER BY fim DESC LIMIT 1) m ON true
  LEFT JOIN LATERAL (SELECT true AS teve FROM matriculas WHERE usuario_id = u.id LIMIT 1) h ON true
  LEFT JOIN LATERAL (SELECT COALESCE(sum(valor_centavos), 0) AS total FROM pedidos WHERE usuario_id = u.id AND status = 'aprovado') g ON true`;

const csv = (linhas) => linhas.map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');

export function rotasAdmin({ banco, planos, mp, correio, config }) {
  const r = Router();
  r.use(exigirLogin, exigirAdmin(config));
  const auditar = (req, acao, alvo, detalhes = {}) =>
    banco.consulta('INSERT INTO auditoria (admin_id, acao, alvo, detalhes) VALUES ($1, $2, $3, $4)', [req.usuario.id, acao, alvo, JSON.stringify(detalhes)]);

  // Painel de vendas: receita, pedidos, conversão, alunos e série diária.
  r.get('/resumo', async (req, res) => {
    const dias = Math.min(365, Math.max(7, Number(req.query.dias) || 30));
    const receita = await banco.um(`
      SELECT
        COALESCE(sum(valor_centavos) FILTER (WHERE pago_em >= date_trunc('day', now())), 0) AS hoje,
        COALESCE(sum(valor_centavos) FILTER (WHERE pago_em >= now() - interval '7 days'), 0) AS semana,
        COALESCE(sum(valor_centavos) FILTER (WHERE pago_em >= date_trunc('month', now())), 0) AS mes,
        COALESCE(sum(valor_centavos) FILTER (WHERE pago_em >= now() - make_interval(days => $1)), 0) AS periodo,
        COALESCE(sum(valor_centavos), 0) AS total,
        count(*) FILTER (WHERE pago_em >= now() - make_interval(days => $1)) AS vendas_periodo
      FROM pedidos WHERE status = 'aprovado'`, [dias]);
    const pedidos = await banco.varios(
      `SELECT status, count(*) AS n FROM pedidos WHERE criado_em >= now() - make_interval(days => $1) GROUP BY status`, [dias]);
    const porPlano = await banco.varios(`
      SELECT plano_id AS plano, count(*) AS vendas, sum(valor_centavos) AS receita FROM pedidos
       WHERE status = 'aprovado' AND pago_em >= now() - make_interval(days => $1) GROUP BY plano_id ORDER BY receita DESC`, [dias]);
    const porMetodo = await banco.varios(`
      SELECT metodo, count(*) FILTER (WHERE status = 'aprovado') AS aprovados, count(*) AS tentativas FROM pedidos
       WHERE criado_em >= now() - make_interval(days => $1) GROUP BY metodo`, [dias]);
    const serie = await banco.varios(`
      SELECT to_char(d, 'YYYY-MM-DD') AS dia,
             COALESCE((SELECT sum(valor_centavos) FROM pedidos WHERE status = 'aprovado' AND pago_em >= d AND pago_em < d + interval '1 day'), 0) AS receita,
             (SELECT count(*) FROM usuarios WHERE criado_em >= d AND criado_em < d + interval '1 day') AS cadastros
        FROM generate_series(date_trunc('day', now()) - make_interval(days => $1 - 1), date_trunc('day', now()), interval '1 day') d`, [dias]);
    const alunos = await banco.um(`
      SELECT count(*) AS total,
             count(*) FILTER (WHERE situacao IN ('ativo', 'vencendo')) AS ativos,
             count(*) FILTER (WHERE situacao = 'vencendo') AS vencendo,
             count(*) FILTER (WHERE situacao = 'expirado') AS expirados,
             count(*) FILTER (WHERE situacao = 'gratuito') AS gratuitos,
             count(*) FILTER (WHERE criado_em >= now() - make_interval(days => $1)) AS novos
        FROM (SELECT u.criado_em, ${SITUACAO} AS situacao ${BASE_ALUNOS} WHERE u.papel = 'aluno') x`, [dias]);
    const reembolsos = await banco.um(
      `SELECT count(*) AS n, COALESCE(sum(valor_centavos), 0) AS valor FROM pedidos WHERE status = 'reembolsado' AND atualizado_em >= now() - make_interval(days => $1)`, [dias]);
    const porAfiliado = await banco.varios(`
      SELECT a.id, a.nome, a.codigo, count(p.*) AS vendas, COALESCE(sum(p.valor_centavos), 0) AS receita, COALESCE(sum(p.comissao_centavos), 0) AS comissao
        FROM pedidos p JOIN afiliados a ON a.id = p.afiliado_id
       WHERE p.status = 'aprovado' AND p.pago_em >= now() - make_interval(days => $1) GROUP BY a.id ORDER BY receita DESC`, [dias]);
    const porCupom = await banco.varios(`
      SELECT c.codigo, count(p.*) AS vendas, COALESCE(sum(p.desconto_centavos), 0) AS desconto, COALESCE(sum(p.valor_centavos), 0) AS receita
        FROM pedidos p JOIN cupons c ON c.id = p.cupom_id
       WHERE p.status = 'aprovado' AND p.pago_em >= now() - make_interval(days => $1) GROUP BY c.codigo ORDER BY vendas DESC`, [dias]);
    const criados = pedidos.reduce((s, p) => s + p.n, 0);
    const aprovados = pedidos.find((p) => p.status === 'aprovado')?.n || 0;
    res.json({
      dias, receita, alunos, porPlano, porMetodo, porAfiliado, porCupom, serie, reembolsos,
      pedidos: Object.fromEntries(pedidos.map((p) => [p.status, p.n])),
      conversao: criados ? aprovados / criados : 0,
      ticketMedio: receita.vendas_periodo ? Math.round(receita.periodo / receita.vendas_periodo) : 0,
      planos: planos.planos.map((p) => ({ id: p.id, nome: p.nome })),
    });
  });

  r.get('/alunos', async (req, res) => {
    const busca = String(req.query.busca || '').trim();
    const situacao = ['ativo', 'vencendo', 'expirado', 'gratuito'].includes(req.query.situacao) ? req.query.situacao : null;
    const pagina = Math.max(1, Number(req.query.pagina) || 1);
    const params = [];
    const filtros = ["u.papel = 'aluno'"];
    if (busca) { params.push(`%${busca.toLowerCase()}%`); filtros.push(`(lower(u.nome) LIKE $${params.length} OR lower(u.email) LIKE $${params.length} OR u.cpf LIKE $${params.length})`); }
    const sql = `SELECT * FROM (SELECT u.id, u.nome, u.email, u.cpf, u.etapa, u.criado_em, u.ultimo_acesso, m.plano_id AS plano, m.fim AS acesso_ate,
                        g.total AS total_pago, ${SITUACAO} AS situacao ${BASE_ALUNOS} WHERE ${filtros.join(' AND ')}) x
                  ${situacao ? `WHERE situacao = '${situacao}'` : ''}`;
    if (req.query.formato === 'csv') {
      const todos = await banco.varios(`${sql} ORDER BY criado_em DESC`, params);
      res.type('text/csv; charset=utf-8').attachment('alunos-rx-enamed.csv');
      return res.send('﻿' + csv([['Nome', 'E-mail', 'CPF', 'Etapa', 'Situação', 'Plano', 'Acesso até', 'Total pago (R$)', 'Cadastro', 'Último acesso'],
        ...todos.map((a) => [a.nome, a.email, a.cpf, ETAPAS[a.etapa] || '', a.situacao, a.plano, a.acesso_ate?.toISOString().slice(0, 10), (a.total_pago / 100).toFixed(2).replace('.', ','),
          a.criado_em.toISOString().slice(0, 10), a.ultimo_acesso?.toISOString().slice(0, 10)])]));
    }
    const total = (await banco.um(`SELECT count(*) AS n FROM (${sql}) y`, params)).n;
    params.push(POR_PAGINA, (pagina - 1) * POR_PAGINA);
    const alunos = await banco.varios(`${sql} ORDER BY criado_em DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.json({ alunos, total, pagina, porPagina: POR_PAGINA });
  });

  r.get('/alunos/:id', async (req, res) => {
    const aluno = await banco.um('SELECT id, nome, email, cpf, telefone, sexo, etapa, papel, criado_em, ultimo_acesso FROM usuarios WHERE id = $1', [req.params.id]).catch(() => null);
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });
    const matriculas = await banco.varios('SELECT * FROM matriculas WHERE usuario_id = $1 ORDER BY inicio DESC', [aluno.id]);
    const pedidos = await banco.varios('SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY criado_em DESC', [aluno.id]);
    const emails = await banco.varios('SELECT modelo, assunto, status, criado_em FROM emails WHERE usuario_id = $1 ORDER BY criado_em DESC LIMIT 30', [aluno.id]);
    const progresso = await banco.um(`SELECT atualizado_em, (SELECT count(*) FROM jsonb_object_keys(COALESCE(dados->'respostas', '{}'::jsonb))) AS questoes FROM progresso WHERE usuario_id = $1`, [aluno.id]);
    res.json({ aluno, matriculas, pedidos, emails, progresso });
  });

  // Liberação manual (bolsa, cortesia, correção) ou revogação do acesso.
  r.post('/alunos/:id/acesso', async (req, res) => {
    const aluno = await banco.um('SELECT id FROM usuarios WHERE id = $1', [req.params.id]).catch(() => null);
    if (!aluno) return res.status(404).json({ erro: 'Aluno não encontrado.' });
    const { acao, plano, meses, observacao } = req.body || {};
    if (acao === 'conceder') {
      const p = planos.porId[plano];
      const n = Number(meses || p?.duracaoMeses);
      if (!p || !Number.isInteger(n) || n < 1 || n > 36) return res.status(400).json({ erro: 'Plano ou duração inválidos.' });
      const vigente = await banco.um(`SELECT max(fim) AS fim FROM matriculas WHERE usuario_id = $1 AND status = 'ativa' AND fim > now()`, [aluno.id]);
      const inicio = vigente?.fim ? new Date(vigente.fim) : new Date();
      const m = await banco.um(
        `INSERT INTO matriculas (usuario_id, plano_id, inicio, fim, origem, observacao) VALUES ($1, $2, $3, $4, 'manual', $5) RETURNING *`,
        [aluno.id, p.id, inicio, somarMeses(inicio, n), String(observacao || '').slice(0, 300) || null]);
      await auditar(req, 'conceder_acesso', aluno.id, { plano: p.id, meses: n, observacao });
      return res.status(201).json({ matricula: m });
    }
    if (acao === 'revogar') {
      const r2 = await banco.consulta(`UPDATE matriculas SET status = 'cancelada' WHERE usuario_id = $1 AND status = 'ativa' AND fim > now()`, [aluno.id]);
      await auditar(req, 'revogar_acesso', aluno.id, { observacao, matriculas: r2.rowCount });
      return res.json({ revogadas: r2.rowCount });
    }
    res.status(400).json({ erro: 'Ação inválida.' });
  });

  r.get('/pedidos', async (req, res) => {
    const pagina = Math.max(1, Number(req.query.pagina) || 1);
    const params = [];
    const filtros = [];
    if (req.query.status) { params.push(String(req.query.status)); filtros.push(`p.status = $${params.length}`); }
    if (req.query.metodo) { params.push(String(req.query.metodo)); filtros.push(`p.metodo = $${params.length}`); }
    const onde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
    const total = (await banco.um(`SELECT count(*) AS n FROM pedidos p ${onde}`, params)).n;
    params.push(POR_PAGINA, (pagina - 1) * POR_PAGINA);
    const pedidos = await banco.varios(`
      SELECT p.id, p.plano_id AS plano, p.valor_centavos, p.metodo, p.parcelas, p.status, p.status_detalhe, p.mp_pagamento_id, p.criado_em, p.pago_em,
             u.id AS aluno_id, u.nome AS aluno, u.email
        FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id ${onde}
       ORDER BY p.criado_em DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.json({ pedidos, total, pagina, porPagina: POR_PAGINA });
  });

  r.post('/pedidos/:id/reembolsar', async (req, res) => {
    const pedido = await banco.um('SELECT * FROM pedidos WHERE id = $1', [req.params.id]).catch(() => null);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    if (pedido.status !== 'aprovado' || !pedido.mp_pagamento_id) return res.status(400).json({ erro: 'Só pedidos aprovados podem ser reembolsados.' });
    try {
      await mp.reembolsar(pedido.mp_pagamento_id, `reembolso-${pedido.id}`);
      await aplicarPagamento({ banco, planos, correio }, await mp.consultarPagamento(pedido.mp_pagamento_id));
    } catch (e) {
      return res.status(502).json({ erro: `O Mercado Pago não aceitou o reembolso: ${e.message}` });
    }
    await auditar(req, 'reembolsar', pedido.id, { motivo: req.body?.motivo });
    res.json({ pedido: await banco.um('SELECT id, status FROM pedidos WHERE id = $1', [pedido.id]) });
  });

  // ---- Cupons
  r.get('/cupons', async (_req, res) => {
    res.json({ cupons: await banco.varios(`
      SELECT c.*, a.nome AS afiliado, a.codigo AS afiliado_codigo,
             (SELECT COALESCE(sum(valor_centavos), 0) FROM pedidos WHERE cupom_id = c.id AND status = 'aprovado') AS receita
        FROM cupons c LEFT JOIN afiliados a ON a.id = c.afiliado_id ORDER BY c.criado_em DESC`) });
  });
  r.post('/cupons', async (req, res) => {
    const b = req.body || {};
    const codigo = String(b.codigo || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,30}$/.test(codigo)) return res.status(400).json({ erro: 'Código: 3 a 30 letras, números, hífen ou sublinhado.' });
    if (!['percentual', 'fixo'].includes(b.tipo)) return res.status(400).json({ erro: 'Tipo inválido.' });
    const valor = b.tipo === 'percentual' ? Number(b.valor) : Math.round(Number(b.valor) * 100);
    if (!Number.isFinite(valor) || valor <= 0 || (b.tipo === 'percentual' && valor > 90)) return res.status(400).json({ erro: 'Valor inválido (percentual até 90%).' });
    const planosCupom = (b.planos || []).filter((id) => planos.porId[id]);
    try {
      const c = await banco.um(`INSERT INTO cupons (codigo, tipo, valor, planos, valido_ate, limite_usos, afiliado_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [codigo, b.tipo, Math.round(valor), planosCupom.length ? planosCupom : null, b.validoAte || null, b.limiteUsos ? Number(b.limiteUsos) : null, b.afiliadoId || null]);
      await auditar(req, 'criar_cupom', c.id, { codigo, tipo: b.tipo, valor });
      res.status(201).json({ cupom: c });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ erro: 'Já existe um cupom com este código.' });
      throw e;
    }
  });
  r.post('/cupons/:id/ativo', async (req, res) => {
    const c = await banco.um('UPDATE cupons SET ativo = $2 WHERE id = $1 RETURNING id, codigo, ativo', [req.params.id, !!req.body?.ativo]).catch(() => null);
    if (!c) return res.status(404).json({ erro: 'Cupom não encontrado.' });
    await auditar(req, c.ativo ? 'ativar_cupom' : 'desativar_cupom', c.id, { codigo: c.codigo });
    res.json({ cupom: c });
  });

  // ---- Afiliados
  r.get('/afiliados', async (_req, res) => {
    res.json({ afiliados: await banco.varios(`
      SELECT a.*,
             count(p.*) FILTER (WHERE p.status = 'aprovado') AS vendas,
             COALESCE(sum(p.valor_centavos) FILTER (WHERE p.status = 'aprovado'), 0) AS receita,
             COALESCE(sum(p.comissao_centavos) FILTER (WHERE p.status = 'aprovado' AND p.comissao_paga_em IS NULL AND p.pago_em < now() - interval '7 days'), 0) AS comissao_liberada,
             COALESCE(sum(p.comissao_centavos) FILTER (WHERE p.status = 'aprovado' AND p.comissao_paga_em IS NULL AND p.pago_em >= now() - interval '7 days'), 0) AS comissao_em_garantia,
             COALESCE(sum(p.comissao_centavos) FILTER (WHERE p.comissao_paga_em IS NOT NULL), 0) AS comissao_paga
        FROM afiliados a LEFT JOIN pedidos p ON p.afiliado_id = a.id GROUP BY a.id ORDER BY receita DESC, a.criado_em DESC`) });
  });
  r.post('/afiliados', async (req, res) => {
    const b = req.body || {};
    const codigo = String(b.codigo || '').trim().toUpperCase();
    const comissao = Number(b.comissaoPercentual ?? 20);
    if (String(b.nome || '').trim().length < 2) return res.status(400).json({ erro: 'Informe o nome.' });
    if (!/^[A-Z0-9_-]{3,30}$/.test(codigo)) return res.status(400).json({ erro: 'Código: 3 a 30 letras, números, hífen ou sublinhado.' });
    if (!(comissao >= 0 && comissao <= 90)) return res.status(400).json({ erro: 'Comissão entre 0% e 90%.' });
    try {
      const a = await banco.um('INSERT INTO afiliados (nome, email, codigo, comissao_percentual, chave_pix) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [String(b.nome).trim(), String(b.email || '').trim(), codigo, comissao, String(b.chavePix || '').trim() || null]);
      await auditar(req, 'criar_afiliado', a.id, { codigo, comissao });
      res.status(201).json({ afiliado: a });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ erro: 'Já existe um afiliado com este código.' });
      throw e;
    }
  });
  // Marca como paga a comissão liberada (vendas aprovadas há mais de 7 dias, fora do prazo de arrependimento).
  r.post('/afiliados/:id/pagar', async (req, res) => {
    const r2 = await banco.um(`
      WITH pagos AS (UPDATE pedidos SET comissao_paga_em = now()
                      WHERE afiliado_id = $1 AND status = 'aprovado' AND comissao_paga_em IS NULL AND pago_em < now() - interval '7 days'
                      RETURNING comissao_centavos)
      SELECT count(*) AS pedidos, COALESCE(sum(comissao_centavos), 0) AS valor FROM pagos`, [req.params.id]).catch(() => null);
    if (!r2) return res.status(404).json({ erro: 'Afiliado não encontrado.' });
    await auditar(req, 'pagar_comissao', req.params.id, r2);
    res.json(r2);
  });

  // ---- Metas do negócio
  r.get('/metas', async (_req, res) => res.json(await resumoMetas(banco)));
  r.put('/metas', async (req, res) => {
    const usuarios = Math.round(Number(req.body?.usuarios));
    const receitaCentavos = Math.round(Number(req.body?.receitaReais) * 100);
    const prazo = req.body?.prazo && /^\d{4}-\d{2}-\d{2}$/.test(req.body.prazo) ? req.body.prazo : null;
    if (!(usuarios > 0 && usuarios < 10_000_000) || !(receitaCentavos > 0 && receitaCentavos < 1e13)) return res.status(400).json({ erro: 'Metas inválidas.' });
    const antes = await lerMetas(banco);
    const valor = { usuarios, receitaCentavos, prazo };
    await banco.consulta(`INSERT INTO configuracoes (chave, valor) VALUES ('metas', $1) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`, [JSON.stringify(valor)]);
    await auditar(req, 'alterar_metas', 'metas', { antes, depois: valor });
    res.json({ metas: valor });
  });

  // ---- Prospecção de escolas médicas: lista oficial + acompanhamento de cada escola.
  r.get('/faculdades', async (req, res) => {
    const crm = new Map((await banco.varios(`SELECT c.*, u.nome AS atualizado_por_nome,
        (SELECT count(*) FROM faculdades_interacoes i WHERE i.curso_id = c.curso_id)::int AS interacoes
      FROM faculdades_crm c LEFT JOIN usuarios u ON u.id = c.atualizado_por`)).map((c) => [c.curso_id, c]));
    const escolas = FACULDADES.escolas.map((e) => ({ ...e, crm: crm.get(e.curso) || null }));
    if (req.query.formato === 'csv') {
      res.type('text/csv; charset=utf-8').attachment('escolas-medicas-prospeccao.csv');
      return res.send('﻿' + csv([['Curso (INEP)', 'Instituição', 'Sigla', 'Categoria', 'Município', 'UF', 'Região', 'Matrículas', 'Concluintes', 'Vagas', 'Status', 'Prioridade', 'Contato', 'Cargo', 'E-mail', 'Telefone', 'Próxima ação', 'Data da próxima ação', 'Visita', 'Cupom', 'Notas'],
        ...escolas.map((e) => [e.curso, e.nome, e.sigla, e.categoria, e.municipio, e.uf, e.regiao, e.matriculas, e.concluintes, e.vagas,
          e.crm?.status || 'nao_contatado', e.crm?.prioridade || 'media', e.crm?.contato_nome, e.crm?.contato_cargo, e.crm?.contato_email, e.crm?.contato_telefone,
          e.crm?.proxima_acao, dataISO(e.crm?.proxima_data), dataISO(e.crm?.visita_data), e.crm?.cupom, e.crm?.notas])]));
    }
    res.json({ fonte: FACULDADES._fonte, ano: FACULDADES.ano, escolas });
  });

  r.get('/faculdades/:curso', async (req, res) => {
    const escola = POR_CURSO.get(Number(req.params.curso));
    if (!escola) return res.status(404).json({ erro: 'Escola não encontrada.' });
    const crm = await banco.um('SELECT * FROM faculdades_crm WHERE curso_id = $1', [escola.curso]);
    const interacoes = await banco.varios(`SELECT i.id, i.tipo, i.texto, i.em, u.nome AS admin FROM faculdades_interacoes i
      LEFT JOIN usuarios u ON u.id = i.admin_id WHERE i.curso_id = $1 ORDER BY i.em DESC LIMIT 100`, [escola.curso]);
    // Outros cursos da mesma instituição (campi em outras cidades).
    const campi = FACULDADES.escolas.filter((e) => e.ies === escola.ies && e.curso !== escola.curso).map((e) => ({ curso: e.curso, municipio: e.municipio, uf: e.uf }));
    res.json({ escola, crm, interacoes, campi });
  });

  r.put('/faculdades/:curso', async (req, res) => {
    const escola = POR_CURSO.get(Number(req.params.curso));
    if (!escola) return res.status(404).json({ erro: 'Escola não encontrada.' });
    const b = req.body || {};
    const v = {};
    for (const c of CAMPOS_CRM) {
      const x = b[c] === undefined || b[c] === null ? null : String(b[c]).trim().slice(0, c === 'notas' ? 4000 : 300);
      v[c] = x === '' ? null : x;
    }
    v.status = v.status || 'nao_contatado';
    v.prioridade = v.prioridade || 'media';
    if (!STATUS_FACULDADE.includes(v.status)) return res.status(400).json({ erro: 'Status inválido.' });
    if (!['alta', 'media', 'baixa'].includes(v.prioridade)) return res.status(400).json({ erro: 'Prioridade inválida.' });
    for (const c of ['proxima_data', 'visita_data']) if (v[c] && !/^\d{4}-\d{2}-\d{2}$/.test(v[c])) return res.status(400).json({ erro: 'Data inválida.' });
    if (v.contato_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.contato_email)) return res.status(400).json({ erro: 'E-mail do contato inválido.' });
    const antes = await banco.um('SELECT status FROM faculdades_crm WHERE curso_id = $1', [escola.curso]);
    const crm = await banco.um(`INSERT INTO faculdades_crm (curso_id, ${CAMPOS_CRM.join(', ')}, atualizado_em, atualizado_por)
      VALUES ($1, ${CAMPOS_CRM.map((_, i) => `$${i + 2}`).join(', ')}, now(), $${CAMPOS_CRM.length + 2})
      ON CONFLICT (curso_id) DO UPDATE SET ${CAMPOS_CRM.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, atualizado_em = now(), atualizado_por = EXCLUDED.atualizado_por
      RETURNING *`, [escola.curso, ...CAMPOS_CRM.map((c) => v[c]), req.usuario.id]);
    if ((antes?.status || 'nao_contatado') !== v.status) await auditar(req, 'faculdade_status', String(escola.curso), { escola: escola.nome, municipio: escola.municipio, de: antes?.status || 'nao_contatado', para: v.status });
    res.json({ crm });
  });

  r.post('/faculdades/:curso/interacoes', async (req, res) => {
    const escola = POR_CURSO.get(Number(req.params.curso));
    if (!escola) return res.status(404).json({ erro: 'Escola não encontrada.' });
    const tipo = String(req.body?.tipo || '');
    const texto = String(req.body?.texto || '').trim().slice(0, 2000);
    if (!TIPOS_INTERACAO.includes(tipo)) return res.status(400).json({ erro: 'Tipo de contato inválido.' });
    if (texto.length < 2) return res.status(400).json({ erro: 'Descreva o contato.' });
    const i = await banco.um('INSERT INTO faculdades_interacoes (curso_id, tipo, texto, admin_id) VALUES ($1, $2, $3, $4) RETURNING id, tipo, texto, em',
      [escola.curso, tipo, texto, req.usuario.id]);
    res.status(201).json({ interacao: i });
  });

  r.get('/auditoria', async (_req, res) => {
    res.json({ eventos: await banco.varios(`SELECT a.*, u.nome AS admin FROM auditoria a LEFT JOIN usuarios u ON u.id = a.admin_id ORDER BY em DESC LIMIT 200`) });
  });

  return r;
}
