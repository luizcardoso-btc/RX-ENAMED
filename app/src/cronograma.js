// Cronograma semanal adaptativo: distribui aulas, questões, revisões, flashcards e um simulado de revisão
// pelos dias de estudo que o aluno escolheu, cabendo no tempo diário. O status de cada atividade sai do
// progresso real, e o que ficou para trás num dia passado aparece como atrasado no dia de hoje.
import { DIA, inicioDoDia } from './util.js';
import { inicioDaSemana } from './gamificacao.js';
import { modulosDoCurso, SEGUNDOS_POR_QUESTAO } from './modulos.js';
import { montarBaralho } from './flashcards.js';

export const CONFIG_PADRAO = { diasEstudo: [1, 2, 3, 4, 5, 6], minutosDia: 120, metaAcerto: 65 };
const MIN_POR_QUESTAO = SEGUNDOS_POR_QUESTAO / 60;
const MIN_POR_CARTAO = 0.4;
const QUESTOES_SIMULADO = 30;

export const configDoAluno = (trilha) => ({ ...CONFIG_PADRAO, ...(trilha.cronograma || {}) });

/** Incidência na prova (1 a 3 chamas) pelo peso da especialidade nas provas do Inep. */
export const incidencia = (peso) => (peso >= 0.035 ? 3 : peso >= 0.015 ? 2 : 1);

/** Os 7 dias (segunda a domingo) da semana que contém `t`. */
export const diasDaSemana = (t = Date.now()) => Array.from({ length: 7 }, (_, i) => inicioDaSemana(t) + i * DIA);

const noDia = (ts, dia) => ts >= dia && ts < dia + DIA;

/** Quantas questões o aluno respondeu (fora de simulado) em cada dia e quantas eram revisão. */
function atividadeDoDia(estado, dia) {
  let questoes = 0;
  let revisoes = 0;
  for (const lista of Object.values(estado.respostas)) {
    for (const r of lista) {
      if (!noDia(r.t, dia) || r.origem === 'simulado') continue;
      questoes += 1;
      if (r.origem === 'revisao') revisoes += 1;
    }
  }
  const cartoes = Object.values(estado.flashcards).filter((c) => c?.ultima && noDia(c.ultima, dia)).length;
  return { questoes, revisoes, cartoes };
}

/** Ordem das aulas: área mais fraca e especialidade mais cobrada primeiro. */
function ordemDasAulas(banco, profs) {
  const porEsp = Object.fromEntries(profs.map((p) => [p.especialidade, p]));
  const valor = (a) => {
    const p = porEsp[a.especialidade];
    return p ? p.peso * (1.2 - p.media) : 0.01;
  };
  return [...banco.aulas].sort((a, b) => valor(b) - valor(a));
}

/**
 * Monta a semana. Devolve { dias: [{ dia, estudo, livre, atividades, minutos }], resumo }.
 * Cada atividade: { id, tipo, titulo, detalhe, minutos, chamas, status, quantidade, feito, alvo }.
 */
