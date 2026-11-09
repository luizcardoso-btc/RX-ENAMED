import { DIA, inicioDoDia } from './util.js';
import { agendarCartao } from './flashcards.js';

// Revisão espaçada (caixas de Leitner): dias até a próxima revisão em cada caixa.
// Errou: volta para a caixa 1. Acertou na revisão: sobe uma caixa. Passou da 5: questão dominada.
export const INTERVALOS = { 1: 1, 2: 3, 3: 7, 4: 15, 5: 30 };

export const ESTADO_INICIAL = {
  versao: 1,
  respostas: {}, // id -> [{ t, escolha, certa, origem }]
  marcadas: {}, // id -> true
  notas: {}, // id -> texto
  revisao: {}, // id -> { caixa, proxima }
  simulados: [], // resultados finalizados, mais recente primeiro
  simuladoAtivo: null,
  simuladosIniciados: [], // momentos em que cada simulado começou (limite do plano gratuito)
  praticas: {}, // estacaoId -> [{ t, nota, modo, itens }]
  flashcards: {}, // cartaoId -> { intervalo, facilidade, proxima, vistos, ultima }
  aulas: {}, // aulaId -> momento em que a aula foi concluída
  casosClinicos: [], // simulador clínico com IA: [{ em, area, diagnostico, nota }], mais recente primeiro
  desafios: {}, // 'AAAA-MM-DD' -> { concluido, feitas, acertos } (desafio diário)
  trilha: { dataProva: '', metaDiaria: 20, plano: null, rodada: 0 }, // plano: { dia, criadoEm, itens: [{ id, tipo, motivo }] }
};

export function hidratar(salvo) {
  if (!salvo || salvo.versao !== 1) return ESTADO_INICIAL;
  return { ...ESTADO_INICIAL, ...salvo, trilha: { ...ESTADO_INICIAL.trilha, ...salvo.trilha } };
}

function agendar(revisao, id, certa, origem, agora) {
  const atual = revisao[id];
  const proxima = (caixa) => inicioDoDia(agora) + INTERVALOS[caixa] * DIA;
  if (!certa) return { ...revisao, [id]: { caixa: 1, proxima: proxima(1) } };
  if (origem !== 'revisao' || !atual) return revisao;
  const caixa = atual.caixa + 1;
  if (caixa > 5) {
    const { [id]: _, ...resto } = revisao;
    return resto;
  }
  return { ...revisao, [id]: { caixa, proxima: proxima(caixa) } };
}

function registrar(estado, id, escolha, certa, origem, t) {
  return {
    ...estado,
    respostas: { ...estado.respostas, [id]: [...(estado.respostas[id] || []), { t, escolha, certa, origem }] },
    revisao: agendar(estado.revisao, id, certa, origem, t),
  };
}

export function reducer(estado, acao) {
  switch (acao.tipo) {
    case 'responder':
      return registrar(estado, acao.id, acao.escolha, acao.certa, acao.origem, Date.now());
    case 'marcar': {
      const { [acao.id]: marcada, ...resto } = estado.marcadas;
      return { ...estado, marcadas: marcada ? resto : { ...resto, [acao.id]: true } };
    }
    case 'nota': {
      const { [acao.id]: _, ...resto } = estado.notas;
      return { ...estado, notas: acao.texto.trim() ? { ...resto, [acao.id]: acao.texto } : resto };
    }
    case 'iniciarSimulado':
      if (acao.simulado.tipo === 'nacional') return { ...estado, simuladoAtivo: acao.simulado };
      return { ...estado, simuladoAtivo: acao.simulado, simuladosIniciados: [...(estado.simuladosIniciados || []), acao.simulado.inicio].slice(-50) };
    case 'atualizarSimulado':
      return estado.simuladoAtivo ? { ...estado, simuladoAtivo: { ...estado.simuladoAtivo, ...acao.dados } } : estado;
    case 'descartarSimulado':
      return { ...estado, simuladoAtivo: null };
    case 'finalizarSimulado': {
      const { resultado, corretas } = acao;
      let novo = { ...estado, simuladoAtivo: null, simulados: [resultado, ...estado.simulados] };
      for (const [id, escolha] of Object.entries(resultado.respostas)) {
        if (id in corretas) novo = registrar(novo, id, escolha, escolha === corretas[id], 'simulado', resultado.fim);
      }
      return novo;
    }
    case 'avaliarCartao':
      return { ...estado, flashcards: { ...estado.flashcards, [acao.id]: agendarCartao(estado.flashcards[acao.id], acao.nota) } };
    case 'concluirAula':
      return { ...estado, aulas: { ...estado.aulas, [acao.id]: acao.feita ? Date.now() : undefined } };
    case 'registrarPratica':
      return { ...estado, praticas: { ...estado.praticas, [acao.id]: [...(estado.praticas[acao.id] || []), acao.resultado] } };
    case 'simulacaoClinica':
      return { ...estado, casosClinicos: [acao.registro, ...(estado.casosClinicos || [])].slice(0, 100) };
    case 'concluirDesafio':
      if (estado.desafios?.[acao.dia]?.concluido) return estado;
      return { ...estado, desafios: { ...(estado.desafios || {}), [acao.dia]: { concluido: Date.now(), feitas: acao.feitas, acertos: acao.acertos } } };
    case 'configurarTrilha':
      return { ...estado, trilha: { ...estado.trilha, ...acao.dados } };
    case 'salvarPlano':
      return { ...estado, trilha: { ...estado.trilha, plano: acao.plano } };
    case 'restaurar':
      return hidratar(acao.estado);
    case 'zerar':
      return ESTADO_INICIAL;
    default:
      return estado;
  }
}

