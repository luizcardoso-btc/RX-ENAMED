// Flashcards: cartões de conceito (autorais) e cartões gerados das questões oficiais,
// com repetição espaçada simples inspirada no SM-2.
import { DIA, inicioDoDia } from './util.js';

const MINUTO = 60 * 1000;

export const NOTAS = [
  { id: 'errei', rotulo: 'Errei', tecla: '1', dica: 'volta nesta sessão e amanhã' },
  { id: 'dificil', rotulo: 'Difícil', tecla: '2', dica: 'intervalo curto' },
  { id: 'bom', rotulo: 'Bom', tecla: '3', dica: 'intervalo normal' },
  { id: 'facil', rotulo: 'Fácil', tecla: '4', dica: 'intervalo longo' },
];

/** Novo estado de um cartão depois da nota do aluno. */
export function agendarCartao(atual, nota, agora = Date.now()) {
  const s = atual || { intervalo: 0, facilidade: 2.5, vistos: 0 };
  let { intervalo, facilidade } = s;
  if (nota === 'errei') {
    intervalo = 0;
    facilidade = Math.max(1.3, facilidade - 0.2);
  } else if (nota === 'dificil') {
    intervalo = Math.max(1, Math.round(intervalo * 1.2));
    facilidade = Math.max(1.3, facilidade - 0.15);
  } else if (nota === 'bom') {
    intervalo = intervalo ? Math.max(intervalo + 1, Math.round(intervalo * facilidade)) : 1;
  } else {
    intervalo = intervalo ? Math.max(intervalo + 2, Math.round(intervalo * facilidade * 1.3)) : 4;
    facilidade += 0.15;
  }
  const proxima = nota === 'errei' ? agora + 10 * MINUTO : inicioDoDia(agora) + intervalo * DIA;
  return { intervalo, facilidade, proxima, vistos: s.vistos + 1, ultima: nota, inicio: s.inicio ?? agora };
}

export function situacaoCartao(estado) {
  if (!estado) return 'novo';
  return estado.intervalo >= 21 ? 'dominado' : 'aprendendo';
}

/** Todos os cartões do app: conceitos autorais + um cartão por questão válida. */
export function montarBaralho(banco) {
  const conceitos = banco.cartoes.map((c) => ({ ...c, id: `c:${c.id}`, tipo: 'conceito' }));
  const casos = banco.questoes.filter((q) => !q.anulada).map((q) => ({
    id: `q:${q.id}`, tipo: 'questao', area: q.area, especialidade: q.especialidade, tema: q.tema,
    questaoId: q.id, incidencia: q.incidencia,
  }));
  return [...conceitos, ...casos];
}

export function filaDeEstudo(cartoes, estados, { novos = 20, agora = Date.now() } = {}) {
  const devidos = cartoes.filter((c) => estados[c.id] && estados[c.id].proxima <= agora)
    .sort((a, b) => estados[a.id].proxima - estados[b.id].proxima);
  const ineditos = cartoes.filter((c) => !estados[c.id]).slice(0, novos);
  return [...devidos, ...ineditos];
}
