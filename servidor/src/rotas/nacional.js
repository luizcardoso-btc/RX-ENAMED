// Simulado nacional gratuito: o aluno faz o caderno da edição dentro da janela de datas, o servidor corrige
// (o navegador nunca decide a nota) e mostra a posição no ranking geral e no ranking por faculdade.
import { Router } from 'express';
import { exigirLogin } from './autenticacao.js';
import { bancoQuestoes, faculdadeValida, listaFaculdades, nomeFaculdade } from '../faculdades.js';
import { relatorioTurma } from '../relatorio-turma.js';
import { hashToken } from '../seguranca.js';

export const MINIMO_FACULDADE = 3; // faculdades com menos participantes não aparecem no ranking (privacidade)
const FOLGA_MS = 2 * 60 * 1000;     // tolerância de rede para a entrega depois do fim do tempo
const LETRAS = /^[A-E]$/;

const situacao = (s, agora = Date.now()) => (agora < new Date(s.inicio).getTime() ? 'em_breve' : agora > new Date(s.fim).getTime() ? 'encerrado' : 'aberto');
const nomeCurto = (n) => { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0] || 'Aluno'; };

/** Corrige o caderno: só questões válidas (não anuladas, com gabarito) contam. */
export function corrigir(ids, respostas, banco) {
  let acertos = 0;
  let total = 0;
  const porArea = {};
  for (const id of ids) {
    const q = banco.porId.get(id);
    if (!q || q.anulada || !q.gabarito) continue;
    total += 1;
    const a = (porArea[q.area] ||= { acertos: 0, total: 0 });
    a.total += 1;
    if (respostas[id] === q.gabarito) { acertos += 1; a.acertos += 1; }
  }
  return { acertos, total, nota: total ? Math.round((acertos / total) * 10000) / 100 : 0, porArea };
}

/** Ranking da edição: posição do aluno, média geral, top 20 e faculdades com participantes suficientes. */
export async function rankingDe(banco, simuladoId, usuarioId = null) {
  const linhas = await banco.varios(`SELECT p.usuario_id, p.nota, p.acertos, p.total, p.faculdade, p.etapa, p.enviado_em, u.nome, u.faculdade_outra
    FROM simulado_participacoes p JOIN usuarios u ON u.id = p.usuario_id
    WHERE p.simulado_id = $1 AND p.enviado_em IS NOT NULL AND p.no_tempo ORDER BY p.nota DESC, p.enviado_em`, [simuladoId]);
  const n = linhas.length;
  const media = n ? linhas.reduce((s, l) => s + Number(l.nota), 0) / n : 0;
  const posicao = usuarioId ? linhas.findIndex((l) => l.usuario_id === usuarioId) + 1 : 0;
  const grupos = new Map();
  for (const l of linhas) {
    if (!l.faculdade || l.faculdade === 'outra') continue;
    const g = grupos.get(l.faculdade) || { faculdade: l.faculdade, nome: nomeFaculdade(l.faculdade), participantes: 0, soma: 0 };
    g.participantes += 1; g.soma += Number(l.nota);
    grupos.set(l.faculdade, g);
  }
  const faculdades = [...grupos.values()].filter((g) => g.participantes >= MINIMO_FACULDADE)
    .map((g) => ({ faculdade: g.faculdade, nome: g.nome, participantes: g.participantes, media: Math.round((g.soma / g.participantes) * 100) / 100 }))
    .sort((a, b) => b.media - a.media);
  return {
    participantes: n,
    media: Math.round(media * 100) / 100,
    posicao: posicao || null,
    percentil: posicao ? Math.round(((n - posicao) / Math.max(n - 1, 1)) * 100) : null,
    top: linhas.slice(0, 20).map((l, i) => ({ posicao: i + 1, nome: nomeCurto(l.nome), faculdade: nomeFaculdade(l.faculdade, l.faculdade_outra), nota: Number(l.nota), voce: l.usuario_id === usuarioId })),
    faculdades,
    minimoFaculdade: MINIMO_FACULDADE,
  };
}

