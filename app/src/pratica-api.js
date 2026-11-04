// Acesso às estações da 2ª etapa. No site com servidor, tudo passa pela API (o roteiro do paciente e o PEP
// nunca chegam ao navegador antes da hora). Sem servidor (testes e visualização no claude.ai), o mesmo contrato
// roda aqui, com o arquivo local de estações e os mesmos módulos compartilhados.
import { parteCandidato, parteCorrecao, partePublica, corrigir, montarCircuito, ORIGENS } from '../../compartilhado/estacoes.js';
import { responder, revelar, sugerirAvaliacao } from '../../compartilhado/motor-paciente.js';
import { extrairJson } from './ia.js';

export const comServidor = () => Boolean(document.querySelector('meta[name="rx-servidor"]'));

const ERRO = (mensagem, extra = {}) => Object.assign(new Error(mensagem), extra);

async function pedir(metodo, caminho, corpo) {
  let r;
  try {
    r = await fetch(`/api${caminho}`, {
      method: metodo, credentials: 'same-origin',
      headers: corpo ? { 'Content-Type': 'application/json' } : {},
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw ERRO('Sem conexão com o servidor. Verifique a internet.', { codigo: 'rede' });
  }
  let dados = {};
  try { dados = await r.json(); } catch { /* sem corpo */ }
  if (!r.ok) throw ERRO(dados.erro || 'Algo deu errado. Tente de novo.', { codigo: dados.codigo, status: r.status });
  return dados;
}

/** Resposta em texto corrido da IA (paciente ou avaliador), com o texto parcial a cada pedaço. */
async function transmitir(caminho, corpo, { onText, signal } = {}) {
  let r;
  try {
    r = await fetch(`/api${caminho}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal });
  } catch {
    if (signal?.aborted) throw ERRO('Cancelado.', { codigo: 'cancelado' });
    throw ERRO('Sem conexão com o servidor.', { codigo: 'rede' });
  }
  if (!r.ok) {
    let dados = {};
    try { dados = await r.json(); } catch { /* sem corpo */ }
    throw ERRO(dados.erro || 'A IA não respondeu agora.', { codigo: dados.codigo });
  }
  const leitor = r.body.getReader();
  const dec = new TextDecoder();
  let texto = '';
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    texto += dec.decode(value, { stream: true });
    if (!texto.includes('\u0000')) onText?.(texto);
  }
  const marca = texto.indexOf('\n\u0000');
  if (marca >= 0) throw ERRO('A IA não concluiu a resposta.', { codigo: 'erro', texto: texto.slice(0, marca) });
  return texto;
}

/* ------------------------------------------------------------------ servidor */

const servidor = {
  listar: () => pedir('GET', '/pratica/estacoes'),
  candidato: (id) => pedir('GET', `/pratica/estacoes/${encodeURIComponent(id)}`).then((d) => d.estacao),
  iniciar: (estacaoId, modo, simuladoId) => pedir('POST', '/pratica/tentativas', { estacaoId, modo, simuladoId }),
  falar: (id, texto) => pedir('POST', `/pratica/tentativas/${id}/fala`, { texto }),
  revelar: (id, chave) => pedir('POST', `/pratica/tentativas/${id}/revelar`, { chave }),
  iaPaciente: (id, falas, opts) => transmitir(`/pratica/tentativas/${id}/ia/paciente`, { falas }, opts),
  encerrar: (id, conclusao, falas) => pedir('POST', `/pratica/tentativas/${id}/encerrar`, { conclusao, falas }),
  iaAvaliar: async (id, lingua, opts) => extrairJson(await transmitir(`/pratica/tentativas/${id}/ia/avaliar`, { lingua }, opts)),
  gravar: (id, niveis, avaliadoPor) => pedir('POST', `/pratica/tentativas/${id}/resultado`, { niveis, avaliadoPor }),
  criarSimulado: (opcoes) => pedir('POST', '/pratica/simulados', opcoes),
  concluirSimulado: (id) => pedir('POST', `/pratica/simulados/${id}/concluir`, {}),
  resultados: () => pedir('GET', '/pratica/resultados').then((d) => d.resultados),
  // Dupla (só com servidor).
  criarSala: (opcoes) => pedir('POST', '/dupla/salas', opcoes),
  entrarSala: (codigo) => pedir('POST', `/dupla/salas/${encodeURIComponent(codigo)}/entrar`, {}),
  sala: (codigo, desde = 0) => pedir('GET', `/dupla/salas/${encodeURIComponent(codigo)}?desde=${desde}`),
  acaoSala: (codigo, corpo) => pedir('POST', `/dupla/salas/${encodeURIComponent(codigo)}/acao`, corpo),
  sairSala: (codigo) => pedir('POST', `/dupla/salas/${encodeURIComponent(codigo)}/sair`, {}),
};

/* ------------------------------------------------------------------ local (sem servidor) */

let acervoLocal = null;
async function acervo() {
  if (!acervoLocal) {
    const [estacoes, editais] = await Promise.all([
      fetch('data/estacoes-local.json').then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch('data/editais.json').then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    acervoLocal = { estacoes, porId: new Map(estacoes.map((e) => [e.id, e])), editais };
  }
  return acervoLocal;
}
const tentativas = new Map();
const simulados = new Map();
const novoId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const local = {
  async listar() {
    const a = await acervo();
    return { estacoes: a.estacoes.map(partePublica), editais: a.editais, origens: ORIGENS, iaDisponivel: false };
  },
  async candidato(id) {
    const e = (await acervo()).porId.get(id);
    if (!e) throw ERRO('Estação não encontrada.');
    return parteCandidato(e);
  },
  async iniciar(estacaoId, modo, simuladoId) {
    const e = (await acervo()).porId.get(estacaoId);
    if (!e) throw ERRO('Estação não encontrada.');
    if (modo === 'ia') throw ERRO('A IA não está ativa. Use o paciente gratuito.', { codigo: 'sampling_disabled' });
    const id = novoId();
    tentativas.set(id, { e, modo, simuladoId, falas: [], revelados: new Set(), encerrada: false, conclusao: '' });
    return { id, iniciadaEm: new Date().toISOString(), estacao: parteCandidato(e) };
  },
  async falar(id, texto) {
    const t = tentativas.get(id);
    if (!t || t.encerrada) throw ERRO('A estação já foi encerrada.');
    const r = responder(t.e, texto, t.revelados);
    for (const k of r.chaves || (r.chave ? [r.chave] : [])) t.revelados.add(k);
    t.falas.push({ de: 'candidato', texto }, { de: r.de, texto: r.texto });
    return { de: r.de, texto: r.texto, chave: r.chave || null, rotulo: r.rotulo || null, imagem: r.imagem || null };
  },
  async revelar(id, chave) {
    const t = tentativas.get(id);
    if (!t || t.encerrada) throw ERRO('A estação já foi encerrada.');
    const item = revelar(t.e, chave);
    if (!item) throw ERRO('Item inexistente.');
    t.revelados.add(chave);
    const pergunta = item.de === 'paciente' ? `Pergunta sobre: ${item.rotulo.toLowerCase()}` : `Solicita: ${item.rotulo}`;
    t.falas.push({ de: 'candidato', texto: pergunta }, { de: item.de, texto: item.texto });
    return { ...item, pergunta };
  },
  async iaPaciente() { throw ERRO('A IA não está ativa. Use o paciente gratuito.', { codigo: 'sampling_disabled' }); },
  async encerrar(id, conclusao) {
    const t = tentativas.get(id);
    if (!t) throw ERRO('Tentativa não encontrada.');
    if (!t.encerrada) { t.encerrada = true; t.conclusao = conclusao || ''; }
    const sugestao = sugerirAvaliacao(t.e, { falas: t.falas.filter((f) => f.de === 'candidato').map((f) => f.texto), conclusao: t.conclusao, revelados: [...t.revelados] });
    return { correcao: parteCorrecao(t.e), sugestao, iaDisponivel: false };
  },
  async iaAvaliar() { throw ERRO('A IA não está ativa. Faça a autoavaliação.', { codigo: 'sampling_disabled' }); },
  async gravar(id, niveis) {
    const t = tentativas.get(id);
    if (!t?.encerrada) throw ERRO('Encerre a estação antes de gravar a nota.');
    const c = corrigir(t.e, niveis);
    if (t.simuladoId) simulados.get(t.simuladoId)?.notas.push({ estacao_id: t.e.id, area: t.e.area, nota: c.nota, criticos: c.criticos });
    return { id: novoId(), ...c };
  },
  async criarSimulado({ quantidade = 5, edital, origem, area, minutos } = {}) {
    const a = await acervo();
    const ed = a.editais.find((x) => x.id === edital) || a.editais[0] || { id: 'livre', distribuicao: {}, minutosPorEstacao: 10, blocos: [5, 5] };
    const elegiveis = a.estacoes.filter((e) => e.paciente?.roteiro?.length && (!origem || e.origem === origem) && (!area || e.area === area));
    const estacoes = montarCircuito(elegiveis, quantidade === 1 ? { distribuicao: {} } : ed, quantidade);
    if (!estacoes.length) throw ERRO('Não há estações para esse filtro.');
    const id = novoId();
    const min = Math.min(20, Math.max(5, Number(minutos) || ed.minutosPorEstacao || 10));
    simulados.set(id, { estacoes: estacoes.map((e) => e.id), notas: [] });
    return { id, edital: ed.id, minutos: min, blocos: quantidade === 10 ? ed.blocos || [5, 5] : [estacoes.length], estacoes: estacoes.map(partePublica) };
  },
  async concluirSimulado(id) {
    const s = simulados.get(id);
    if (!s) throw ERRO('Simulado não encontrado.');
    const nota = s.notas.reduce((x, n) => x + n.nota, 0) / (s.estacoes.length || 1);
    return { id, nota: Math.round(nota * 1000) / 1000, feitas: s.notas.length, total: s.estacoes.length, resultados: s.notas };
  },
  async resultados() { return null; },
};

export function api() { return comServidor() ? servidor : local; }
export const duplaNoServidor = () => comServidor();
