// Módulos do curso: um por grande área e um de SUS e suas diretrizes. Todos ficam abertos: o aluno estuda na
// ordem que quiser. Cada módulo soma questões respondidas, flashcards estudados e aulas concluídas; com 90%
// libera o simulado do módulo.
import { AREAS } from './data.js';
import { ultimaResposta } from './progresso.js';
import { embaralhar } from './util.js';

export const LIMIAR = 0.9;
export const SEGUNDOS_POR_QUESTAO = 180;
export const tipoSimulado = (area) => `modulo:${area}`;

// Especialidades que formam o módulo do SUS (saem do módulo de Saúde Coletiva para não contar duas vezes).
const ESPECIALIDADES_SUS = new Set(['SUS e políticas de saúde', 'Atenção primária', 'Vigilância em saúde']);
const ehSus = (x) => ESPECIALIDADES_SUS.has(x.especialidade);
const MFC = 'Medicina de Família e Comunidade / Saúde Coletiva';
export const MODULO_SUS = { nome: 'SUS e suas diretrizes', curto: 'SUS', cor: 6 };

function definicoes() {
  return [
    ...AREAS.map((a) => ({
      area: a,
      questao: (q) => q.area === a.nome && !(a.nome === MFC && ehSus(q)),
      cartao: (c) => c.area === a.nome && !(a.nome === MFC && ehSus(c)),
      aula: (x) => x.area === a.nome && x.modulo !== 'sus',
    })),
    { area: MODULO_SUS, questao: (q) => q.area === MFC && ehSus(q), cartao: (c) => c.area === MFC && ehSus(c), aula: (x) => x.modulo === 'sus' },
  ];
}

export function modulosDoCurso(banco, progresso) {
  return definicoes().map((d, i) => {
    const questoes = banco.questoes.filter((q) => d.questao(q) && !q.anulada);
    const cartoes = banco.cartoes.filter(d.cartao).map((c) => `c:${c.id}`);
    const aulas = banco.aulas.filter(d.aula);
    const respondidas = questoes.filter((q) => ultimaResposta(progresso, q.id)).length;
    const estudados = cartoes.filter((id) => progresso.flashcards[id]).length;
    const concluidas = aulas.filter((x) => progresso.aulas[x.id]).length;
    const partes = [
      { id: 'questoes', feito: respondidas, total: questoes.length },
      { id: 'flashcards', feito: estudados, total: cartoes.length },
      { id: 'aulas', feito: concluidas, total: aulas.length },
    ].filter((p) => p.total > 0);
    // Média das três partes: aulas e flashcards pesam o mesmo que as questões.
    const fracao = partes.reduce((s, p) => s + p.feito / p.total, 0) / (partes.length || 1);
    const simuladoFeito = progresso.simulados.some((s) => s.tipo === tipoSimulado(d.area.nome));
    return {
      numero: i + 1, area: d.area, questoes, cartoes, aulas, respondidas, estudados, concluidas, partes, fracao,
      liberado: true, simuladoLiberado: fracao >= LIMIAR, simuladoFeito,
      status: fracao >= LIMIAR && simuladoFeito ? 'concluido' : fracao > 0 ? 'andamento' : 'novo',
    };
  });
}

/** Simulado do módulo: todas as questões já praticadas da área e as novas da mesma área ainda não feitas. */
export function montarSimuladoModulo(banco, progresso, modulo) {
  const praticadas = modulo.questoes.filter((q) => ultimaResposta(progresso, q.id));
  const novas = modulo.questoes.filter((q) => !ultimaResposta(progresso, q.id));
  return embaralhar([...praticadas, ...novas]).map((q) => q.id);
}

/** Ordem de estudo das questões do módulo: primeiro as não respondidas, depois as erradas. */
export function filaDoModulo(progresso, modulo) {
  const novas = modulo.questoes.filter((q) => !ultimaResposta(progresso, q.id));
  const erradas = modulo.questoes.filter((q) => ultimaResposta(progresso, q.id)?.certa === false);
  return { novas: novas.map((q) => q.id), erradas: erradas.map((q) => q.id) };
}
