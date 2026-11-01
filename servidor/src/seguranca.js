import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const PARAMS = { N: 16384, r: 8, p: 1 };

export async function hashSenha(senha) {
  const sal = randomBytes(16);
  const chave = await scryptAsync(senha, sal, 64, PARAMS);
  return `scrypt$${sal.toString('base64')}$${chave.toString('base64')}`;
}

export async function conferirSenha(senha, guardado) {
  const [tipo, sal, chave] = String(guardado).split('$');
  if (tipo !== 'scrypt' || !sal || !chave) return false;
  const esperado = Buffer.from(chave, 'base64');
  const obtido = await scryptAsync(senha, Buffer.from(sal, 'base64'), esperado.length, PARAMS);
  return timingSafeEqual(esperado, obtido);
}

export const novoToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/**
 * Confere a assinatura do aviso (webhook) do Mercado Pago.
 * Cabeçalho x-signature: "ts=<epoch>,v1=<hmac>". O texto assinado é "id:<data.id>;request-id:<x-request-id>;ts:<ts>;".
 */
export function assinaturaMercadoPagoValida({ assinatura, idRequisicao, idDado, segredo, agora = Date.now(), toleranciaSeg = 600 }) {
  if (!assinatura || !segredo) return false;
  const partes = Object.fromEntries(String(assinatura).split(',').map((p) => p.trim().split('=')));
  const ts = partes.ts;
  const v1 = partes.v1;
  if (!ts || !v1) return false;
  const tsMs = ts.length > 11 ? Number(ts) : Number(ts) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(agora - tsMs) > toleranciaSeg * 1000) return false;
  const id = /^[a-z0-9]+$/i.test(String(idDado ?? '')) ? String(idDado).toLowerCase() : String(idDado ?? '');
  let manifesto = '';
  if (id) manifesto += `id:${id};`;
  if (idRequisicao) manifesto += `request-id:${idRequisicao};`;
  manifesto += `ts:${ts};`;
  const esperado = createHmac('sha256', segredo).update(manifesto).digest('hex');
  const a = Buffer.from(esperado);
  const b = Buffer.from(String(v1));
  return a.length === b.length && timingSafeEqual(a, b);
}

export const emailValido = (e) => typeof e === 'string' && e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export function cpfValido(cpf) {
  const d = String(cpf || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n) => {
    let s = 0;
    for (let i = 0; i < n; i += 1) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
