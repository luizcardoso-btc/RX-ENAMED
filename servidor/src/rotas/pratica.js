import { Router } from 'express';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { exigirLogin, exigirAdmin } from './autenticacao.js';
import { carregarEstacoes } from '../../../compartilhado/carregar-estacoes.js';
import {
  partePublica, parteCandidato, parteCorrecao, validarEstacao, corrigir, montarCircuito, NIVEIS, ORIGENS,
} from '../../../compartilhado/estacoes.js';
import { responder, revelar, sugerirAvaliacao } from '../../../compartilhado/motor-paciente.js';
import { cotaDaIa, transmitirIa } from '../ia.js';

const MAX_FALAS = 160;
const uuid = /^[0-9a-f-]{36}$/i;

/** Estações (autorais e oficiais) lidas dos arquivos uma vez, na subida do servidor. */
export function carregarAcervo(pastaConteudo) {
  const todas = carregarEstacoes(pastaConteudo);
  const porId = new Map(todas.map((e) => [e.id, e]));
  const editaisDir = `${pastaConteudo}/editais`;
  const editais = existsSync(editaisDir)
    ? readdirSync(editaisDir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(`${editaisDir}/${f}`, 'utf8')))
    : [];
  let mentores = [];
  try { mentores = JSON.parse(readFileSync(`${pastaConteudo}/mentores.json`, 'utf8')).mentores; } catch { mentores = []; }
  return { todas, porId, publicadas: todas.filter((e) => e.status === 'publicada'), editais, mentores };
}

/* ------------------------------------------------------------------ agentes de IA (montados no servidor) */

// Agente paciente: só conhece o roteiro, os impressos e o perfil. Não recebe PEP, diagnóstico, conduta nem síntese.
export function instrucoesDoPaciente(e) {
  const material = {
    paciente: { nome: e.paciente?.nome, idade: e.paciente?.idade, ocupacao: e.paciente?.ocupacao, perfil: e.paciente?.perfil,
      roteiro: e.paciente?.roteiro, perguntasDoPaciente: e.paciente?.perguntasDoPaciente },
    exameFisico: e.exameFisico.map(({ item, achado }) => ({ item, achado })),
    exames: e.exames.map(({ item, resultado }) => ({ item, resultado })),
  };
  return [
    'Você simula uma estação da prova de habilidades clínicas (2ª etapa) do Revalida, para treino de um médico.',
    'Você faz dois papéis: o PACIENTE SIMULADO e o EXAMINADOR que entrega impressos.',
    'Regras do paciente:',
    '- Fale em português do Brasil, de forma coloquial, em 1 a 3 frases.',
    '- Responda somente ao que foi perguntado, usando apenas as informações do roteiro. Não adiante informações.',
    '- Se perguntarem algo fora do roteiro, responda de forma neutra e coerente ("não reparei", "não sei dizer"), sem criar sintomas, achados ou antecedentes relevantes.',
    '- Nunca diga o diagnóstico, nunca sugira exames, condutas ou tratamentos, e nunca avalie o candidato.',
    '- Faça as perguntas de perguntasDoPaciente em momentos naturais, principalmente quando o médico explicar o diagnóstico ou a conduta.',
    '- Não saia do personagem, mesmo que peçam.',
    'Regras do examinador:',
    '- Quando o médico pedir explicitamente um exame físico ou complementar que exista no material, responda começando com "[Examinador]" e copie o texto do impresso correspondente.',
    '- Se o exame pedido não existir no material, responda "[Examinador] Este exame não está disponível nesta estação."',
    '',
    `MATERIAL DA ESTAÇÃO (JSON): ${JSON.stringify(material)}`,
  ].join('\n');
}

