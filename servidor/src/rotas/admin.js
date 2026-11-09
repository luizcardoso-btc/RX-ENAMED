import { Router } from 'express';
import { exigirLogin, exigirAdmin } from './autenticacao.js';
import { aplicarPagamento } from '../pagamentos.js';
import { somarMeses } from '../planos.js';
import { resumoMetas, lerMetas } from '../metas.js';
import { existsSync, readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { bancoQuestoes, nomeFaculdade } from '../faculdades.js';
import { rankingDe } from './nacional.js';
import { relatorioTurma } from '../relatorio-turma.js';
import { novoToken, hashToken } from '../seguranca.js';

const ETAPAS = { 1: '1º ano', 2: '2º ano', 3: '3º ano', 4: '4º ano', 5: '5º ano (internato)', 6: '6º ano (internato)', formado: 'Formado no Brasil', exterior: 'Formado no exterior' };

// Escolas médicas do Brasil (INEP, Censo da Educação Superior) para a prospecção de parcerias.
const ARQ_FACULDADES = new URL('../../../conteudo/faculdades/escolas-medicas.json', import.meta.url).pathname;
const FACULDADES = existsSync(ARQ_FACULDADES) ? JSON.parse(readFileSync(ARQ_FACULDADES, 'utf8')) : { escolas: [] };
const POR_CURSO = new Map(FACULDADES.escolas.map((e) => [e.curso, e]));
const STATUS_FACULDADE = ['nao_contatado', 'pesquisada', 'contato_feito', 'reuniao_agendada', 'visitada', 'proposta_enviada', 'parceria', 'sem_interesse'];
const TIPOS_INTERACAO = ['email', 'ligacao', 'whatsapp', 'reuniao', 'visita', 'proposta', 'outro'];
const CAMPOS_CRM = ['status', 'prioridade', 'contato_nome', 'contato_cargo', 'contato_email', 'contato_telefone', 'proxima_acao', 'proxima_data', 'visita_data', 'cupom', 'notas'];
const dataISO = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

// Faculdades de Medicina do Paraguai (lista editável em conteudo/paraguai/paraguai.json) e eventos para estande.
const ARQ_PARAGUAI = new URL('../../../conteudo/paraguai/paraguai.json', import.meta.url).pathname;
const PARAGUAI = existsSync(ARQ_PARAGUAI) ? JSON.parse(readFileSync(ARQ_PARAGUAI, 'utf8')) : { universidades: [], cidades: {}, estatisticas: [] };
const UNI_POR_ID = new Map(PARAGUAI.universidades.map((u) => [u.id, u]));
const CAMPOS_PARAGUAI = ['status', 'prioridade', 'alunos_brasileiros', 'contato_nome', 'contato_cargo', 'contato_email', 'contato_telefone', 'proxima_acao', 'proxima_data', 'visita_data', 'cupom', 'notas'];
const TIPOS_EVENTO = ['congresso', 'feira', 'academico', 'apresentacao', 'outro'];
const PUBLICOS_EVENTO = ['enamed', 'revalida', 'ambos', 'faculdades'];
const STATUS_EVENTO = ['ideia', 'pesquisado', 'pedido_proposta', 'proposta_recebida', 'fechado', 'realizado', 'descartado'];
const CAMPOS_EVENTO = ['nome', 'tipo', 'publico', 'inicio', 'fim', 'data_texto', 'cidade', 'pais', 'local', 'lat', 'lng', 'site', 'status', 'prioridade', 'custo_centavos', 'publico_estimado',
  'contato_nome', 'contato_email', 'contato_telefone', 'proxima_acao', 'proxima_data', 'notas', 'fonte'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Valida e normaliza o corpo de um evento; devolve { erro } ou { v }.
function lerEvento(b = {}) {
  const v = {};
  for (const c of CAMPOS_EVENTO) {
    const x = b[c] === undefined || b[c] === null ? '' : String(b[c]).trim().slice(0, c === 'notas' ? 4000 : 400);
    v[c] = x === '' ? null : x;
  }
  if (!v.nome || v.nome.length < 3) return { erro: 'Dê um nome ao evento.' };
  v.tipo ||= 'congresso'; v.publico ||= 'ambos'; v.status ||= 'ideia'; v.prioridade ||= 'media'; v.pais ||= 'Brasil';
  if (!TIPOS_EVENTO.includes(v.tipo)) return { erro: 'Tipo de evento inválido.' };
  if (!PUBLICOS_EVENTO.includes(v.publico)) return { erro: 'Público inválido.' };
  if (!STATUS_EVENTO.includes(v.status)) return { erro: 'Status inválido.' };
  if (!['alta', 'media', 'baixa'].includes(v.prioridade)) return { erro: 'Prioridade inválida.' };
  for (const c of ['inicio', 'fim', 'proxima_data']) {
    if (v[c] && /^\d{4}-\d{2}-\d{2}T/.test(v[c])) v[c] = v[c].slice(0, 10);
    if (v[c] && !/^\d{4}-\d{2}-\d{2}$/.test(v[c])) return { erro: 'Data inválida.' };
  }
  if (v.inicio && v.fim && v.fim < v.inicio) return { erro: 'O fim vem antes do início.' };
  for (const c of ['lat', 'lng']) {
    if (v[c] === null) continue;
    const n = Number(v[c].replace(',', '.'));
    if (!Number.isFinite(n) || Math.abs(n) > (c === 'lat' ? 90 : 180)) return { erro: 'Coordenada inválida.' };
    v[c] = n;
  }
  if ((v.lat === null) !== (v.lng === null)) return { erro: 'Informe latitude e longitude juntas.' };
  for (const c of ['custo_centavos', 'publico_estimado']) {
    if (v[c] === null) continue;
    const n = Number(v[c]);
    if (!Number.isInteger(n) || n < 0) return { erro: c === 'custo_centavos' ? 'Custo inválido.' : 'Público estimado inválido.' };
    v[c] = n;
  }
  if (v.site && !/^https?:\/\//i.test(v.site)) return { erro: 'O site deve começar com http:// ou https://.' };
  if (v.contato_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.contato_email)) return { erro: 'E-mail do contato inválido.' };
  return { v };
}

// Caderno do simulado nacional: amostra por área, proporcional ao peso de cada área no banco do exame.
function montarCaderno(lista, exame, quantidade) {
  const validas = lista.filter((q) => !q.anulada && q.gabarito && (exame === 'enamed' || q.exame === 'Revalida'));
  const porArea = new Map();
  for (const q of validas) (porArea.get(q.area) || porArea.set(q.area, []).get(q.area)).push(q);
  const n = Math.min(quantidade, validas.length);
  const cotas = [...porArea.entries()].map(([area, qs]) => ({ area, qs, cota: Math.floor((qs.length / validas.length) * n), resto: ((qs.length / validas.length) * n) % 1 }));
  let faltam = n - cotas.reduce((s, c) => s + c.cota, 0);
  for (const c of [...cotas].sort((a, b) => b.resto - a.resto)) { if (faltam <= 0) break; c.cota += 1; faltam -= 1; }
  const escolhidas = [];
  for (const c of cotas) {
    const qs = [...c.qs];
    for (let i = qs.length - 1; i > 0; i -= 1) { const j = randomInt(i + 1); [qs[i], qs[j]] = [qs[j], qs[i]]; }
    escolhidas.push(...qs.slice(0, c.cota));
  }
  // Ordem da prova: agrupado por área, como no caderno do Inep.
  return escolhidas.sort((a, b) => a.area.localeCompare(b.area) || a.id.localeCompare(b.id)).map((q) => q.id);
}

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
    // A lista mostra também as contas de admin (marcadas), para achar contas de teste; a planilha leva só alunos.
    const filtros = [req.query.formato === 'csv' ? "u.papel = 'aluno'" : 'u.excluido_em IS NULL'];
    if (busca) { params.push(`%${busca.toLowerCase()}%`); filtros.push(`(lower(u.nome) LIKE $${params.length} OR lower(u.email) LIKE $${params.length} OR u.cpf LIKE $${params.length})`); }
    const sql = `SELECT * FROM (SELECT u.id, u.nome, u.email, u.cpf, u.etapa, u.papel, u.criado_em, u.ultimo_acesso, m.plano_id AS plano, m.fim AS acesso_ate,
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
  // Papel da conta: admin vê tudo; para testar os planos, a conta precisa ser de aluno.
  r.post('/alunos/:id/papel', async (req, res) => {
    const papel = req.body?.papel;
    if (!['aluno', 'admin'].includes(papel)) return res.status(400).json({ erro: 'Papel inválido.' });
    const alvo = await banco.um('SELECT id, papel FROM usuarios WHERE id = $1 AND excluido_em IS NULL', [req.params.id]).catch(() => null);
    if (!alvo) return res.status(404).json({ erro: 'Conta não encontrada.' });
    if (alvo.id === req.usuario.id) return res.status(400).json({ erro: 'Você não pode mudar o papel da sua própria conta.' });
    await banco.consulta('UPDATE usuarios SET papel = $2 WHERE id = $1', [alvo.id, papel]);
    await auditar(req, 'alterar_papel', alvo.id, { de: alvo.papel, para: papel });
    res.json({ ok: true, papel });
  });

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

  // ---- Eventos para estande e prospecção no Paraguai.
  const interacoesDe = (tipo, id) => banco.varios(`SELECT i.id, i.tipo, i.texto, i.em, u.nome AS admin FROM prospeccao_interacoes i
    LEFT JOIN usuarios u ON u.id = i.admin_id WHERE i.alvo_tipo = $1 AND i.alvo_id = $2 ORDER BY i.em DESC LIMIT 100`, [tipo, id]);
  const registrarInteracao = async (req, res, alvo, id) => {
    const tipo = String(req.body?.tipo || '');
    const texto = String(req.body?.texto || '').trim().slice(0, 2000);
    if (!TIPOS_INTERACAO.includes(tipo)) return res.status(400).json({ erro: 'Tipo de contato inválido.' });
    if (texto.length < 2) return res.status(400).json({ erro: 'Descreva o contato.' });
    const i = await banco.um('INSERT INTO prospeccao_interacoes (alvo_tipo, alvo_id, tipo, texto, admin_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, tipo, texto, em',
      [alvo, id, tipo, texto, req.usuario.id]);
    res.status(201).json({ interacao: i });
  };

  r.get('/eventos', async (_req, res) => {
    const eventos = await banco.varios(`SELECT e.*, (SELECT count(*) FROM prospeccao_interacoes i WHERE i.alvo_tipo = 'evento' AND i.alvo_id = e.id::text)::int AS interacoes
      FROM eventos e ORDER BY e.inicio NULLS LAST, e.nome`);
    const crm = new Map((await banco.varios('SELECT * FROM paraguai_crm')).map((c) => [c.universidade_id, c]));
    const universidades = PARAGUAI.universidades.map((u) => ({ ...u, crm: crm.get(u.id) || null }));
    res.json({ eventos, paraguai: { universidades, cidades: PARAGUAI.cidades, estatisticas: PARAGUAI.estatisticas, atualizado: PARAGUAI.atualizado } });
  });

  r.post('/eventos', async (req, res) => {
    const { erro, v } = lerEvento(req.body);
    if (erro) return res.status(400).json({ erro });
    const evento = await banco.um(`INSERT INTO eventos (${CAMPOS_EVENTO.join(', ')}, atualizado_por) VALUES (${CAMPOS_EVENTO.map((_, i) => `$${i + 1}`).join(', ')}, $${CAMPOS_EVENTO.length + 1}) RETURNING *`,
      [...CAMPOS_EVENTO.map((c) => v[c]), req.usuario.id]);
    await auditar(req, 'evento_criado', evento.id, { nome: evento.nome });
    res.status(201).json({ evento });
  });

  r.get('/eventos/:id', async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ erro: 'Evento não encontrado.' });
    const evento = await banco.um('SELECT * FROM eventos WHERE id = $1', [req.params.id]);
    if (!evento) return res.status(404).json({ erro: 'Evento não encontrado.' });
    res.json({ evento, interacoes: await interacoesDe('evento', evento.id) });
  });

  r.put('/eventos/:id', async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ erro: 'Evento não encontrado.' });
    const { erro, v } = lerEvento(req.body);
    if (erro) return res.status(400).json({ erro });
    const antes = await banco.um('SELECT status FROM eventos WHERE id = $1', [req.params.id]);
    if (!antes) return res.status(404).json({ erro: 'Evento não encontrado.' });
    const evento = await banco.um(`UPDATE eventos SET ${CAMPOS_EVENTO.map((c, i) => `${c} = $${i + 2}`).join(', ')}, atualizado_em = now(), atualizado_por = $${CAMPOS_EVENTO.length + 2}
      WHERE id = $1 RETURNING *`, [req.params.id, ...CAMPOS_EVENTO.map((c) => v[c]), req.usuario.id]);
    if (antes.status !== evento.status) await auditar(req, 'evento_status', evento.id, { nome: evento.nome, de: antes.status, para: evento.status });
    res.json({ evento });
  });

  r.delete('/eventos/:id', async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ erro: 'Evento não encontrado.' });
    const evento = await banco.um('DELETE FROM eventos WHERE id = $1 RETURNING id, nome', [req.params.id]);
    if (!evento) return res.status(404).json({ erro: 'Evento não encontrado.' });
    await banco.varios("DELETE FROM prospeccao_interacoes WHERE alvo_tipo = 'evento' AND alvo_id = $1", [evento.id]);
    await auditar(req, 'evento_removido', evento.id, { nome: evento.nome });
    res.json({ ok: true });
  });

  r.post('/eventos/:id/interacoes', async (req, res) => {
    if (!UUID.test(req.params.id) || !(await banco.um('SELECT 1 FROM eventos WHERE id = $1', [req.params.id]))) return res.status(404).json({ erro: 'Evento não encontrado.' });
    return registrarInteracao(req, res, 'evento', req.params.id);
  });

  r.get('/paraguai/:id', async (req, res) => {
    const universidade = UNI_POR_ID.get(req.params.id);
    if (!universidade) return res.status(404).json({ erro: 'Universidade não encontrada.' });
    const crm = await banco.um('SELECT * FROM paraguai_crm WHERE universidade_id = $1', [universidade.id]);
    res.json({ universidade, crm, interacoes: await interacoesDe('paraguai', universidade.id) });
  });

  r.put('/paraguai/:id', async (req, res) => {
    const universidade = UNI_POR_ID.get(req.params.id);
    if (!universidade) return res.status(404).json({ erro: 'Universidade não encontrada.' });
    const b = req.body || {};
    const v = {};
    for (const c of CAMPOS_PARAGUAI) {
      const x = b[c] === undefined || b[c] === null ? '' : String(b[c]).trim().slice(0, c === 'notas' ? 4000 : 300);
      v[c] = x === '' ? null : x;
    }
    v.status ||= 'nao_contatado'; v.prioridade ||= 'media';
    if (!STATUS_FACULDADE.includes(v.status)) return res.status(400).json({ erro: 'Status inválido.' });
    if (!['alta', 'media', 'baixa'].includes(v.prioridade)) return res.status(400).json({ erro: 'Prioridade inválida.' });
    for (const c of ['proxima_data', 'visita_data']) if (v[c] && !/^\d{4}-\d{2}-\d{2}$/.test(v[c])) return res.status(400).json({ erro: 'Data inválida.' });
    if (v.contato_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.contato_email)) return res.status(400).json({ erro: 'E-mail do contato inválido.' });
    if (v.alunos_brasileiros !== null) {
      const n = Number(v.alunos_brasileiros);
      if (!Number.isInteger(n) || n < 0) return res.status(400).json({ erro: 'Número de alunos inválido.' });
      v.alunos_brasileiros = n;
    }
    const antes = await banco.um('SELECT status FROM paraguai_crm WHERE universidade_id = $1', [universidade.id]);
    const crm = await banco.um(`INSERT INTO paraguai_crm (universidade_id, ${CAMPOS_PARAGUAI.join(', ')}, atualizado_em, atualizado_por)
      VALUES ($1, ${CAMPOS_PARAGUAI.map((_, i) => `$${i + 2}`).join(', ')}, now(), $${CAMPOS_PARAGUAI.length + 2})
      ON CONFLICT (universidade_id) DO UPDATE SET ${CAMPOS_PARAGUAI.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, atualizado_em = now(), atualizado_por = EXCLUDED.atualizado_por
      RETURNING *`, [universidade.id, ...CAMPOS_PARAGUAI.map((c) => v[c]), req.usuario.id]);
    if ((antes?.status || 'nao_contatado') !== v.status) await auditar(req, 'paraguai_status', universidade.id, { universidade: universidade.nome, de: antes?.status || 'nao_contatado', para: v.status });
    res.json({ crm });
  });

  r.post('/paraguai/:id/interacoes', async (req, res) => {
    if (!UNI_POR_ID.has(req.params.id)) return res.status(404).json({ erro: 'Universidade não encontrada.' });
    return registrarInteracao(req, res, 'paraguai', req.params.id);
  });

  // ---- Simulado nacional: edições, participantes e ranking por faculdade.
  r.get('/nacional', async (_req, res) => {
    const lista = await banco.varios(`SELECT s.id, s.nome, s.exame, s.inicio, s.fim, s.duracao_min, s.publicado, jsonb_array_length(s.questoes) AS questoes,
        count(p.usuario_id) FILTER (WHERE p.enviado_em IS NOT NULL)::int AS entregues, count(p.usuario_id)::int AS iniciados,
        round(avg(p.nota) FILTER (WHERE p.enviado_em IS NOT NULL AND p.no_tempo), 2) AS media
      FROM simulados_nacionais s LEFT JOIN simulado_participacoes p ON p.simulado_id = s.id GROUP BY s.id ORDER BY s.inicio DESC`);
    res.json({ simulados: lista });
  });

  r.post('/nacional', async (req, res) => {
    const b = req.body || {};
    const nome = String(b.nome || '').trim().slice(0, 160);
    const exame = String(b.exame || '');
    const quantidade = Number(b.quantidade || 100);
    const duracao = Number(b.duracaoMin || Math.round(quantidade * 3));
    const inicio = new Date(b.inicio);
    const fim = new Date(b.fim);
    if (nome.length < 3) return res.status(400).json({ erro: 'Dê um nome ao simulado.' });
    if (!['enamed', 'revalida'].includes(exame)) return res.status(400).json({ erro: 'Escolha ENAMED ou Revalida.' });
    if (!Number.isInteger(quantidade) || quantidade < 10 || quantidade > 120) return res.status(400).json({ erro: 'O caderno deve ter de 10 a 120 questões.' });
    if (!Number.isInteger(duracao) || duracao < 10 || duracao > 600) return res.status(400).json({ erro: 'Duração inválida.' });
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || fim <= inicio) return res.status(400).json({ erro: 'Confira o início e o fim da janela.' });
    const questoes = montarCaderno(bancoQuestoes(config).lista, exame, quantidade);
    if (questoes.length < 10) return res.status(500).json({ erro: 'Banco de questões indisponível no servidor.' });
    const s = await banco.um(`INSERT INTO simulados_nacionais (nome, exame, inicio, fim, duracao_min, questoes, criado_por) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [nome, exame, inicio, fim, duracao, JSON.stringify(questoes), req.usuario.id]);
    await auditar(req, 'nacional_criado', s.id, { nome, exame, questoes: questoes.length });
    res.status(201).json({ simulado: s });
  });

  r.put('/nacional/:id', async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ erro: 'Simulado não encontrado.' });
    const b = req.body || {};
    const fim = b.fim ? new Date(b.fim) : null;
    if (fim && Number.isNaN(fim.getTime())) return res.status(400).json({ erro: 'Data de fim inválida.' });
    const s = await banco.um(`UPDATE simulados_nacionais SET publicado = COALESCE($2, publicado), fim = COALESCE($3, fim) WHERE id = $1 AND COALESCE($3, fim) > inicio RETURNING *`,
      [req.params.id, typeof b.publicado === 'boolean' ? b.publicado : null, fim]);
    if (!s) return res.status(400).json({ erro: 'Simulado não encontrado ou fim antes do início.' });
    res.json({ simulado: s });
  });

  r.get('/nacional/:id', async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ erro: 'Simulado não encontrado.' });
    const s = await banco.um('SELECT id, nome, exame, inicio, fim, duracao_min, publicado, jsonb_array_length(questoes) AS questoes FROM simulados_nacionais WHERE id = $1', [req.params.id]);
    if (!s) return res.status(404).json({ erro: 'Simulado não encontrado.' });
    // No admin, todas as faculdades aparecem (sem o mínimo de participantes do ranking público).
    const porFaculdade = await banco.varios(`SELECT faculdade, count(*)::int AS participantes, round(avg(nota), 2) AS media, max(nota) AS melhor
      FROM simulado_participacoes WHERE simulado_id = $1 AND enviado_em IS NOT NULL AND no_tempo GROUP BY faculdade ORDER BY avg(nota) DESC`, [s.id]);
    const ranking = await rankingDe(banco, s.id);
    if (req.query.formato === 'csv') {
      const linhas = await banco.varios(`SELECT u.nome, u.email, p.faculdade, u.faculdade_outra, p.etapa, p.nota, p.acertos, p.total, p.no_tempo, p.enviado_em
        FROM simulado_participacoes p JOIN usuarios u ON u.id = p.usuario_id WHERE p.simulado_id = $1 AND p.enviado_em IS NOT NULL ORDER BY p.nota DESC`, [s.id]);
      res.type('text/csv; charset=utf-8').attachment('simulado-nacional.csv');
      return res.send('﻿' + csv([['Nome', 'E-mail', 'Faculdade', 'Etapa', 'Nota', 'Acertos', 'Questões', 'No tempo', 'Entregue em'],
        ...linhas.map((l) => [l.nome, l.email, nomeFaculdade(l.faculdade, l.faculdade_outra), l.etapa, l.nota, l.acertos, l.total, l.no_tempo ? 'sim' : 'não', l.enviado_em?.toISOString()])]));
    }
    res.json({ simulado: s, ranking, porFaculdade: porFaculdade.map((f) => ({ ...f, nome: nomeFaculdade(f.faculdade) })) });
  });

  // ---- Relatório da turma: faculdades com alunos cadastrados, relatório e link de leitura para a coordenação.
  const FACULDADE = /^(br:[0-9]{1,10}|py:[a-z0-9-]{2,40})$/;
  r.get('/turmas', async (_req, res) => {
    const lista = await banco.varios(`SELECT faculdade, count(*)::int AS alunos, count(*) FILTER (WHERE compartilhar_faculdade)::int AS autorizaram,
        count(*) FILTER (WHERE etapa IN ('1', '2', '3', '4'))::int AS ate_quarto, count(*) FILTER (WHERE etapa IN ('5', '6'))::int AS internato
      FROM usuarios WHERE faculdade IS NOT NULL AND faculdade <> 'outra' AND papel = 'aluno' AND excluido_em IS NULL GROUP BY faculdade ORDER BY count(*) DESC`);
    const links = await banco.varios('SELECT faculdade, count(*)::int AS ativos FROM relatorio_links WHERE revogado_em IS NULL AND expira_em > now() GROUP BY faculdade');
    const porFac = new Map(links.map((l) => [l.faculdade, l.ativos]));
    res.json({ turmas: lista.map((t) => ({ ...t, nome: nomeFaculdade(t.faculdade), links: porFac.get(t.faculdade) || 0 })) });
  });

  r.get('/turmas/:faculdade', async (req, res) => {
    if (!FACULDADE.test(req.params.faculdade)) return res.status(404).json({ erro: 'Faculdade não encontrada.' });
    const relatorio = await relatorioTurma(banco, config, req.params.faculdade);
    const links = await banco.varios('SELECT id, criado_em, expira_em, revogado_em FROM relatorio_links WHERE faculdade = $1 ORDER BY criado_em DESC LIMIT 20', [req.params.faculdade]);
    res.json({ relatorio, links });
  });

  // Link de leitura para a coordenação: o token aparece uma vez só; guardamos apenas o hash.
  r.post('/turmas/:faculdade/link', async (req, res) => {
    if (!FACULDADE.test(req.params.faculdade)) return res.status(404).json({ erro: 'Faculdade não encontrada.' });
    const dias = Math.min(Math.max(Number(req.body?.dias) || 90, 1), 365);
    const token = novoToken();
    const l = await banco.um(`INSERT INTO relatorio_links (token_hash, faculdade, expira_em, criado_por) VALUES ($1, $2, now() + make_interval(days => $3), $4) RETURNING id, expira_em`,
      [hashToken(token), req.params.faculdade, dias, req.usuario.id]);
    await auditar(req, 'relatorio_link', l.id, { faculdade: nomeFaculdade(req.params.faculdade), dias });
    res.status(201).json({ link: `${config.urlBase}/relatorio/${token}`, expiraEm: l.expira_em });
  });

  r.post('/turmas/links/:id/revogar', async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ erro: 'Link não encontrado.' });
    const l = await banco.um('UPDATE relatorio_links SET revogado_em = now() WHERE id = $1 AND revogado_em IS NULL RETURNING id, faculdade', [req.params.id]);
    if (!l) return res.status(404).json({ erro: 'Link não encontrado.' });
    await auditar(req, 'relatorio_link_revogado', l.id, { faculdade: nomeFaculdade(l.faculdade) });
    res.json({ ok: true });
  });

  r.get('/auditoria', async (_req, res) => {
    res.json({ eventos: await banco.varios(`SELECT a.*, u.nome AS admin FROM auditoria a LEFT JOIN usuarios u ON u.id = a.admin_id ORDER BY em DESC LIMIT 200`) });
  });

  return r;
}