export function montarSemana(estado, banco, profs, semanaRef = Date.now(), agora = Date.now(), metaDia = null) {
  const cfg = configDoAluno(estado.trilha);
  const hoje = inicioDoDia(agora);
  const dias = diasDaSemana(semanaRef);
  // O plano só vale a partir do dia em que o aluno começou (primeira resposta ou configuração do cronograma).
  let primeira = agora;
  for (const lista of Object.values(estado.respostas)) for (const r of lista) if (r.t < primeira) primeira = r.t;
  const desde = inicioDoDia(Math.min(primeira, cfg.desde || agora));
  const estudo = dias.filter((d) => cfg.diasEstudo.includes(new Date(d).getDay()) && d >= desde);
  const meta = metaDia || estado.trilha.metaDiaria || 20;
  const porEsp = Object.fromEntries(profs.map((p) => [p.especialidade, p]));
  const modulos = modulosDoCurso(banco, estado);
  const moduloDaAula = Object.fromEntries(modulos.flatMap((m) => m.aulas.map((a) => [a.id, m.numero])));

  // Aulas: as concluídas nesta semana ficam no dia em que foram feitas; as pendentes vão para os dias de estudo
  // de hoje em diante (uma por dia), na ordem de prioridade.
  const aulasPorDia = new Map();
  const pendentes = [];
  for (const a of ordemDasAulas(banco, profs)) {
    const feitaEm = estado.aulas[a.id];
    if (feitaEm) {
      const dia = dias.find((d) => noDia(feitaEm, d));
      if (dia) aulasPorDia.set(dia, [...(aulasPorDia.get(dia) || []), { aula: a, feita: true }]);
    } else pendentes.push(a);
  }
  for (const d of estudo.filter((x) => x >= hoje)) {
    if (!pendentes.length) break;
    if (!(aulasPorDia.get(d) || []).length) aulasPorDia.set(d, [{ aula: pendentes.shift(), feita: false }]);
  }

  // Revisões espaçadas e flashcards que vencem em cada dia (vencidos antes de hoje entram hoje).
  const vencimento = (proxima) => (proxima < hoje ? hoje : inicioDoDia(proxima));
  const revisoesPorDia = {};
  for (const r of Object.values(estado.revisao)) revisoesPorDia[vencimento(r.proxima)] = (revisoesPorDia[vencimento(r.proxima)] || 0) + 1;
  const cartoesPorDia = {};
  const idsBaralho = new Set(montarBaralho(banco).map((c) => c.id));
  for (const [id, c] of Object.entries(estado.flashcards)) {
    if (!c?.proxima || !idsBaralho.has(id)) continue;
    cartoesPorDia[vencimento(c.proxima)] = (cartoesPorDia[vencimento(c.proxima)] || 0) + 1;
  }

  const ultimoDiaEstudo = estudo[estudo.length - 1];
  const simuladoNaSemana = estado.simulados.find((s) => s.fim >= dias[0] && s.fim < dias[0] + 7 * DIA);
  const fracas = profs.filter((p) => p.resp > 0).sort((a, b) => a.media - b.media).slice(0, 3).map((p) => p.especialidade);

  let atrasoQuestoes = 0;
  const saida = dias.map((dia) => {
    const ehEstudo = estudo.includes(dia);
    const feito = atividadeDoDia(estado, dia);
    const passado = dia < hoje;
    const ehHoje = dia === hoje;
    const atividades = [];
    const status = (feitoN, alvo) => (feitoN >= alvo ? 'feito' : feitoN > 0 ? 'andamento' : passado ? 'atrasado' : 'pendente');

    if (ehEstudo || feito.questoes || feito.cartoes) {
      for (const { aula, feita } of aulasPorDia.get(dia) || []) {
        const p = porEsp[aula.especialidade];
        atividades.push({ id: `aula:${aula.id}`, tipo: 'aula', titulo: aula.pt?.titulo || aula.titulo, tituloEs: aula.es?.titulo, detalhe: aula.especialidade, minutos: aula.duracaoMin,
          chamas: incidencia(p?.peso || 0), status: feita ? 'feito' : passado ? 'atrasado' : 'pendente', aulaId: aula.id, modulo: moduloDaAula[aula.id] });
      }
      const revisoes = revisoesPorDia[dia] || 0;
      if (revisoes) atividades.push({ id: 'revisao', tipo: 'revisao', alvo: revisoes, feito: Math.min(feito.revisoes, revisoes), minutos: Math.ceil(revisoes * MIN_POR_QUESTAO), status: status(feito.revisoes, revisoes) });
      const cartoes = cartoesPorDia[dia] || 0;
      if (cartoes || feito.cartoes) atividades.push({ id: 'flashcards', tipo: 'flashcards', alvo: Math.max(cartoes, 1), feito: feito.cartoes, minutos: Math.max(5, Math.ceil(cartoes * MIN_POR_CARTAO)), status: status(feito.cartoes, Math.max(cartoes, 1)) });
      if (dia === ultimoDiaEstudo) {
        atividades.push({ id: 'simulado', tipo: 'simulado', alvo: QUESTOES_SIMULADO, minutos: Math.ceil(QUESTOES_SIMULADO * MIN_POR_QUESTAO), especialidades: fracas,
          status: simuladoNaSemana ? 'feito' : passado ? 'atrasado' : 'pendente' });
      }
      // Questões do dia: a meta diária, cortada para caber no tempo disponível (mínimo de 10).
      if (ehEstudo || feito.questoes) {
        const ocupado = atividades.reduce((s, a) => s + (a.status === 'feito' && a.tipo !== 'simulado' ? 0 : a.minutos), 0);
        const cabe = Math.max(10, Math.floor((cfg.minutosDia - ocupado) / MIN_POR_QUESTAO));
        let alvo = ehEstudo ? Math.min(meta, cabe) : 0;
        if (ehHoje && atrasoQuestoes) alvo += Math.min(atrasoQuestoes, meta); // recupera no máximo um dia de atraso
        const normais = Math.max(0, feito.questoes - feito.revisoes);
        if (alvo || normais) {
          atividades.push({ id: 'questoes', tipo: 'questoes', alvo: Math.max(alvo, normais), feito: normais, atraso: ehHoje ? Math.min(atrasoQuestoes, meta) : 0,
            minutos: Math.ceil(Math.max(alvo - normais, 0) * MIN_POR_QUESTAO) || Math.ceil(alvo * MIN_POR_QUESTAO), status: status(normais, Math.max(alvo, 1)) });
        }
        if (passado && ehEstudo) atrasoQuestoes += Math.max(0, alvo - normais);
      }
    }
    const ordem = { questoes: 0, revisao: 1, aula: 2, flashcards: 3, simulado: 4 };
    atividades.sort((a, b) => ordem[a.tipo] - ordem[b.tipo]);
    return { dia, estudo: ehEstudo, livre: !atividades.length, passado, hoje: ehHoje, atividades,
      minutos: atividades.reduce((s, a) => s + a.minutos, 0) };
  });

  const todas = saida.flatMap((d) => d.atividades);
  const feitas = todas.filter((a) => a.status === 'feito').length;
  // O atraso já foi levado para hoje: não conta duas vezes no resumo.
  const atrasadas = todas.filter((a) => a.status === 'atrasado' && a.tipo !== 'questoes').length;
  return { dias: saida, config: cfg, resumo: { total: todas.length, feitas, atrasadas, atrasoQuestoes, fracao: todas.length ? feitas / todas.length : 0 } };
}

