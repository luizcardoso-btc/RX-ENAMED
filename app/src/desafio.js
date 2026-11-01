// Desafio diário: as questões do plano do dia (25 no plano gratuito). Concluir o desafio todo dia forma uma
// sequência; 7, 15 e 30 dias seguidos dão bônus de XP, e depois disso a cada 30 dias. Os dias de folga
// escolhidos no cronograma não quebram a sequência (nem contam).
import { DIA, inicioDoDia } from './util.js';
import { configDoAluno } from './cronograma.js';

export const XP_DESAFIO = 20; // por desafio concluído
export const MARCOS = [
  { dias: 7, xp: 150, nome: 'Uma semana firme' },
  { dias: 15, xp: 400, nome: 'Quinzena de foco' },
  { dias: 30, xp: 1000, nome: 'Mês sem falhar' },
];
const XP_CADA_30 = 1000;

export const chaveDia = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const diaDaChave = (k) => { const [a, m, d] = k.split('-').map(Number); return new Date(a, m - 1, d).getTime(); };

/** Marco atingido ao chegar em `n` dias seguidos (7, 15, 30, 60, 90…), ou null. */
export function marcoDe(n) {
  const m = MARCOS.find((x) => x.dias === n);
  if (m) return m;
  if (n > 30 && n % 30 === 0) return { dias: n, xp: XP_CADA_30, nome: `${n} dias sem falhar` };
  return null;
}
export function proximoMarco(n) {
  const m = MARCOS.find((x) => x.dias > n);
  if (m) return m;
  const dias = (Math.floor(n / 30) + 1) * 30;
  return { dias, xp: XP_CADA_30, nome: `${dias} dias sem falhar` };
}

/**
 * Percorre o histórico de desafios concluídos dia a dia. Devolve a sequência atual (viva se o último dia de estudo
 * foi hoje ou o anterior), a maior sequência e os bônus ganhos (com o dia em que cada um foi ganho).
 */
export function historicoDesafios(estado, agora = Date.now()) {
  const cfg = configDoAluno(estado.trilha);
  const descanso = (t) => !cfg.diasEstudo.includes(new Date(t).getDay());
  const concluidos = new Set(Object.entries(estado.desafios || {}).filter(([, v]) => v?.concluido).map(([k]) => k));
  const hoje = inicioDoDia(agora);
  const bonus = [];
  let atual = 0;
  let maior = 0;
  if (concluidos.size) {
    const primeiro = Math.min(...[...concluidos].map(diaDaChave));
    for (let t = primeiro; t <= hoje; t += DIA) {
      const k = chaveDia(t);
      if (concluidos.has(k)) {
        atual += 1;
        maior = Math.max(maior, atual);
        const m = marcoDe(atual);
        if (m) bonus.push({ ...m, t: estado.desafios[k].concluido });
      } else if (t === hoje || descanso(t)) {
        // hoje ainda pode ser feito; folga não quebra
      } else {
        atual = 0;
      }
    }
  }
  return { atual, maior, bonus, feitoHoje: concluidos.has(chaveDia(agora)), concluidos };
}

/** Os 7 dias da semana (segunda a domingo) com a situação de cada um, para os pontinhos da sequência. */
export function semanaDaSequencia(estado, agora = Date.now()) {
  const cfg = configDoAluno(estado.trilha);
  const hoje = inicioDoDia(agora);
  const d = new Date(hoje);
  const segunda = hoje - ((d.getDay() + 6) % 7) * DIA;
  return Array.from({ length: 7 }, (_, i) => {
    const t = segunda + i * DIA;
    const k = chaveDia(t);
    const feito = !!estado.desafios?.[k]?.concluido;
    const folga = !cfg.diasEstudo.includes(new Date(t).getDay());
    return { t, feito, folga, hoje: t === hoje, futuro: t > hoje, perdido: !feito && !folga && t < hoje };
  });
}
