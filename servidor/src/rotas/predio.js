// Admin › Prédio: o time de marketing da Rx Med (ver src/predio.js). Tudo atrás do login de admin.
import { Router } from 'express';
import { exigirLogin, exigirAdmin } from './autenticacao.js';
import { EQUIPE, AJUSTES_PADRAO, pautaDaSemana, respostasSofia, aprendizadoDavi, hojeBR, segundaDaSemana } from '../predio.js';
import { carregarQuestoesRx } from '../questoes-rx.js';

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const STATUS = ['rascunho', 'aprovada', 'postada', 'descartada'];
const METRICAS = ['alcance', 'curtidas', 'comentarios', 'salvos', 'compartilhamentos', 'visitas_perfil'];

export function rotasPredio({ banco, config, planos }) {
  const r = Router();
  r.use('/admin/predio', exigirLogin, exigirAdmin(config));
  const acervoRx = carregarQuestoesRx(config.arquivoQuestoesRx);

  async function ajustes() {
    const v = (await banco.um(`SELECT valor FROM configuracoes WHERE chave = 'predio'`))?.valor || {};
    return { ...AJUSTES_PADRAO, ...v, horarios: { ...AJUSTES_PADRAO.horarios, ...(v.horarios || {}) } };
  }
  const equipe = (aj) => EQUIPE.map((a) => ({ ...a, nome: String(aj.nomes?.[a.id] || '').trim() || a.nome }));
  const nomeDe = (aj, id) => equipe(aj).find((a) => a.id === id)?.nome;
  const COLS = `p.*, to_char(p.dia, 'YYYY-MM-DD') AS dia, to_char(p.semana, 'YYYY-MM-DD') AS semana`;
  const pecasDe = (segunda) => banco.varios(`SELECT ${COLS} FROM predio_pecas p WHERE p.semana = $1 ORDER BY p.dia, p.slot`, [segunda]);

  // Helena: números do dia e a lista do que o CEO precisa fazer ou aprovar.
  async function resumoHelena(aj) {
    const hoje = hojeBR();
    const segunda = segundaDaSemana(hoje);
    const n = async (sql, p = []) => Number((await banco.um(sql, p))?.n || 0);
    const cad = await banco.um(`SELECT
        count(*) FILTER (WHERE criado_em >= date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') AS hoje,
        count(*) FILTER (WHERE criado_em >= now() - interval '7 days') AS semana
      FROM usuarios WHERE papel = 'aluno'`);
    const ven = await banco.um(`SELECT
        count(*) FILTER (WHERE pago_em >= now() - interval '1 day') AS dia, COALESCE(sum(valor_centavos) FILTER (WHERE pago_em >= now() - interval '1 day'), 0) AS receita_dia,
        count(*) FILTER (WHERE pago_em >= now() - interval '7 days') AS semana, COALESCE(sum(valor_centavos) FILTER (WHERE pago_em >= now() - interval '7 days'), 0) AS receita_semana
      FROM pedidos WHERE status = 'aprovado'`);
    const ativos = await n(`SELECT count(DISTINCT usuario_id) AS n FROM matriculas WHERE status = 'ativa' AND inicio <= now() AND fim > now()`);
    const revisadas = await n('SELECT count(*) AS n FROM revisoes_questoes');
    const pecas = await pecasDe(segunda);
    const deHoje = pecas.filter((p) => p.dia === hoje);
    const eventos = await banco.varios(`SELECT nome, proxima_acao, proxima_data FROM eventos WHERE status NOT IN ('descartado', 'realizado')
      AND proxima_data IS NOT NULL AND proxima_data <= current_date + 3 ORDER BY proxima_data LIMIT 5`).catch(() => []);
    const faculdades = await n(`SELECT count(*) AS n FROM faculdades_crm WHERE proxima_data IS NOT NULL AND proxima_data <= current_date AND status NOT IN ('parceria', 'sem_interesse')`).catch(() => 0);
    const nacional = await banco.um(`SELECT nome, fim FROM simulados_nacionais WHERE inicio <= now() AND fim > now() ORDER BY fim LIMIT 1`).catch(() => null);
    const tarefas = [];
    const add = (titulo, sala, tipo = 'fazer') => tarefas.push({ titulo, sala, tipo });
    if (!pecas.length) add(`Pedir ao ${nomeDe(aj, 'cto')} a pauta desta semana`, 'cto');
    const rasc = pecas.filter((p) => p.status === 'rascunho').length;
    if (rasc) add(`Aprovar ${rasc} peça(s) da semana`, 'cto', 'aprovar');
    for (const p of deHoje.filter((x) => x.status === 'aprovada')) add(`Publicar hoje às ${p.horario || '—'}: ${p.titulo}`, 'social');
    const semMetrica = pecas.filter((p) => p.status === 'postada' && !p.metricas?.alcance && p.dia <= hoje).length;
    if (semMetrica) add(`Anotar as métricas de ${semMetrica} post(s) para o ${nomeDe(aj, 'copy_video')} aprender`, 'social');
    const pendRev = Math.max(0, acervoRx.lista.length - revisadas);
    if (pendRev) add(`${pendRev} questão(ões) inéditas esperando revisão médica`, 'questoes');
    if (faculdades) add(`${faculdades} faculdade(s) com contato marcado para hoje ou atrasado`, 'comercial');
    for (const e of eventos) add(`Evento ${e.nome}: ${e.proxima_acao || 'próxima ação'} até ${new Date(e.proxima_data).toLocaleDateString('pt-BR')}`, 'eventos');
    if (!(aj.provas || []).length) add('Cadastrar as datas das próximas provas (ENAMED e Revalida) nos ajustes do Prédio', 'ajustes');
    return {
      hoje, numeros: { cadastrosHoje: Number(cad.hoje), cadastros7d: Number(cad.semana), vendas24h: Number(ven.dia), receita24h: Number(ven.receita_dia),
        vendas7d: Number(ven.semana), receita7d: Number(ven.receita_semana), alunosAtivos: ativos },
      nacional, tarefas,
    };
  }

  function statusAgentes(aj, pecas, resumo) {
    const c = (f) => pecas.filter(f).length;
    const carrosseis = c((p) => p.formato !== 'reels');
    const prox = (aj.provas || []).filter((p) => p.data >= resumo.hoje).sort((a, b) => a.data.localeCompare(b.data))[0];
    return {
      recepcao: prox ? `${prox.nome} em ${new Date(`${prox.data}T12:00:00Z`).toLocaleDateString('pt-BR')}` : 'Bem-vindo ao Prédio da Rx Med',
      gerente: `${resumo.tarefas.length} tarefa(s) para você hoje`,
      financeiro: `${resumo.numeros.vendas7d} venda(s) em 7 dias`,
      cto: pecas.length ? `Pauta da semana: ${pecas.length} peças, ${c((p) => p.status === 'rascunho')} para aprovar` : 'Sem pauta nesta semana',
      copy_video: `${c((p) => p.formato === 'reels')} roteiro(s) de Reels na semana`,
      copy_imagem: `${carrosseis} carrossel(éis) e stories escritos`,
      imagem: `${c((p) => p.formato !== 'reels' && p.status !== 'descartada')} arte(s) para gerar`,
      social: `${c((p) => p.status === 'postada')} postada(s), ${c((p) => p.status === 'aprovada')} na fila`,
      atendente: 'Respostas prontas atualizadas com os preços',
      comercial: 'Parcerias com coordenações de Medicina',
    };
  }

  r.get('/admin/predio', async (_req, res) => {
    const aj = await ajustes();
    const pecas = await pecasDe(segundaDaSemana(hojeBR()));
    const resumo = await resumoHelena(aj);
    const st = statusAgentes(aj, pecas, resumo);
    res.json({ equipe: equipe(aj).map((a) => ({ ...a, status: st[a.id] })), resumo, ajustes: aj });
  });

  r.put('/admin/predio/ajustes', async (req, res) => {
    const b = req.body || {};
    const aj = await ajustes();
    const novo = { ...aj };
    if (b.nomes && typeof b.nomes === 'object') novo.nomes = Object.fromEntries(EQUIPE.map((a) => [a.id, String(b.nomes[a.id] || '').trim().slice(0, 20)]).filter(([, v]) => v));
    for (const k of ['instagram', 'site', 'palavraChave']) if (typeof b[k] === 'string') novo[k] = b[k].trim().slice(0, 80);
    if (Array.isArray(b.provas)) novo.provas = b.provas.filter((p) => p && DATA.test(p.data) && String(p.nome || '').trim()).slice(0, 6).map((p) => ({ nome: String(p.nome).trim().slice(0, 60), data: p.data }));
    if (b.horarios) {
      const ok = (l) => Array.isArray(l) && l.length && l.every((h) => HORA.test(h));
      if (!ok(b.horarios.feed) || !ok(b.horarios.stories)) return res.status(400).json({ erro: 'Horários no formato HH:MM.' });
      novo.horarios = { feed: b.horarios.feed.slice(0, 3), stories: b.horarios.stories.slice(0, 4) };
    }
    if (!novo.palavraChave) return res.status(400).json({ erro: 'Informe a palavra-chave da chamada.' });
    await banco.consulta(`INSERT INTO configuracoes (chave, valor, atualizado_em) VALUES ('predio', $1, now())
      ON CONFLICT (chave) DO UPDATE SET valor = $1, atualizado_em = now()`, [JSON.stringify(novo)]);
    res.json({ ajustes: novo });
  });

  r.get('/admin/predio/semana', async (req, res) => {
    const segunda = segundaDaSemana(DATA.test(req.query.segunda) ? req.query.segunda : hojeBR());
    res.json({ segunda, pecas: await pecasDe(segunda) });
  });

  // Rafael monta a pauta. Peças aprovadas ou postadas ficam; rascunhos e descartadas são refeitos.
  r.post('/admin/predio/semana', async (req, res) => {
    const segunda = segundaDaSemana(DATA.test(req.body?.segunda) ? req.body.segunda : hojeBR());
    const aj = await ajustes();
    const existentes = await pecasDe(segunda);
    const fixas = existentes.filter((p) => ['aprovada', 'postada'].includes(p.status));
    const usadas = new Set((await banco.varios(`SELECT questao_id FROM predio_pecas WHERE questao_id IS NOT NULL AND NOT (semana = $1 AND status IN ('rascunho', 'descartada'))`, [segunda])).map((x) => x.questao_id));
    const historico = await banco.varios(`SELECT conteudo, metricas FROM predio_pecas WHERE status = 'postada'`);
    const nova = pautaDaSemana(config, { segunda, usadas, ajustes: aj, planos, aprendizado: aprendizadoDavi(historico) })
      .filter((p) => !fixas.some((f) => f.dia === p.dia && f.slot === p.slot));
    await banco.transacao(async (t) => {
      await t.consulta(`DELETE FROM predio_pecas WHERE semana = $1 AND status IN ('rascunho', 'descartada')`, [segunda]);
      for (const p of nova) {
        await t.consulta(`INSERT INTO predio_pecas (semana, dia, slot, formato, pilar, titulo, agente, conteudo, horario, questao_id, atualizado_por)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [segunda, p.dia, p.slot, p.formato, p.pilar, p.titulo, p.agente, JSON.stringify(p.conteudo), p.horario, p.conteudo.questaoId || null, req.usuario.id]);
      }
    });
    res.status(201).json({ segunda, pecas: await pecasDe(segunda) });
  });

  r.patch('/admin/predio/pecas/:id', async (req, res) => {
    const p = await banco.um(`SELECT ${COLS} FROM predio_pecas p WHERE p.id = $1`, [req.params.id]).catch(() => null);
    if (!p) return res.status(404).json({ erro: 'Peça não encontrada.' });
    const b = req.body || {};
    const campos = {};
    if (b.status !== undefined) { if (!STATUS.includes(b.status)) return res.status(400).json({ erro: 'Situação inválida.' }); campos.status = b.status; }
    if (b.horario !== undefined) { if (!HORA.test(b.horario)) return res.status(400).json({ erro: 'Horário no formato HH:MM.' }); campos.horario = b.horario; }
    if (b.link !== undefined) {
      const link = String(b.link).trim();
      if (link && !/^https:\/\/(www\.)?(instagram\.com|tiktok\.com|youtube\.com|youtu\.be)\//.test(link)) return res.status(400).json({ erro: 'Use o link do post (Instagram, TikTok ou YouTube).' });
      campos.link = link || null;
    }
    if (b.metricas !== undefined) campos.metricas = JSON.stringify(Object.fromEntries(METRICAS.map((k) => [k, Math.max(0, Math.floor(Number(b.metricas?.[k]) || 0))])));
    if (b.legenda !== undefined || b.slides !== undefined || b.roteiro !== undefined) {
      const c = { ...p.conteudo };
      if (typeof b.legenda === 'string') c.legenda = b.legenda.slice(0, 2200);
      if (Array.isArray(b.slides)) c.slides = b.slides.slice(0, 12).map((s) => ({ ...s, titulo: String(s.titulo || '').slice(0, 140), texto: String(s.texto || '').slice(0, 700), itens: Array.isArray(s.itens) ? s.itens.slice(0, 6).map((x) => String(x).slice(0, 200)) : undefined }));
      if (Array.isArray(b.roteiro)) c.roteiro = b.roteiro.slice(0, 10).map((x) => ({ tempo: String(x.tempo || '').slice(0, 20), fala: String(x.fala || '').slice(0, 500), tela: String(x.tela || '').slice(0, 200) }));
      campos.conteudo = JSON.stringify(c);
    }
    if (campos.status === 'postada' && !(campos.link ?? p.link)) return res.status(400).json({ erro: 'Cole o link do post para marcar como postada.' });
    const chaves = Object.keys(campos);
    if (!chaves.length) return res.status(400).json({ erro: 'Nada para atualizar.' });
    const sets = chaves.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const nova = await banco.um(`UPDATE predio_pecas p SET ${sets}, atualizado_em = now(), atualizado_por = $${chaves.length + 2} WHERE p.id = $1 RETURNING ${COLS}`,
      [p.id, ...chaves.map((k) => campos[k]), req.usuario.id]);
    res.json({ peca: nova });
  });

  r.get('/admin/predio/sofia', async (_req, res) => res.json({ respostas: respostasSofia(planos, await ajustes()) }));

  r.get('/admin/predio/davi', async (_req, res) => {
    const historico = await banco.varios(`SELECT titulo, pilar, conteudo, metricas, link, to_char(dia, 'YYYY-MM-DD') AS dia FROM predio_pecas WHERE status = 'postada' ORDER BY dia DESC LIMIT 60`);
    res.json({ aprendizado: aprendizadoDavi(historico), postados: historico.map((p) => ({ titulo: p.titulo, pilar: p.pilar, dia: p.dia, link: p.link, metricas: p.metricas, tipoGancho: p.conteudo?.tipoGancho || null })) });
  });

  r.get('/admin/predio/financeiro', async (_req, res) => {
    const mes = await banco.um(`SELECT count(*) AS vendas, COALESCE(sum(valor_centavos), 0) AS receita FROM pedidos
      WHERE status = 'aprovado' AND pago_em >= date_trunc('month', now())`);
    const anterior = await banco.um(`SELECT count(*) AS vendas, COALESCE(sum(valor_centavos), 0) AS receita FROM pedidos
      WHERE status = 'aprovado' AND pago_em >= date_trunc('month', now()) - interval '1 month' AND pago_em < date_trunc('month', now())`);
    const porPlano = await banco.varios(`SELECT plano_id AS plano, count(*) AS vendas, sum(valor_centavos) AS receita FROM pedidos
      WHERE status = 'aprovado' AND pago_em >= now() - interval '90 days' GROUP BY plano_id ORDER BY sum(valor_centavos) DESC`);
    const reemb = await banco.um(`SELECT count(*) AS n, COALESCE(sum(valor_centavos), 0) AS valor FROM pedidos WHERE status = 'reembolsado' AND atualizado_em >= now() - interval '30 days'`);
    const ticket = Number(mes.vendas) ? Math.round(Number(mes.receita) / Number(mes.vendas)) : 0;
    res.json({ mes: { vendas: Number(mes.vendas), receita: Number(mes.receita), ticket }, anterior: { vendas: Number(anterior.vendas), receita: Number(anterior.receita) },
      porPlano: porPlano.map((p) => ({ plano: planos.porId[p.plano]?.nome || p.plano, vendas: Number(p.vendas), receita: Number(p.receita) })),
      reembolsos30d: { n: Number(reemb.n), valor: Number(reemb.valor) } });
  });

  r.get('/admin/predio/jade', async (_req, res) => {
    const lista = await banco.varios(`SELECT curso_id, status, prioridade, contato_nome, proxima_acao, proxima_data FROM faculdades_crm
      WHERE status NOT IN ('parceria', 'sem_interesse') AND proxima_data IS NOT NULL ORDER BY proxima_data LIMIT 20`).catch(() => []);
    const porStatus = await banco.varios('SELECT status, count(*) AS n FROM faculdades_crm GROUP BY status').catch(() => []);
    res.json({ proximos: lista, porStatus: Object.fromEntries(porStatus.map((s) => [s.status, Number(s.n)])) });
  });

  return r;
}
