// IA no site próprio: a mesma interface da função `sample` do visualizador, servida por /api/ia/mensagem.
// Assim as estações, as discursivas, os comentários e o simulador clínico funcionam igual nos dois lugares.

const ERRO = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });
const NIVEL = { quick: 'quick', default: 'default', complex: 'complex' };

/** Extrai o primeiro objeto JSON de um texto (tolera cercas de código e texto ao redor). */
export function extrairJson(texto) {
  const limpo = String(texto || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try { return JSON.parse(limpo); } catch { /* procura o objeto dentro do texto */ }
  const ini = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (ini >= 0 && fim > ini) {
    try { return JSON.parse(limpo.slice(ini, fim + 1)); } catch { /* inválido */ }
  }
  throw ERRO('invalid_json', 'Resposta da IA em formato inesperado.');
}

async function chamar(entrada, opts = {}, json = false) {
  let r;
  try {
    r = await fetch('/api/ia/mensagem', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entrada, sistema: opts.sistema, json, nivel: NIVEL[opts.modelTier] || (json ? 'default' : 'quick') }),
      signal: opts.signal,
    });
  } catch (e) {
    if (opts.signal?.aborted) throw ERRO('cancelled', 'Cancelado.');
    throw ERRO('network', 'Sem conexão com o servidor.');
  }
  if (!r.ok) {
    let dados = {};
    try { dados = await r.json(); } catch { /* sem corpo */ }
    throw ERRO(dados.codigo || (r.status === 401 ? 'session_expired' : 'erro'), dados.erro || 'A IA não respondeu agora.', { limite: dados.limite });
  }
  const leitor = r.body.getReader();
  const dec = new TextDecoder();
  let texto = '';
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      texto += dec.decode(value, { stream: true });
      if (opts.onText && !texto.includes('\u0000')) opts.onText({ text: texto });
    }
  } catch {
    if (opts.signal?.aborted) throw ERRO('cancelled', 'Cancelado.');
    throw ERRO('network', 'A conexão caiu no meio da resposta.', { text: texto });
  }
  const marca = texto.indexOf('\n\u0000');
  if (marca >= 0) {
    const codigo = texto.slice(marca + 2).trim();
    const parcial = texto.slice(0, marca);
    throw ERRO(codigo === 'refused' ? 'refused' : 'erro', 'A IA não concluiu a resposta.', { text: parcial });
  }
  return { text: texto, truncated: false };
}

export function criarSampleServidor() {
  const sample = (entrada, opts) => chamar(entrada, opts, false);
  sample.json = async (entrada, opts) => extrairJson((await chamar(entrada, opts, true)).text);
  sample.servidor = true;
  return sample;
}

/** Diz se a IA do servidor está ligada para esta conta. */
export async function iaDoServidor() {
  if (!document.querySelector('meta[name="rx-servidor"]')) return null;
  try {
    const r = await fetch('/api/ia/estado', { credentials: 'same-origin' });
    if (!r.ok) return null;
    const d = await r.json();
    return d.disponivel ? { sample: criarSampleServidor(), limiteDia: d.limiteDia } : null;
  } catch {
    return null;
  }
}
