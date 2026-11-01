// Idioma da interface (português ou espanhol). As questões oficiais ficam sempre em português,
// porque a prova do Inep é aplicada só em português.
// t('texto em português', { n: 3 }) devolve a tradução de es.js e troca {n} pelo valor.
import ES from './es.js';

const CHAVE = 'raiox-revalida:idioma';
export const IDIOMAS = [
  { id: 'pt', rotulo: 'Português', curto: 'PT', locale: 'pt-BR' },
  { id: 'es', rotulo: 'Español', curto: 'ES', locale: 'es' },
];

function idiomaInicial() {
  try {
    const daUrl = new URLSearchParams(window.location.search).get('lang');
    if (daUrl === 'pt' || daUrl === 'es') return daUrl;
    const salvo = window.localStorage.getItem(CHAVE);
    if (salvo === 'pt' || salvo === 'es') return salvo;
  } catch { /* sem armazenamento */ }
  return /^es\b/i.test(navigator.language || '') ? 'es' : 'pt';
}

let idioma = idiomaInicial();

export const idiomaAtual = () => idioma;
export const localeAtual = () => IDIOMAS.find((i) => i.id === idioma).locale;

export function definirIdioma(id) {
  idioma = id === 'es' ? 'es' : 'pt';
  try { window.localStorage.setItem(CHAVE, idioma); } catch { /* sem armazenamento */ }
  document.documentElement.lang = localeAtual();
}

export function t(texto, vars) {
  let s = texto;
  if (idioma === 'es') {
    if (texto in ES) s = ES[texto];
    else (window.__semTraducao ||= new Set()).add(texto); // conferido pelo teste
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}

/** Campo de conteúdo autoral com versão em espanhol em `obj.es[campo]`, se houver. */
export function tc(obj, campo) {
  if (idioma === 'es' && obj?.es?.[campo] !== undefined) return obj.es[campo];
  return obj?.[campo];
}
