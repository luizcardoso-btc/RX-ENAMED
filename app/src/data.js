import { normalizar } from './util.js';
import { t } from './i18n.js';

// Rótulos curtos e cores (índice da paleta categórica) de cada grande área, na ordem do Inep.
export const AREAS = [
  { nome: 'Clínica Médica', curto: 'Clínica', cor: 1 },
  { nome: 'Cirurgia', curto: 'Cirurgia', cor: 2 },
  { nome: 'Pediatria', curto: 'Pediatria', cor: 3 },
  { nome: 'Ginecologia e Obstetrícia', curto: 'GO', cor: 4 },
  { nome: 'Medicina de Família e Comunidade / Saúde Coletiva', curto: 'MFC / Saúde Coletiva', cor: 5 },
];

const POR_NOME = Object.fromEntries(AREAS.map((a) => [a.nome, a]));
export const infoArea = (nome) => POR_NOME[nome] || { nome, curto: nome, cor: 0 };

export async function carregarBanco() {
  const resp = await fetch('data/questoes.json');
  if (!resp.ok) throw new Error(t('Não foi possível carregar o banco de questões (HTTP {s}).', { s: resp.status }));
  const dados = await resp.json();
  const questoes = dados.questoes.map((q) => ({
    ...q,
    rotulo: `${q.exame} ${q.edicao}`,
    busca: normalizar(`${q.enunciado} ${q.alternativas.join(' ')} ${q.especialidade} ${q.tema}`),
  }));
  const porId = Object.fromEntries(questoes.map((q) => [q.id, q]));
  const edicoes = dados.edicoes.filter((e) => e.questoes > 0).map((e) => ({ ...e, rotulo: `${e.exame} ${e.edicao}` }));
  const pendentes = dados.edicoes.filter((e) => e.questoes === 0);
  const especialidades = [...new Set(questoes.map((q) => q.especialidade))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const tipos = [...new Set(questoes.map((q) => q.tipo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  // Edições em que cada tema caiu (para os mentores apontarem temas recorrentes).
  const edicoesDoTema = {};
  for (const q of questoes) if (q.tema) (edicoesDoTema[q.tema] ||= new Set()).add(q.edicao);

  // Conteúdo autoral (mentores e pacientes simulados). Se faltar, o app segue sem essas partes.
  let conteudo = { mentores: [], estacoes: [], cartoes: [], aulas: [], planos: null };
  try {
    const r = await fetch('data/conteudo.json');
    if (r.ok) conteudo = await r.json();
  } catch { /* segue sem conteúdo */ }
  let comentarios = {};
  try {
    const r = await fetch('data/comentarios.json');
    if (r.ok) comentarios = await r.json();
  } catch { /* segue sem comentários */ }
  const mentorDaArea = Object.fromEntries(conteudo.mentores.map((m) => [m.area, m]));
  const mentorPorId = Object.fromEntries(conteudo.mentores.map((m) => [m.id, m]));

  return { questoes, porId, edicoes, pendentes, especialidades, tipos, edicoesDoTema,
    mentores: conteudo.mentores, estacoes: conteudo.estacoes, cartoes: conteudo.cartoes || [], aulas: conteudo.aulas || [], discursivas: conteudo.discursivas || [], planos: conteudo.planos || { planos: [] },
    comentarios, mentorDaArea, mentorPorId };
}

export const FILTRO_INICIAL = {
  edicoes: [],
  areas: [],
  especialidade: '',
  tipo: '',
  dificuldade: '',
  incidencia: '',
  situacao: 'todas',
  anuladas: false,
  figuras: false,
  busca: '',
};

export function filtrarQuestoes(questoes, filtro, progresso) {
  const termo = normalizar(filtro.busca.trim());
  return questoes.filter((q) => {
    if (!filtro.anuladas && q.anulada) return false;
    if (filtro.edicoes.length && !filtro.edicoes.includes(q.id.replace(/_q\d+$/, ''))) return false;
    if (filtro.areas.length && !filtro.areas.includes(q.area)) return false;
    if (filtro.especialidade && q.especialidade !== filtro.especialidade) return false;
    if (filtro.tipo && q.tipo !== filtro.tipo) return false;
    if (filtro.dificuldade && q.dificuldade !== filtro.dificuldade) return false;
    if (filtro.incidencia && q.incidencia !== filtro.incidencia) return false;
    if (filtro.figuras && !q.figuras.length) return false;
    if (termo && !q.busca.includes(termo)) return false;
    const r = progresso.respostas[q.id];
    const ultima = r && r[r.length - 1];
    switch (filtro.situacao) {
      case 'nao-respondidas': return !ultima;
      case 'erradas': return ultima && !ultima.certa;
      case 'acertadas': return ultima && ultima.certa;
      case 'marcadas': return !!progresso.marcadas[q.id];
      default: return true;
    }
  });
}

export const idEdicao = (q) => q.id.replace(/_q\d+$/, '');
