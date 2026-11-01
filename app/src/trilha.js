// Trilha inteligente: estimativa por especialidade, previsão de acertos, módulos e plano do dia.
// Tudo é calculado a partir do peso de cada especialidade nas provas do Inep e das respostas do aluno.
import { AREAS } from './data.js';
import { ultimaResposta, revisoesPendentes } from './progresso.js';
import { DIA, inicioDoDia } from './util.js';
import { t } from './i18n.js';

export const META_PADRAO = 20;

// Evidência sobre o aluno em cada especialidade, pelo número de questões respondidas.
export function nivelEvidencia(respondidas) {
  if (respondidas >= 5) return 'consolidada';
  if (respondidas >= 2) return 'preliminar';
  return 'sem';
}
export const ROTULO_EVIDENCIA = { consolidada: 'Consolidada', preliminar: 'Preliminar', sem: 'Sem evidência' };

/** Motivo de um item do plano, guardado em partes para ser traduzido na hora de exibir. */
export function textoMotivo(motivo) {
  if (typeof motivo === 'string') return motivo;
  return motivo.map(({ m, v = {} }) => t(m, { ...v, esp: v.esp && t(v.esp) })).join(' · ');
}

/**
 * Estimativa de acerto por especialidade. Usa a média de uma Beta(1 + certas, 1 + erros):
 * sem dados a estimativa é 50% e se aproxima da taxa real conforme o aluno responde.
 */
export function proficiencias(estado, questoes) {
  const validas = questoes.filter((q) => !q.anulada);
  const grupos = new Map();
  for (const q of validas) {
    const g = grupos.get(q.especialidade) || { especialidade: q.especialidade, areas: {}, total: 0, resp: 0, certas: 0 };
    g.total++;
    g.areas[q.area] = (g.areas[q.area] || 0) + 1;
    const r = ultimaResposta(estado, q.id);
    if (r) { g.resp++; if (r.certa) g.certas++; }
    grupos.set(q.especialidade, g);
  }
  return [...grupos.values()].map((g) => {
    const a = 1 + g.certas;
    const b = 1 + g.resp - g.certas;
    return {
      ...g,
      area: Object.entries(g.areas).sort((x, y) => y[1] - x[1])[0][0],
      peso: g.total / validas.length,
      media: a / (a + b),
      variancia: (a * b) / ((a + b) ** 2 * (a + b + 1)),
      evidencia: nivelEvidencia(g.resp),
    };
  });
}

/** Previsão de acertos na prova: média das estimativas ponderada pelo peso de cada especialidade. */
export function previsao(profs) {
  const media = profs.reduce((s, p) => s + p.peso * p.media, 0);
  const dp = Math.sqrt(profs.reduce((s, p) => s + p.peso ** 2 * p.variancia, 0));
  const cobertura = profs.filter((p) => p.evidencia !== 'sem').reduce((s, p) => s + p.peso, 0);
  return { media, margem: 1.96 * dp, cobertura };
}

function respondidasPorArea(estado, questoes) {
  const n = Object.fromEntries(AREAS.map((a) => [a.nome, 0]));
  for (const q of questoes) if (!q.anulada && ultimaResposta(estado, q.id)) n[q.area]++;
  return n;
}