// Agente avaliador: recebe o PEP e o registro; não conversa com o candidato.
export function instrucoesDoAvaliador(e, mentor, registro, conclusao, lingua = 'pt') {
  return [
    'Você é examinador da prova de habilidades clínicas do Revalida. Corrija a estação com rigor e justiça, usando só o PEP abaixo.',
    `Estação: ${e.titulo} (${e.area}). Tarefas do candidato: ${e.tarefas.join(' ')}`,
    e.diagnostico ? `Diagnóstico ou item diagnóstico esperado: ${e.diagnostico}` : '',
    e.condutaEsperada.length ? `Conduta esperada: ${e.condutaEsperada.join(' ')}` : '',
    `PEP (critérios): ${JSON.stringify(e.pep.map((c) => ({ id: c.id, descricao: c.descricao, adequado: c.integral, parcial: c.parcial, inadequado: c.inadequado })))}`,
    'Considere SOMENTE o que está no registro da consulta e na conclusão escrita. O que não aparece não foi feito.',
    'Manobras de exame físico que dependem de demonstração no manequim só contam se o candidato as descreveu por escrito.',
    'Para cada critério use "adequado", "parcial" (só se o critério admite parcial) ou "inadequado", com um comentário de até 20 palavras citando a evidência.',
    `Depois escreva uma "devolutiva" de até 90 palavras na voz de ${mentor?.nome || 'um preceptor'}${mentor?.titulo ? `, ${mentor.titulo}` : ''}: comece pelo que foi bem, depois o que mais custou pontos e uma dica prática.`,
    lingua === 'es' ? 'Escreva comentários e devolutiva em espanhol, mantendo em português os termos técnicos da prova.' : 'Escreva em português do Brasil.',
    'Responda somente com JSON: {"itens":[{"id":"c01","nivel":"parcial","comentario":"..."}],"devolutiva":"..."}',
    '', 'REGISTRO DA CONSULTA:', registro || '(vazio)', '', 'CONCLUSÃO ESCRITA PELO CANDIDATO:', conclusao || '(não escreveu)',
  ].filter((x) => x !== '').join('\n');
}

const QUEM = { candidato: 'Médico', paciente: 'Paciente', examinador: 'Examinador' };
const registroEmTexto = (falas) => falas.filter((f) => QUEM[f.de]).map((f) => `${QUEM[f.de]}: ${String(f.texto).slice(0, 1500)}`).join('\n').slice(-60_000);

function lerFalas(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.slice(-MAX_FALAS).filter((f) => f && QUEM[f.de] && typeof f.texto === 'string')
    .map((f) => ({ de: f.de, texto: f.texto.slice(0, 2000) }));
}

/* ------------------------------------------------------------------ rotas */