export function rotasNacional({ banco, config, limitar }) {
  const r = Router();
  const limite = async (req, res, next) => (limitar && (await limitar(`nacional:${req.usuario?.id || req.ip}`, 30, 60)) ? res.status(429).json({ erro: 'Muitas tentativas. Espere um minuto.' }) : next());

  // Lista pública de faculdades para o cadastro (Brasil e Paraguai).
  r.get('/faculdades', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=86400').json({ faculdades: listaFaculdades().map(({ codigo, nome, sigla, cidade, pais }) => ({ codigo, nome, sigla, cidade, pais })) });
  });

  // O aluno informa (ou troca) a faculdade e se a coordenação pode ver o desempenho individual dele.
  r.put('/eu/faculdade', exigirLogin, async (req, res) => {
    const faculdade = String(req.body?.faculdade || '');
    if (!faculdadeValida(faculdade)) return res.status(400).json({ erro: 'Escolha a sua faculdade na lista ou marque "Outra".' });
    const outra = faculdade === 'outra' ? String(req.body?.faculdadeOutra || '').trim().slice(0, 160) : null;
    if (faculdade === 'outra' && outra.length < 3) return res.status(400).json({ erro: 'Escreva o nome da sua faculdade.' });
    const compartilhar = req.body?.compartilhar === true;
    await banco.consulta('UPDATE usuarios SET faculdade = $2, faculdade_outra = $3, compartilhar_faculdade = $4 WHERE id = $1', [req.usuario.id, faculdade, outra, compartilhar]);
    res.json({ faculdade, nome: nomeFaculdade(faculdade, outra), compartilhar });
  });

  r.get('/eu/faculdade', exigirLogin, async (req, res) => {
    const u = await banco.um('SELECT faculdade, faculdade_outra, compartilhar_faculdade FROM usuarios WHERE id = $1', [req.usuario.id]);
    res.json({ faculdade: u.faculdade, nome: u.faculdade ? nomeFaculdade(u.faculdade, u.faculdade_outra) : null, faculdadeOutra: u.faculdade_outra, compartilhar: u.compartilhar_faculdade });
  });

  // Edições abertas, próximas e encerradas há até 60 dias, com a participação do aluno (se houver).
  r.get('/nacional', async (req, res) => {
    const lista = await banco.varios(`SELECT id, nome, exame, inicio, fim, duracao_min, jsonb_array_length(questoes) AS questoes,
        (SELECT count(*) FROM simulado_participacoes p WHERE p.simulado_id = s.id AND p.enviado_em IS NOT NULL)::int AS participantes
      FROM simulados_nacionais s WHERE publicado AND fim > now() - interval '60 days' ORDER BY inicio`);
    const minhas = req.usuario ? new Map((await banco.varios('SELECT simulado_id, iniciado_em, enviado_em, nota, acertos, total FROM simulado_participacoes WHERE usuario_id = $1', [req.usuario.id])).map((p) => [p.simulado_id, p])) : new Map();
    res.json({ simulados: lista.map((s) => ({ ...s, situacao: situacao(s), minha: minhas.get(s.id) || null })) });
  });

  // Começa (ou retoma) a prova: devolve o caderno e o horário de início registrado no servidor.
  r.post('/nacional/:id/iniciar', exigirLogin, limite, async (req, res) => {
    const s = /^[0-9a-f-]{36}$/i.test(req.params.id) ? await banco.um('SELECT * FROM simulados_nacionais WHERE id = $1 AND publicado', [req.params.id]) : null;
    if (!s) return res.status(404).json({ erro: 'Simulado não encontrado.' });
    const u = await banco.um('SELECT faculdade, etapa FROM usuarios WHERE id = $1', [req.usuario.id]);
    if (!u.faculdade) return res.status(409).json({ erro: 'Informe a sua faculdade para entrar no ranking.', codigo: 'faculdade' });
    let p = await banco.um('SELECT * FROM simulado_participacoes WHERE simulado_id = $1 AND usuario_id = $2', [s.id, req.usuario.id]);
    if (p?.enviado_em) return res.status(409).json({ erro: 'Você já entregou este simulado.', codigo: 'ja_enviado' });
    if (!p) {
      if (situacao(s) !== 'aberto') return res.status(409).json({ erro: situacao(s) === 'em_breve' ? 'O simulado ainda não abriu.' : 'O simulado já foi encerrado.', codigo: situacao(s) });
      p = await banco.um(`INSERT INTO simulado_participacoes (simulado_id, usuario_id, faculdade, etapa) VALUES ($1, $2, $3, $4)
        ON CONFLICT (simulado_id, usuario_id) DO UPDATE SET simulado_id = EXCLUDED.simulado_id RETURNING *`, [s.id, req.usuario.id, u.faculdade, u.etapa]);
    }
    res.json({ id: s.id, nome: s.nome, exame: s.exame, questoes: s.questoes, duracaoMin: s.duracao_min, iniciadoEm: p.iniciado_em });
  });

  // Entrega: o servidor corrige pelo gabarito oficial e marca se foi dentro do tempo (só esses entram no ranking).
  r.post('/nacional/:id/enviar', exigirLogin, limite, async (req, res) => {
    const s = /^[0-9a-f-]{36}$/i.test(req.params.id) ? await banco.um('SELECT * FROM simulados_nacionais WHERE id = $1', [req.params.id]) : null;
    if (!s) return res.status(404).json({ erro: 'Simulado não encontrado.' });
    const p = await banco.um('SELECT * FROM simulado_participacoes WHERE simulado_id = $1 AND usuario_id = $2', [s.id, req.usuario.id]);
    if (!p) return res.status(409).json({ erro: 'Comece o simulado antes de entregar.' });
    if (p.enviado_em) return res.status(409).json({ erro: 'Você já entregou este simulado.', codigo: 'ja_enviado' });
    const bruto = req.body?.respostas && typeof req.body.respostas === 'object' ? req.body.respostas : {};
    const respostas = {};
    for (const id of s.questoes) if (typeof bruto[id] === 'string' && LETRAS.test(bruto[id])) respostas[id] = bruto[id];
    const c = corrigir(s.questoes, respostas, bancoQuestoes(config));
    const limiteTempo = new Date(p.iniciado_em).getTime() + s.duracao_min * 60000 + FOLGA_MS;
    const noTempo = Date.now() <= Math.min(limiteTempo, new Date(s.fim).getTime() + FOLGA_MS);
    await banco.consulta(`UPDATE simulado_participacoes SET enviado_em = now(), no_tempo = $3, respostas = $4, acertos = $5, total = $6, nota = $7, por_area = $8
      WHERE simulado_id = $1 AND usuario_id = $2`, [s.id, req.usuario.id, noTempo, JSON.stringify(respostas), c.acertos, c.total, c.nota, JSON.stringify(c.porArea)]);
    res.json({ resultado: { ...c, noTempo }, ranking: await rankingDe(banco, s.id, req.usuario.id) });
  });

  r.get('/nacional/:id/ranking', async (req, res) => {
    const s = /^[0-9a-f-]{36}$/i.test(req.params.id) ? await banco.um('SELECT id, nome FROM simulados_nacionais WHERE id = $1 AND publicado', [req.params.id]) : null;
    if (!s) return res.status(404).json({ erro: 'Simulado não encontrado.' });
    const minha = req.usuario ? await banco.um('SELECT nota, acertos, total, no_tempo, por_area, enviado_em FROM simulado_participacoes WHERE simulado_id = $1 AND usuario_id = $2', [s.id, req.usuario.id]) : null;
    res.json({ simulado: s, minha, ranking: await rankingDe(banco, s.id, req.usuario?.id) });
  });

  // Relatório da turma pelo link da coordenação (sem login; o token vale até expirar ou ser revogado).
  r.get('/relatorio/:token', async (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
    const token = String(req.params.token || '');
    const l = /^[A-Za-z0-9_-]{20,200}$/.test(token)
      ? await banco.um('SELECT faculdade, expira_em FROM relatorio_links WHERE token_hash = $1 AND revogado_em IS NULL AND expira_em > now()', [hashToken(token)]) : null;
    if (!l) return res.status(404).json({ erro: 'Este link de relatório não existe, expirou ou foi revogado.' });
    res.json({ relatorio: await relatorioTurma(banco, config, l.faculdade), expiraEm: l.expira_em });
  });

  return r;
}
