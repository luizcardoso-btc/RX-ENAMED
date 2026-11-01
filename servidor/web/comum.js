// Funções compartilhadas das telas do servidor.
export const idioma = new URLSearchParams(location.search).get('lang') === 'es' ? 'es' : 'pt';
export const $ = (s, el = document) => el.querySelector(s);
export const reais = (c) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const data = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
export const dataHora = (d) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function api(caminho, { metodo = 'GET', corpo } = {}) {
  const r = await fetch(`/api${caminho}`, {
    method: metodo, credentials: 'same-origin',
    headers: corpo ? { 'Content-Type': 'application/json' } : {},
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(json.erro || `Erro ${r.status}`);
    e.status = r.status;
    e.corpo = json;
    throw e;
  }
  return json;
}

export const mostrarErro = (el, msg) => { el.textContent = msg; el.classList.toggle('rx-oculto', !msg); };