/** Os cinco módulos, cada um com um critério objetivo de conclusão. */
export function modulos(estado, banco, profs) {
  const porArea = respondidasPorArea(estado, banco.questoes);
  const minArea = Math.min(...Object.values(porArea));
  const ordenadas = [...profs].sort((a, b) => b.peso - a.peso);
  let acumulado = 0;
  const nucleo = ordenadas.filter((p) => { const entra = acumulado < 0.7; acumulado += p.peso; return entra; });
  const nucleoCoberto = nucleo.filter((p) => p.evidencia !== 'sem');
  const pesoFraco = profs.filter((p) => p.evidencia !== 'sem' && p.media < 0.55).reduce((s, p) => s + p.peso, 0);
  const semEvidenciaPeso = profs.filter((p) => p.evidencia === 'sem').reduce((s, p) => s + p.peso, 0);
  const simuladosLongos = estado.simulados.filter((s) => s.ids.length >= 50).length;
  const pendentes = revisoesPendentes(estado).length;

  const lista = [
    { id: 'diagnostico', nome: t('Diagnóstico'), foco: t('Mapear seu nível nas cinco grandes áreas.'),
      criterio: t('Responder pelo menos 4 questões de cada grande área.'),
      progresso: Math.min(1, minArea / 4), feito: minArea >= 4, detalhe: t('{n} de 4 na área com menos respostas', { n: Math.min(minArea, 4) }) },
    { id: 'base', nome: t('Base'), foco: t('Cobrir as especialidades que mais pesam na prova.'),
      criterio: t('Ter dados em todas as {n} especialidades que somam 70% da prova.', { n: nucleo.length }),
      progresso: nucleoCoberto.length / nucleo.length, feito: nucleoCoberto.length === nucleo.length,
      detalhe: t('{n} de {total} especialidades com dados', { n: nucleoCoberto.length, total: nucleo.length }) },
    { id: 'lacunas', nome: t('Lacunas'), foco: t('Atacar onde você mais erra, pelo peso na prova.'),
      criterio: t('Especialidades com estimativa abaixo de 55% somarem menos de 10% da prova, sem áreas descobertas acima de 20%.'),
      progresso: Math.max(0, Math.min(1, 1 - Math.max(pesoFraco - 0.1, 0) / 0.4)) * (semEvidenciaPeso <= 0.2 ? 1 : 0.8),
      feito: pesoFraco < 0.1 && semEvidenciaPeso <= 0.2,
      detalhe: t('{p}% da prova em especialidades fracas', { p: Math.round(pesoFraco * 100) }) },
    { id: 'simulados', nome: t('Simulados'), foco: t('Ganhar ritmo de prova com tempo cronometrado.'),
      criterio: t('Entregar 2 simulados com 50 questões ou mais.'),
      progresso: Math.min(1, simuladosLongos / 2), feito: simuladosLongos >= 2, detalhe: t('{n} de 2 simulados', { n: Math.min(simuladosLongos, 2) }) },
    { id: 'reta', nome: t('Reta final'), foco: t('Revisões em dia e temas que mais se repetem.'),
      criterio: t('Manter a fila de revisão zerada até o dia da prova.'),
      progresso: pendentes ? 0.5 : 1, feito: false, detalhe: pendentes ? t('{n} revisões pendentes', { n: pendentes }) : t('revisões em dia') },
  ];
  const atual = lista.findIndex((m) => !m.feito);
  return lista.map((m, i) => {
    const status = m.feito && i < atual ? 'concluido' : i === atual ? 'andamento' : m.feito ? 'concluido' : 'proximo';
    // A reta final só começa a contar quando chega a vez dela.
    return { ...m, status, progresso: m.id === 'reta' && status === 'proximo' ? 0 : m.progresso };
  });
}

