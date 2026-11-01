// Pontos (XP), níveis e conquistas, calculados só a partir do progresso salvo. O ranking usa os mesmos números.
import { DIA, inicioDoDia } from './util.js';
import { sequenciaDeDias } from './progresso.js';
import { historicoDesafios, XP_DESAFIO } from './desafio.js';

export const PONTOS = { acerto: 10, tentativa: 3, cartao: 2, aula: 30, simulado: 40, estacao: 25 };

export const NIVEIS = [
  { min: 0, nome: 'Calouro' },
  { min: 300, nome: 'Interno' },
  { min: 1000, nome: 'Plantonista' },
  { min: 2500, nome: 'Residente' },
  { min: 5000, nome: 'Preceptor' },
  { min: 9000, nome: 'Especialista' },
  { min: 14000, nome: 'Mestre' },
  { min: 20000, nome: 'Referência' },
];
// Depois do último nível, um novo grau a cada 8.000 XP: sempre há um próximo nível.
const PASSO_ALEM = 8000;

/** Início da semana (segunda-feira, 0h, horário local) do instante `t`. */
export function inicioDaSemana(t = Date.now()) {
  const d = new Date(inicioDoDia(t));
  const recuo = (d.getDay() + 6) % 7;
  return d.getTime() - recuo * DIA;
}
export const idSemana = (t = Date.now()) => new Date(inicioDaSemana(t)).toISOString().slice(0, 10);

/** XP total e da semana atual. Cada questão vale uma vez: acertou alguma vez, 10; só errou, 3. */
export function calcularXP(progresso, agora = Date.now()) {
  const semana = inicioDaSemana(agora);
  let total = 0;
  let daSemana = 0;
  const somar = (pontos, t) => { total += pontos; if (t >= semana) daSemana += pontos; };
  let respondidas = 0;
  let acertos = 0;
  for (const lista of Object.values(progresso.respostas)) {
    if (!lista.length) continue;
    respondidas++;
    const certa = lista.find((r) => r.certa);
    if (certa) acertos++;
    somar(certa ? PONTOS.acerto : PONTOS.tentativa, (certa || lista[0]).t);
  }
  for (const c of Object.values(progresso.flashcards)) somar(PONTOS.cartao, c.ultima || 0);
  for (const t of Object.values(progresso.aulas)) somar(PONTOS.aula, typeof t === 'number' ? t : 0);
  for (const s of progresso.simulados) somar(PONTOS.simulado, s.fim || 0);
  for (const lista of Object.values(progresso.praticas)) for (const p of lista) somar(PONTOS.estacao, p.t || 0);
  // Desafio diário: XP por dia concluído e bônus da sequência (7, 15, 30 dias…).
  let bonus = 0;
  for (const d of Object.values(progresso.desafios || {})) if (d?.concluido) somar(XP_DESAFIO, d.concluido);
  for (const b of historicoDesafios(progresso, agora).bonus) { somar(b.xp, b.t); bonus += b.xp; }
  return { total, daSemana, respondidas, acertos, bonus };
}

export function nivelDe(xp) {
  const ultimo = NIVEIS[NIVEIS.length - 1];
  if (xp >= ultimo.min + PASSO_ALEM) {
    const grau = Math.floor((xp - ultimo.min) / PASSO_ALEM);
    const min = ultimo.min + grau * PASSO_ALEM;
    return { numero: NIVEIS.length + grau, nome: `${ultimo.nome} ${grau + 1}`, min, proximo: { min: min + PASSO_ALEM, nome: `${ultimo.nome} ${grau + 2}` }, fracao: (xp - min) / PASSO_ALEM };
  }
  let i = NIVEIS.length - 1;
  while (i > 0 && xp < NIVEIS[i].min) i--;
  const proximo = NIVEIS[i + 1] || { min: ultimo.min + PASSO_ALEM, nome: `${ultimo.nome} 2` };
  return {
    numero: i + 1, nome: NIVEIS[i].nome, min: NIVEIS[i].min, proximo,
    fracao: proximo ? (xp - NIVEIS[i].min) / (proximo.min - NIVEIS[i].min) : 1,
  };
}

/** Conquistas: cada uma diz o que falta, para o aluno saber o próximo passo. */
export function conquistas(progresso, xp) {
  const praticas = Object.values(progresso.praticas).flat();
  const melhorEstacao = praticas.reduce((m, p) => Math.max(m, p.nota || 0), 0);
  const dias = sequenciaDeDias(progresso);
  const taxa = xp.respondidas ? xp.acertos / xp.respondidas : 0;
  return [
    { id: 'primeira', nome: 'Primeira questão', descricao: 'Responder a primeira questão', feito: xp.respondidas >= 1 },
    { id: 'cem', nome: 'Centena', descricao: 'Responder 100 questões', feito: xp.respondidas >= 100, progresso: Math.min(1, xp.respondidas / 100) },
    { id: 'pontaria', nome: 'Pontaria', descricao: '70% de acerto com pelo menos 50 questões', feito: xp.respondidas >= 50 && taxa >= 0.7 },
    { id: 'semana', nome: 'Sete dias seguidos', descricao: 'Estudar 7 dias sem falhar', feito: dias >= 7, progresso: Math.min(1, dias / 7) },
    { id: 'leitor', nome: 'Leitor', descricao: 'Concluir 3 aulas', feito: Object.keys(progresso.aulas).length >= 3, progresso: Math.min(1, Object.keys(progresso.aulas).length / 3) },
    { id: 'memoria', nome: 'Memória', descricao: 'Estudar 50 flashcards', feito: Object.keys(progresso.flashcards).length >= 50, progresso: Math.min(1, Object.keys(progresso.flashcards).length / 50) },
    { id: 'prova', nome: 'Prova completa', descricao: 'Terminar um simulado', feito: progresso.simulados.length >= 1 },
    { id: 'estacao', nome: 'Nota de aprovado', descricao: 'Tirar 8 ou mais numa estação', feito: melhorEstacao >= 8 },
    ...(() => {
      const h = historicoDesafios(progresso);
      return [
        { id: 'desafio7', nome: 'Uma semana firme', descricao: '7 desafios diários seguidos', feito: h.maior >= 7, progresso: Math.min(1, h.maior / 7) },
        { id: 'desafio15', nome: 'Quinzena de foco', descricao: '15 desafios diários seguidos', feito: h.maior >= 15, progresso: Math.min(1, h.maior / 15) },
        { id: 'desafio30', nome: 'Mês sem falhar', descricao: '30 desafios diários seguidos', feito: h.maior >= 30, progresso: Math.min(1, h.maior / 30) },
      ];
    })(),
  ];
}
