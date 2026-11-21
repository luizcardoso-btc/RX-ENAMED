// Revisão médica das questões autorais e importadas (Admin › Revisão de questões) e entrega das aprovadas aos alunos.
import { Router } from 'express';
import { exigirLogin, exigirAdmin } from './autenticacao.js';
import { carregarQuestoesRx, questaoParaAluno } from '../questoes-rx.js';

const STATUS = ['pendente', 'aprovada', 'corrigir', 'reprovada'];
const POR_PAGINA = 20;

export function rotasQuestoesRx({ banco, config }) {
  const r = Router();
  const acervo = carregarQuestoesRx(config.arquivoQuestoesRx);
  const admin = exigirAdmin(config);
  let cache = null; // aprovadas, prontas para o aluno; refeito a cada decisão

  async function aprovadas() {
    if (cache) return cache;
    const revs = await banco.varios(`SELECT * FROM revisoes_questoes WHERE status = 'aprovada'`);
    cache = revs.filter((rv) => acervo.porId.has(rv.questao_id)).map((rv) => questaoParaAluno(acervo.porId.get(rv.questao_id), rv));
    return cache;
  }

  r.get('/questoes/extras', exigirLogin, async (_req, res) => {
    res.set('Cache-Control', 'private, max-age=300');
    res.json({ questoes: await aprovadas() });
  });

  r.get('/admin/questoes-rx', exigirLogin, admin, async (req, res) => {
    const status = STATUS.includes(req.query.status) ? req.query.status : 'pendente';
    const area = String(req.query.area || '');
    const pagina = Math.max(1, Number(req.query.pagina) || 1);
    const revs = new Map((await banco.varios('SELECT * FROM revisoes_questoes')).map((rv) => [rv.questao_id, rv]));
    const contagem = Object.fromEntries(STATUS.map((s) => [s, 0]));
    const filtradas = [];
    for (const q of acervo.lista) {
      const st = revs.get(q.id)?.status || 'pendente';
      contagem[st] += 1;
      if (st === status && (!area || q.area === area)) filtradas.push({ ...q, revisaoRx: revs.get(q.id) || null });
    }
    res.json({ total: acervo.lista.length, contagem, filtradas: filtradas.length, pagina, porPagina: POR_PAGINA,
      areas: [...new Set(acervo.lista.map((q) => q.area))], questoes: filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA) });
  });

  r.post('/admin/questoes-rx/:id', exigirLogin, admin, async (req, res) => {
    const q = acervo.porId.get(req.params.id);
    if (!q) return res.status(404).json({ erro: 'Questão não encontrada.' });
    const { acao, gabarito, revisor, crm, observacao } = req.body || {};
    const status = { aprovar: 'aprovada', corrigir: 'corrigir', reprovar: 'reprovada' }[acao];
    if (!status) return res.status(400).json({ erro: 'Ação inválida.' });
    const nome = String(revisor || '').trim().slice(0, 120);
    if (nome.length < 3) return res.status(400).json({ erro: 'Informe o nome do médico revisor.' });
    const letra = gabarito ? String(gabarito).toUpperCase() : null;
    if (letra && !'ABCDE'.slice(0, q.alternativas.length).includes(letra)) return res.status(400).json({ erro: 'Gabarito inválido.' });
    const obs = String(observacao || '').trim().slice(0, 2000) || null;
    if (status !== 'aprovada' && !obs) return res.status(400).json({ erro: 'Explique o que precisa mudar na observação.' });
    await banco.consulta(`INSERT INTO revisoes_questoes (questao_id, status, gabarito, revisor, crm, observacao, revisado_por)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (questao_id) DO UPDATE SET status = $2, gabarito = $3, revisor = $4, crm = $5, observacao = $6, revisado_por = $7, revisado_em = now()`,
    [q.id, status, letra && letra !== q.gabarito ? letra : null, nome, String(crm || '').trim().slice(0, 30) || null, obs, req.usuario.id]);
    await banco.consulta(`INSERT INTO auditoria (admin_id, acao, alvo, detalhes) VALUES ($1, 'revisar_questao', NULL, $2)`,
      [req.usuario.id, JSON.stringify({ questao: q.id, status, gabarito: letra })]);
    cache = null;
    res.json({ ok: true, status });
  });

  // Planilha das decisões, para levar ao repositório (coluna revisao/revisor do importador) quando quiser fixar no build.
  r.get('/admin/questoes-rx.csv', exigirLogin, admin, async (_req, res) => {
    const revs = await banco.varios('SELECT * FROM revisoes_questoes ORDER BY revisado_em');
    const campo = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [['questao_id', 'status', 'gabarito_corrigido', 'revisor', 'crm', 'observacao', 'revisado_em'].join(';'),
      ...revs.map((rv) => [rv.questao_id, rv.status, rv.gabarito, rv.revisor, rv.crm, rv.observacao, rv.revisado_em?.toISOString()].map(campo).join(';'))];
    res.type('text/csv; charset=utf-8').attachment('revisao-questoes-rx.csv').send('﻿' + linhas.join('\n'));
  });

  return r;
}