// ---- Metas e evolução (tela de desempenho)

/** Meta de questões do mês: meta diária × dias de estudo do mês. */
export function metasDoMes(estado, agora = Date.now(), metaDia = null) {
  const cfg = configDoAluno(estado.trilha);
  const d = new Date(agora);
  const inicio = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const fim = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  let diasEstudo = 0;
  for (let t = inicio; t < fim; t += DIA) if (cfg.diasEstudo.includes(new Date(t).getDay())) diasEstudo += 1;
  let feitas = 0;
  let certas = 0;
  for (const lista of Object.values(estado.respostas)) for (const r of lista) if (r.t >= inicio && r.t < fim) { feitas += 1; if (r.certa) certas += 1; }
  return { metaQuestoes: diasEstudo * (metaDia || estado.trilha.metaDiaria || 20), feitas, certas, acerto: feitas ? certas / feitas : null, metaAcerto: cfg.metaAcerto / 100, inicio, fim };
}

/** Questões e acerto por semana (segunda a domingo) das últimas `n` semanas, mais a meta semanal. */
export function evolucaoSemanal(estado, n = 8, agora = Date.now(), metaDia = null) {
  const cfg = configDoAluno(estado.trilha);
  const metaSemana = cfg.diasEstudo.length * (metaDia || estado.trilha.metaDiaria || 20);
  const base = inicioDaSemana(agora);
  const semanas = Array.from({ length: n }, (_, i) => ({ inicio: base - (n - 1 - i) * 7 * DIA, questoes: 0, certas: 0 }));
  for (const lista of Object.values(estado.respostas)) {
    for (const r of lista) {
      const s = semanas.find((x) => r.t >= x.inicio && r.t < x.inicio + 7 * DIA);
      if (s) { s.questoes += 1; if (r.certa) s.certas += 1; }
    }
  }
  return { metaSemana, metaAcerto: cfg.metaAcerto / 100, semanas: semanas.map((s) => ({ ...s, acerto: s.questoes ? s.certas / s.questoes : null })) };
}
