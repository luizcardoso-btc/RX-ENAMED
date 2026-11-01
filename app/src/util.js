import { t, localeAtual } from './i18n.js';

const CHAVE = 'raiox-revalida:v1';

export function carregarLocal() {
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}

export function salvarLocal(valor) {
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

export const DIA = 24 * 60 * 60 * 1000;

export function inicioDoDia(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function embaralhar(lista) {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pct(parte, total) {
  return total ? Math.round((parte / total) * 100) : 0;
}

export function formatarPct(parte, total) {
  return total ? `${pct(parte, total)}%` : '—';
}

export function formatarTempo(segundos) {
  const s = Math.max(0, Math.round(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const dois = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${dois(m)}:${dois(r)}` : `${dois(m)}:${dois(r)}`;
}

export function formatarDuracao(segundos) {
  const m = Math.round(segundos / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

export function formatarData(ts) {
  return new Date(ts).toLocaleDateString(localeAtual(), { day: '2-digit', month: 'short', year: 'numeric' });
}

export function plural(n, um, varios) {
  return `${n} ${t(n === 1 ? um : varios)}`;
}

export function normalizar(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export const LETRAS = ['A', 'B', 'C', 'D', 'E'];