export const ultimaResposta = (estado, id) => {
  const r = estado.respostas[id];
  return r ? r[r.length - 1] : null;
};

export function revisoesPendentes(estado, agora = Date.now()) {
  return Object.entries(estado.revisao)
    .filter(([, r]) => r.proxima <= agora)
    .sort((a, b) => a[1].proxima - b[1].proxima)
    .map(([id]) => id);
}

/** Desempenho agregado pela última resposta de cada questão. */
export function desempenho(estado, questoes, chave) {
  const grupos = {};
  for (const q of questoes) {
    const r = ultimaResposta(estado, q.id);
    const k = typeof chave === 'function' ? chave(q) : q[chave];
    const g = (grupos[k] ||= { chave: k, total: 0, respondidas: 0, certas: 0 });
    g.total++;
    if (r) {
      g.respondidas++;
      if (r.certa) g.certas++;
    }
  }
  return Object.values(grupos);
}

/** Dias seguidos (até hoje ou ontem) com pelo menos uma resposta. */
export function sequenciaDeDias(estado) {
  const dias = new Set();
  for (const lista of Object.values(estado.respostas)) for (const r of lista) dias.add(inicioDoDia(r.t));
  let dia = inicioDoDia();
  if (!dias.has(dia)) dia -= DIA;
  let n = 0;
  while (dias.has(dia)) {
    n++;
    dia -= DIA;
  }
  return n;
}

// ---- Progresso na conta: junta o que está neste navegador com o que veio do servidor, sem perder nada.
const porChave = (a = {}, b = {}, escolher) => {
  const r = { ...a };
  for (const [k, v] of Object.entries(b)) r[k] = k in r ? escolher(r[k], v) : v;
  return r;
};
const uniao = (lista, chave) => [...new Map(lista.map((x) => [chave(x), x])).values()];

export function mesclarProgresso(localBruto, remotoBruto) {
  const a = hidratar(localBruto);
  if (!remotoBruto) return a;
  const b = hidratar(remotoBruto);
  const t = (x) => x?.criadoEm || 0;
  return {
    ...a,
    respostas: porChave(a.respostas, b.respostas, (x, y) => uniao([...x, ...y], (r) => `${r.t}|${r.escolha}`).sort((p, q) => p.t - q.t)),
    marcadas: { ...b.marcadas, ...a.marcadas },
    notas: { ...b.notas, ...a.notas },
    revisao: porChave(a.revisao, b.revisao, (x, y) => (y.proxima > x.proxima ? y : x)),
    simulados: uniao([...a.simulados, ...b.simulados], (s) => s.id).sort((p, q) => (q.fim || 0) - (p.fim || 0)),
    simuladoAtivo: a.simuladoAtivo || b.simuladoAtivo,
    simuladosIniciados: [...new Set([...(a.simuladosIniciados || []), ...(b.simuladosIniciados || [])])].sort((p, q) => p - q).slice(-50),
    praticas: porChave(a.praticas, b.praticas, (x, y) => uniao([...x, ...y], (r) => r.t).sort((p, q) => p.t - q.t)),
    flashcards: porChave(a.flashcards, b.flashcards, (x, y) => ((y?.ultima || 0) > (x?.ultima || 0) ? y : x)),
    aulas: porChave(a.aulas, b.aulas, (x, y) => (x && y ? Math.max(x, y) : x || y)),
    casosClinicos: uniao([...(a.casosClinicos || []), ...(b.casosClinicos || [])], (c) => c.em).sort((p, q) => q.em - p.em).slice(0, 100),
    desafios: porChave(a.desafios, b.desafios, (x, y) => ((x?.concluido || Infinity) <= (y?.concluido || Infinity) ? x : y)),
    trilha: t(b.trilha.plano) > t(a.trilha.plano) ? b.trilha : a.trilha,
  };
}