export function rotasPratica({ banco, config, limitar, cliente, acervo }) {
  const r = Router();
  const admin = exigirAdmin(config);
  const visivel = (e, usuario) => e && (e.status === 'publicada' || usuario?.papel === 'admin');

  async function tentativaDo(req, res) {
    if (!uuid.test(req.params.id)) { res.status(404).json({ erro: 'Tentativa não encontrada.' }); return null; }
    const t = await banco.um('SELECT * FROM pratica_tentativas WHERE id = $1 AND usuario_id = $2', [req.params.id, req.usuario.id]);
    if (!t) { res.status(404).json({ erro: 'Tentativa não encontrada.' }); return null; }
    const e = acervo.porId.get(t.estacao_id);
    if (!e) { res.status(410).json({ erro: 'Esta estação não está mais disponível.' }); return null; }
    return { t, e };
  }

  r.get('/pratica/estacoes', exigirLogin, (req, res) => {
    res.json({ estacoes: acervo.publicadas.map(partePublica), editais: acervo.editais, origens: ORIGENS, iaDisponivel: Boolean(cliente) });
  });

  r.get('/pratica/estacoes/:id', exigirLogin, (req, res) => {
    const e = acervo.porId.get(req.params.id);
    if (!visivel(e, req.usuario)) return res.status(404).json({ erro: 'Estação não encontrada.' });
    res.json({ estacao: parteCandidato(e) });
  });

  // Começa uma passagem pela estação. O candidato recebe só o impresso da porta.
  r.post('/pratica/tentativas', exigirLogin, async (req, res) => {
    const { estacaoId, modo, simuladoId } = req.body || {};
    const e = acervo.porId.get(String(estacaoId || ''));
    if (!visivel(e, req.usuario)) return res.status(404).json({ erro: 'Estação não encontrada.' });
    if (!['gratuito', 'roteiro', 'ia'].includes(modo)) return res.status(400).json({ erro: 'Modo inválido.' });
    if ((modo === 'gratuito' || modo === 'roteiro') && !e.paciente?.roteiro?.length) return res.status(400).json({ erro: 'Esta estação não tem roteiro do paciente; treine em dupla.' });
    if (modo === 'ia' && !cliente) return res.status(503).json({ erro: 'A IA não está ativa. Use o paciente gratuito.', codigo: 'sampling_disabled' });
    if (await limitar(`pratica-inicio:${req.usuario.id}`, 60, 3600)) return res.status(429).json({ erro: 'Muitas estações em pouco tempo. Espere um pouco.' });
    let simulado = null;
    if (simuladoId) {
      if (!uuid.test(simuladoId)) return res.status(400).json({ erro: 'Simulado inválido.' });
      simulado = await banco.um('SELECT id FROM pratica_simulados WHERE id = $1 AND usuario_id = $2', [simuladoId, req.usuario.id]);
      if (!simulado) return res.status(404).json({ erro: 'Simulado não encontrado.' });
    }
    const t = await banco.um(`INSERT INTO pratica_tentativas (usuario_id, estacao_id, estacao_versao, modo, simulado_id)
      VALUES ($1, $2, $3, $4, $5) RETURNING id, iniciada_em`, [req.usuario.id, e.id, e.versao, modo, simulado?.id || null]);
    res.status(201).json({ id: t.id, iniciadaEm: t.iniciada_em, estacao: parteCandidato(e) });
  });

  // Motor gratuito: a fala do médico e a resposta do paciente ou do examinador, pelo roteiro (sem IA).
  r.post('/pratica/tentativas/:id/fala', exigirLogin, async (req, res) => {
    const x = await tentativaDo(req, res);
    if (!x) return;
    const { t, e } = x;
    if (t.encerrada_em) return res.status(409).json({ erro: 'A estação já foi encerrada.' });
    const texto = String(req.body?.texto || '').trim().slice(0, 600);
    if (!texto) return res.status(400).json({ erro: 'Escreva a sua fala.' });
    if (await limitar(`pratica-fala:${req.usuario.id}`, 90, 60)) return res.status(429).json({ erro: 'Muitas mensagens em pouco tempo.' });
    const revelados = new Set(t.revelados);
    const resposta = responder(e, texto, revelados);
    for (const k of resposta.chaves || (resposta.chave ? [resposta.chave] : [])) revelados.add(k);
    const falas = [...t.falas, { de: 'candidato', texto }, { de: resposta.de, texto: resposta.texto }].slice(-MAX_FALAS);
    await banco.consulta('UPDATE pratica_tentativas SET falas = $2, revelados = $3 WHERE id = $1', [t.id, JSON.stringify(falas), JSON.stringify([...revelados])]);
    res.json({ de: resposta.de, texto: resposta.texto, chave: resposta.chave || null, rotulo: resposta.rotulo || null, imagem: resposta.imagem || null });
  });

  // Modo roteiro: o médico escolhe o que perguntar ou pedir numa lista (só os nomes chegam ao navegador).
  r.post('/pratica/tentativas/:id/revelar', exigirLogin, async (req, res) => {
    const x = await tentativaDo(req, res);
    if (!x) return;
    const { t, e } = x;
    if (t.encerrada_em) return res.status(409).json({ erro: 'A estação já foi encerrada.' });
    const chave = String(req.body?.chave || '');
    const item = revelar(e, chave);
    if (!item) return res.status(400).json({ erro: 'Item inexistente.' });
    const revelados = [...new Set([...t.revelados, chave])];
    const pergunta = item.de === 'paciente' ? `Pergunta sobre: ${item.rotulo.toLowerCase()}` : `Solicita: ${item.rotulo}`;
    const falas = [...t.falas, { de: 'candidato', texto: pergunta }, { de: item.de, texto: item.texto }].slice(-MAX_FALAS);
    await banco.consulta('UPDATE pratica_tentativas SET falas = $2, revelados = $3 WHERE id = $1', [t.id, JSON.stringify(falas), JSON.stringify(revelados)]);
    res.json({ ...item, pergunta });
  });

  // Agente paciente por IA (opcional, só com chave configurada). As instruções são montadas aqui, nunca no navegador.
  r.post('/pratica/tentativas/:id/ia/paciente', exigirLogin, async (req, res) => {
    if (!cliente) return res.status(503).json({ erro: 'A IA não está ativa. Use o paciente gratuito.', codigo: 'sampling_disabled' });
    const x = await tentativaDo(req, res);
    if (!x) return;
    const { t, e } = x;
    if (t.encerrada_em) return res.status(409).json({ erro: 'A estação já foi encerrada.' });
    const falas = lerFalas(req.body?.falas);
    if (!falas.length || falas.at(-1).de !== 'candidato') return res.status(400).json({ erro: 'A última fala precisa ser do médico.' });
    const bloqueio = await cotaDaIa({ banco, config, limitar, usuario: req.usuario });
    if (bloqueio) return res.status(bloqueio.status).json(bloqueio.corpo);
    const mensagens = [];
    for (const f of falas) {
      const role = f.de === 'candidato' ? 'user' : 'assistant';
      const content = f.de === 'examinador' ? `[Examinador] ${f.texto}` : f.texto;
      if (mensagens.at(-1)?.role === role) mensagens.at(-1).content += `\n${content}`;
      else mensagens.push({ role, content });
    }
    if (mensagens[0].role !== 'user') mensagens.unshift({ role: 'user', content: '(início da estação)' });
    await banco.consulta('UPDATE pratica_tentativas SET falas = $2 WHERE id = $1', [t.id, JSON.stringify(falas)]);
    await transmitirIa({ cliente, config, res, sistema: instrucoesDoPaciente(e), mensagens, esforco: 'low' });
  });

  // Encerra a estação: só agora o candidato recebe o PEP, o roteiro e o material de correção.
  r.post('/pratica/tentativas/:id/encerrar', exigirLogin, async (req, res) => {
    const x = await tentativaDo(req, res);
    if (!x) return;
    const { t, e } = x;
    const conclusao = String(req.body?.conclusao || '').slice(0, 6000);
    const falasIa = t.modo === 'ia' ? lerFalas(req.body?.falas) : null;
    const falas = falasIa?.length ? falasIa : t.falas;
    if (!t.encerrada_em) {
      await banco.consulta('UPDATE pratica_tentativas SET encerrada_em = now(), conclusao = $2, falas = $3 WHERE id = $1', [t.id, conclusao, JSON.stringify(falas)]);
    }
    const sugestao = sugerirAvaliacao(e, { falas: falas.filter((f) => f.de === 'candidato').map((f) => f.texto), conclusao: t.encerrada_em ? t.conclusao : conclusao, revelados: t.revelados });
    res.json({ correcao: parteCorrecao(e), sugestao, iaDisponivel: Boolean(cliente) });
  });

  // Agente avaliador por IA: corrige pelo PEP a partir do registro salvo. Só depois de encerrar.
  r.post('/pratica/tentativas/:id/ia/avaliar', exigirLogin, async (req, res) => {
    if (!cliente) return res.status(503).json({ erro: 'A IA não está ativa. Faça a autoavaliação.', codigo: 'sampling_disabled' });
    const x = await tentativaDo(req, res);
    if (!x) return;
    const { t, e } = x;
    if (!t.encerrada_em) return res.status(409).json({ erro: 'Encerre a estação antes da correção.' });
    const bloqueio = await cotaDaIa({ banco, config, limitar, usuario: req.usuario });
    if (bloqueio) return res.status(bloqueio.status).json(bloqueio.corpo);
    const mentor = acervo.mentores.find((m) => m.id === e.mentor);
    const sistema = instrucoesDoAvaliador(e, mentor, registroEmTexto(t.falas), t.conclusao, req.body?.lingua === 'es' ? 'es' : 'pt');
    await transmitirIa({ cliente, config, res, sistema, mensagens: [{ role: 'user', content: 'Corrija a estação agora.' }], json: true, esforco: 'medium' });
  });

  // Grava o resultado (níveis por critério). A nota é sempre calculada aqui, pelo PEP.
  r.post('/pratica/tentativas/:id/resultado', exigirLogin, async (req, res) => {
    const x = await tentativaDo(req, res);
    if (!x) return;
    const { t, e } = x;
    if (!t.encerrada_em) return res.status(409).json({ erro: 'Encerre a estação antes de gravar a nota.' });
    const niveis = req.body?.niveis && typeof req.body.niveis === 'object' ? req.body.niveis : {};
    for (const c of e.pep) {
      if (niveis[c.id] !== undefined && !NIVEIS[niveis[c.id]]) return res.status(400).json({ erro: `Nível inválido em ${c.id}.` });
      if (niveis[c.id] === 'parcial' && c.pontos.parcial === null) niveis[c.id] = 'inadequado';
    }
    const avaliadoPor = req.body?.avaliadoPor === 'ia' ? 'ia' : 'autoavaliacao';
    const c = corrigir(e, niveis);
    const ja = await banco.um('SELECT id FROM pratica_resultados WHERE tentativa_id = $1', [t.id]);
    if (ja) return res.status(409).json({ erro: 'Esta tentativa já tem nota.' });
    const row = await banco.um(`INSERT INTO pratica_resultados (usuario_id, estacao_id, estacao_versao, area, modo, avaliado_por, tentativa_id, simulado_id, nota, itens, criticos)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, criado_em`,
    [req.usuario.id, e.id, e.versao, e.area, t.modo, avaliadoPor, t.id, t.simulado_id, c.nota, JSON.stringify(c.itens), JSON.stringify(c.criticos)]);
    res.status(201).json({ id: row.id, criadoEm: row.criado_em, ...c });
  });

  r.get('/pratica/resultados', exigirLogin, async (req, res) => {
    const linhas = await banco.varios(`SELECT id, estacao_id, area, modo, avaliado_por, simulado_id, sala_codigo, nota, itens, criticos, criado_em
      FROM pratica_resultados WHERE usuario_id = $1 ORDER BY criado_em DESC LIMIT 400`, [req.usuario.id]);
    res.json({ resultados: linhas.map((l) => ({ ...l, nota: Number(l.nota) })) });
  });

  /* ---------------------------------------------------------------- simulados */

  r.post('/pratica/simulados', exigirLogin, async (req, res) => {
    const quantidade = [1, 5, 10].includes(Number(req.body?.quantidade)) ? Number(req.body.quantidade) : 5;
    const edital = acervo.editais.find((x) => x.id === req.body?.edital) || acervo.editais[0] || { id: 'livre', distribuicao: {}, minutosPorEstacao: 10, blocos: [5, 5] };
    const origem = ['oficial', 'autoral'].includes(req.body?.origem) ? req.body.origem : null;
    const area = typeof req.body?.area === 'string' ? req.body.area : null;
    // Simulado individual usa o paciente gratuito: só entram estações com roteiro.
    const elegiveis = acervo.publicadas.filter((e) => e.paciente?.roteiro?.length && (!origem || e.origem === origem) && (!area || e.area === area));
    if (await limitar(`pratica-simulado:${req.usuario.id}`, 30, 3600)) return res.status(429).json({ erro: 'Muitos simulados em pouco tempo.' });
    const estacoes = montarCircuito(elegiveis, quantidade === 1 ? { distribuicao: {} } : edital, quantidade);
    if (!estacoes.length) return res.status(400).json({ erro: 'Não há estações para esse filtro.' });
    const minutos = Math.min(20, Math.max(5, Number(req.body?.minutos) || edital.minutosPorEstacao || 10));
    const s = await banco.um('INSERT INTO pratica_simulados (usuario_id, edital, estacoes, minutos) VALUES ($1, $2, $3, $4) RETURNING id, criado_em',
      [req.usuario.id, edital.id, JSON.stringify(estacoes.map((e) => e.id)), minutos]);
    const blocos = quantidade === 10 ? edital.blocos || [5, 5] : [estacoes.length];
    res.status(201).json({ id: s.id, edital: edital.id, minutos, blocos, estacoes: estacoes.map(partePublica) });
  });

  r.post('/pratica/simulados/:id/concluir', exigirLogin, async (req, res) => {
    if (!uuid.test(req.params.id)) return res.status(404).json({ erro: 'Simulado não encontrado.' });
    const s = await banco.um('SELECT * FROM pratica_simulados WHERE id = $1 AND usuario_id = $2', [req.params.id, req.usuario.id]);
    if (!s) return res.status(404).json({ erro: 'Simulado não encontrado.' });
    const notas = await banco.varios('SELECT estacao_id, area, nota, criticos FROM pratica_resultados WHERE simulado_id = $1 AND usuario_id = $2', [s.id, req.usuario.id]);
    const total = s.estacoes.length;
    // Estação não feita conta zero, como na prova.
    const media = total ? notas.reduce((x, n) => x + Number(n.nota), 0) / total : 0;
    await banco.consulta('UPDATE pratica_simulados SET concluido_em = coalesce(concluido_em, now()), nota = $2 WHERE id = $1', [s.id, media]);
    res.json({ id: s.id, nota: Math.round(media * 1000) / 1000, feitas: notas.length, total, resultados: notas.map((n) => ({ ...n, nota: Number(n.nota) })) });
  });

  r.get('/pratica/simulados', exigirLogin, async (req, res) => {
    const linhas = await banco.varios('SELECT id, edital, estacoes, minutos, criado_em, concluido_em, nota FROM pratica_simulados WHERE usuario_id = $1 ORDER BY criado_em DESC LIMIT 50', [req.usuario.id]);
    res.json({ simulados: linhas.map((l) => ({ ...l, nota: l.nota === null ? null : Number(l.nota) })) });
  });

  /* ---------------------------------------------------------------- administração do acervo */

  r.get('/admin/estacoes', exigirLogin, admin, (_req, res) => {
    res.json({
      estacoes: acervo.todas.map((e) => ({
        ...partePublica(e), fonte: e.fonte, pendencias: e.pendencias, problemas: validarEstacao(e),
        criteriosPorOrigem: e.pep.reduce((m, c) => ({ ...m, [c.origem]: (m[c.origem] || 0) + 1 }), {}),
        somaPep: Math.round(e.pep.reduce((s, c) => s + c.peso, 0) * 1000) / 1000,
      })),
    });
  });

  r.get('/admin/estacoes/:id', exigirLogin, admin, (req, res) => {
    const e = acervo.porId.get(req.params.id);
    if (!e) return res.status(404).json({ erro: 'Estação não encontrada.' });
    res.json({ estacao: e, problemas: validarEstacao(e) });
  });

  return r;
}
