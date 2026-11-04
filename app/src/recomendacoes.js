// Recomendações de revisão depois de uma estação ou simulado da 2ª etapa: aulas, questões e flashcards do
// próprio curso RX ENAMED sobre o mesmo tema (nada é criado aqui; só aponta para o que já existe).
import { normalizar } from './util.js';
import { modulosDoCurso } from './modulos.js';

const VAZIAS = new Set('para como com sem pelo pela entre sobre apos desde quando onde caso paciente anos queixa dor estacao exame clinica medica geral'.split(' '));
const palavras = (t) => new Set(normalizar(t).split(/[^a-z0-9]+/).filter((p) => p.length >= 5 && !VAZIAS.has(p)).map((p) => p.slice(0, 6)));
const sobrepoe = (a, b) => [...a].filter((x) => b.has(x)).length;

/** Material do curso ligado a uma estação (área + especialidade + palavras do tema e do título). */
export function recomendar(banco, progresso, alvo, limites = { aulas: 2, questoes: 15 }) {
  const chave = palavras(`${alvo.tema || ''} ${alvo.titulo || ''} ${alvo.diagnostico || ''}`);
  const mesmaArea = (x) => x.area === alvo.area;
  const nota = (x, texto) => (x.especialidade && x.especialidade === alvo.especialidade ? 2 : 0) + sobrepoe(chave, palavras(texto));

  const aulas = banco.aulas.filter(mesmaArea)
    .map((a) => ({ a, n: nota(a, `${a.pt?.titulo || ''} ${a.pt?.resumo || ''}`) }))
    .filter((x) => x.n >= 1).sort((x, y) => y.n - x.n).slice(0, limites.aulas).map((x) => x.a);
  const modulos = aulas.length ? modulosDoCurso(banco, progresso) : [];
  const aulasComModulo = aulas.map((a) => ({ id: a.id, titulo: a.pt?.titulo || a.id, modulo: modulos.find((m) => m.aulas.some((x) => x.id === a.id))?.numero }));

  const questoes = banco.questoes.filter((q) => mesmaArea(q) && !q.anulada)
    .map((q) => ({ q, n: nota(q, `${q.tema} ${q.enunciado.slice(0, 400)}`) }))
    .filter((x) => x.n >= 2).sort((x, y) => y.n - x.n).slice(0, limites.questoes).map((x) => x.q.id);

  const cartoes = banco.cartoes.filter((c) => mesmaArea(c) && nota(c, `${c.tema} ${c.frente}`) >= 2).length;
  return { aulas: aulasComModulo, questoes, cartoes };
}