// Embaralhamento determinístico pela data: o plano do dia não muda a cada abertura.
function semente(texto) {
  let h = 2166136261;
  for (const c of texto) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export const chaveDoDia = (ts = Date.now()) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const PESOS_MODULO = {
  diagnostico: { fraqueza: 0, incerteza: 1 },
  base: { fraqueza: 0.5, incerteza: 1 },
  lacunas: { fraqueza: 1, incerteza: 0.3 },
  simulados: { fraqueza: 1, incerteza: 0.2 },
  reta: { fraqueza: 1, incerteza: 0.2 },
};

/**
 * Plano do dia: primeiro as revisões vencidas, depois questões escolhidas por
 * peso da especialidade × (fraqueza e incerteza, conforme o módulo), no máximo 3 por especialidade.
 * Cada item leva o motivo da escolha.
 */
export function montarPlano(estado, banco, profs, moduloAtual, meta, rodada = 0) {
  const dia = chaveDoDia();
  const aleatorio = semente(`${dia}#${rodada}`);
  const porEsp = Object.fromEntries(profs.map((p) => [p.especialidade, p]));
  const itens = [];

  for (const id of revisoesPendentes(estado)) {
    const q = banco.porId[id];
    if (!q) continue;
    const r = estado.revisao[id];
    itens.push({ id, tipo: 'revisao', motivo: [{ m: 'Revisão programada' }, { m: 'caixa {n}', v: { n: r.caixa } }, { m: '{esp}', v: { esp: q.especialidade } }] });
  }

  const vagas = Math.max(meta - itens.length, Math.ceil(meta / 4));
  const pesos = PESOS_MODULO[moduloAtual] || PESOS_MODULO.base;
  const jaNoPlano = new Set(itens.map((i) => i.id));
  const candidatas = banco.questoes.filter((q) => !q.anulada && !jaNoPlano.has(q.id));
  const nota = (q) => {
    const p = porEsp[q.especialidade];
    const r = ultimaResposta(estado, q.id);
    const repetida = r ? (r.certa ? 0.15 : 0.6) : 1; // inéditas primeiro; erradas antes das acertadas
    const valor = p.peso * (pesos.fraqueza * (1 - p.media) + pesos.incerteza / (1 + p.resp) + 0.05);
    return valor * repetida * (0.85 + 0.3 * aleatorio());
  };
  const ordenadas = candidatas.map((q) => ({ q, n: nota(q) })).sort((a, b) => b.n - a.n);

  const contagemEsp = {};
  const contagemArea = {};
  const limiteArea = moduloAtual === 'diagnostico' ? Math.ceil(vagas / AREAS.length) : Infinity;
  let escolhidas = 0;
  for (const { q } of ordenadas) {
    if (escolhidas >= vagas) break;
    if ((contagemEsp[q.especialidade] || 0) >= 3 || (contagemArea[q.area] || 0) >= limiteArea) continue;
    contagemEsp[q.especialidade] = (contagemEsp[q.especialidade] || 0) + 1;
    contagemArea[q.area] = (contagemArea[q.area] || 0) + 1;
    const p = porEsp[q.especialidade];
    const r = ultimaResposta(estado, q.id);
    const peso = { m: '{esp} pesa {p}% da prova', v: { esp: q.especialidade, p: Math.round(p.peso * 100) } };
    const situacao = r && !r.certa ? { m: 'você errou esta questão' }
      : p.evidencia === 'sem' ? { m: 'ainda sem dados seus' }
        : { m: 'você acerta cerca de {p}%', v: { p: Math.round(p.media * 100) } };
    itens.push({ id: q.id, tipo: r ? 'refazer' : 'nova', motivo: [peso, situacao] });
    escolhidas++;
  }
  return { dia, criadoEm: Date.now(), itens };
}

/** Questões do plano que já foram respondidas hoje. */
export function feitasHoje(estado, plano) {
  const hoje = inicioDoDia();
  return new Set(plano.itens.filter((i) => (estado.respostas[i.id] || []).some((r) => r.t >= hoje)).map((i) => i.id));
}

/** A especialidade mais pesada que ainda está sem evidência, ou a mais perto de subir de nível. */
export function proximoPasso(profs) {
  const sem = profs.filter((p) => p.evidencia === 'sem').sort((a, b) => b.peso - a.peso)[0];
  if (sem) {
    const faltam = 2 - sem.resp;
    return t('Responda mais {n} {q} de {esp} para ter sua primeira estimativa nela. Ela pesa {p}% da prova.',
      { n: faltam, q: t(faltam === 1 ? 'questão' : 'questões'), esp: t(sem.especialidade), p: Math.round(sem.peso * 100) });
  }
  const pre = profs.filter((p) => p.evidencia === 'preliminar').sort((a, b) => b.peso - a.peso)[0];
  if (pre) {
    const faltam = 5 - pre.resp;
    return t('Mais {n} {q} de {esp} consolidam sua estimativa nessa especialidade.',
      { n: faltam, q: t(faltam === 1 ? 'questão' : 'questões'), esp: t(pre.especialidade) });
  }
  return t('Todas as especialidades têm estimativa consolidada. Siga com o plano do dia e os simulados.');
}

export function diasAte(dataIso) {
  if (!dataIso) return null;
  const [a, m, d] = dataIso.split('-').map(Number);
  return Math.round((new Date(a, m - 1, d).getTime() - inicioDoDia()) / DIA);
}
