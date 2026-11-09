// Limites do plano gratuito: questões por dia, simulados por mês, aulas por módulo, flashcards novos e ECG por dia, casos por área.
// Os números vêm de conteudo/planos.json (limitesGratis). Quem tem acesso completo (dono do artefato ou assinatura ativa) não tem limite.
// Atenção: a contagem fica no navegador do aluno; o bloqueio de verdade depende de login e pagamento no servidor.
import { inicioDoDia } from './util.js';

export const LIMITES_PADRAO = { questoesDia: 25, simuladosMes: 1, aulasPorModulo: 1, flashcardsDia: 20, casosPorArea: 1, ecgDia: 5, estacoesPorArea: 1 };
// Recursos que um plano pode liberar (conteudo/planos.json → recursos). O dono do artefato e o admin têm todos.
export const TODOS_RECURSOS = ['teoria', 'estacoes', 'dupla'];

/** Cartões novos começados hoje (o estado do cartão guarda quando foi visto pela primeira vez). */
export function cartoesNovosHoje(progresso, agora = Date.now()) {
  const inicio = inicioDoDia(agora);
  return Object.values(progresso.flashcards || {}).filter((c) => c?.inicio >= inicio).length;
}

/** Primeiros ids de cada área: o que o plano gratuito libera em listas por área. */
export function idsLivresPorArea(itens, porArea = 1) {
  const conta = {}; const livres = new Set();
  for (const i of itens) {
    conta[i.area] = (conta[i.area] || 0) + 1;
    if (conta[i.area] <= porArea) livres.add(i.id);
  }
  return livres;
}

const CHAVE_ECG = 'rx-ecg-dia';
export function ecgsHoje(agora = Date.now()) {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_ECG) || 'null');
    return v?.dia === inicioDoDia(agora) ? v.n : 0;
  } catch { return 0; }
}
export function contarEcg(agora = Date.now()) {
  try { localStorage.setItem(CHAVE_ECG, JSON.stringify({ dia: inicioDoDia(agora), n: ecgsHoje(agora) + 1 })); } catch { /* sem armazenamento */ }
}

export function questoesHoje(progresso, agora = Date.now()) {
  const inicio = inicioDoDia(agora);
  let n = 0;
  for (const lista of Object.values(progresso.respostas)) for (const r of lista) if (r.t >= inicio && r.origem !== 'simulado') n += 1;
  return n;
}

export const inicioDoMes = (agora = Date.now()) => {
  const d = new Date(agora);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};

export function simuladosNoMes(progresso, agora = Date.now()) {
  const inicio = inicioDoMes(agora);
  const vistos = new Set((progresso.simuladosIniciados || []).filter((t) => t >= inicio));
  // O simulado nacional é gratuito e não conta no limite do mês.
  for (const s of progresso.simulados) if (s.tipo !== 'nacional' && (s.inicio ?? s.fim) >= inicio) vistos.add(s.inicio ?? s.fim);
  if (progresso.simuladoAtivo?.tipo !== 'nacional' && progresso.simuladoAtivo?.inicio >= inicio) vistos.add(progresso.simuladoAtivo.inicio);
  return vistos.size;
}

/**
 * O que o aluno pode usar agora. `recursos` vem do plano (teoria, estacoes, dupla); `true` = todos (dono/admin).
 * Sem "teoria": questões, simulados, aulas, flashcards e simulador ficam nos limites do gratuito.
 * Sem "estacoes": só uma estação por área (o servidor confere); sem "dupla": entra em sala, mas não cria.
 */
export function situacaoAcesso(progresso, limites = LIMITES_PADRAO, recursos = [], agora = Date.now()) {
  limites = { ...LIMITES_PADRAO, ...limites };
  const lista = recursos === true ? TODOS_RECURSOS : Array.isArray(recursos) ? recursos : [];
  const extras = { recursos: lista, estacoes: lista.includes('estacoes'), dupla: lista.includes('dupla') };
  if (lista.includes('teoria')) {
    return { completo: true, limites, podeResponder: true, podeSimular: true, questoesRestantes: Infinity, simuladosRestantes: Infinity,
      flashcardsRestantes: Infinity, ecgRestantes: Infinity, ...extras };
  }
  const questoesRestantes = Math.max(0, limites.questoesDia - questoesHoje(progresso, agora));
  const simuladosRestantes = Math.max(0, limites.simuladosMes - simuladosNoMes(progresso, agora));
  const flashcardsRestantes = Math.max(0, limites.flashcardsDia - cartoesNovosHoje(progresso, agora));
  const ecgRestantes = Math.max(0, limites.ecgDia - ecgsHoje(agora));
  return { completo: false, limites, questoesRestantes, simuladosRestantes, flashcardsRestantes, ecgRestantes,
    podeResponder: questoesRestantes > 0, podeSimular: simuladosRestantes > 0, ...extras };
}
