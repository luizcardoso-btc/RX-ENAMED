import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// ---- Senhas: scrypt com parâmetros gravados no próprio hash (permite subir o custo no futuro sem perder contas antigas).
const ATUAL = { N: 32768, r: 8, p: 1 };
const scryptP = (senha, sal, tam, { N, r, p }) => new Promise((ok, falha) =>
  scrypt(senha, sal, tam, { N, r, p, maxmem: 256 * N * r }, (e, k) => (e ? falha(e) : ok(k))));

export async function hashSenha(senha) {
  const sal = randomBytes(16);
  const chave = await scryptP(senha.normalize('NFKC'), sal, 64, ATUAL);
  return `scrypt2$${ATUAL.N}$${ATUAL.r}$${ATUAL.p}$${sal.toString('base64')}$${chave.toString('base64')}`;
}

function lerHash(guardado) {
  const partes = String(guardado).split('$');
  if (partes[0] === 'scrypt2' && partes.length === 6) return { N: +partes[1], r: +partes[2], p: +partes[3], sal: partes[4], chave: partes[5] };
  if (partes[0] === 'scrypt' && partes.length === 3) return { N: 16384, r: 8, p: 1, sal: partes[1], chave: partes[2], antigo: true };
  return null;
}

export async function conferirSenha(senha, guardado) {
  const h = lerHash(guardado);
  if (!h) return false;
  const esperado = Buffer.from(h.chave, 'base64');
  const entrada = h.antigo ? senha : senha.normalize('NFKC');
  const obtido = await scryptP(entrada, Buffer.from(h.sal, 'base64'), esperado.length, h);
  return timingSafeEqual(esperado, obtido);
}
/** Hash feito com parâmetros antigos: refazer no próximo login certo. */
export const precisaRefazer = (guardado) => { const h = lerHash(guardado); return !h || h.antigo || h.N < ATUAL.N; };
/** Hash de mentira: login com e-mail inexistente leva o mesmo tempo que um com senha errada. */
let hashFalso = null;
export async function tempoDeSenhaFalsa(senha) {
  hashFalso ||= await hashSenha(randomBytes(12).toString('hex'));
  await conferirSenha(senha, hashFalso);
}

// Senhas comuns demais (vazadas em massa) e regras mínimas.
const COMUNS = new Set(['12345678', '123456789', '1234567890', 'password', 'password1', 'senha123', 'senha1234', 'qwerty123', '11111111', '00000000',
  'abc12345', 'iloveyou', 'admin123', 'mudar123', 'brasil123', 'medicina', 'medicina1', 'revalida', 'revalida1', 'enamed123', '87654321', '12341234',
  'qwertyui', 'asdfghjk', 'senhasenha', 'aaaaaaaa', 'abcd1234', '1q2w3e4r', '123qweasd', 'football', 'princesa', 'flamengo', 'corinthians']);
export function problemaDaSenha(senha, email = '') {
  if (typeof senha !== 'string' || senha.length < 10) return 'A senha precisa ter pelo menos 10 caracteres.';
  if (senha.length > 200) return 'A senha pode ter no máximo 200 caracteres.';
  if (COMUNS.has(senha.toLowerCase()) || /^(.)\1+$/.test(senha)) return 'Esta senha é comum demais. Escolha outra.';
  if (email && senha.toLowerCase().includes(email.split('@')[0].toLowerCase()) && email.split('@')[0].length >= 4) return 'A senha não pode conter o seu e-mail.';
  if (!(/[a-zA-Z]/.test(senha) && /[^a-zA-Z]/.test(senha))) return 'Use letras e pelo menos um número ou símbolo.';
  return null;
}

export const novoToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

// ---- Verificação em duas etapas (TOTP, RFC 6238), compatível com Google Authenticator, Authy e 1Password.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(buf) {
  let bits = 0; let valor = 0; let saida = '';
  for (const byte of buf) { valor = (valor << 8) | byte; bits += 8; while (bits >= 5) { saida += B32[(valor >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) saida += B32[(valor << (5 - bits)) & 31];
  return saida;
}
function deBase32(texto) {
  const limpo = String(texto).replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = 0; let valor = 0; const saida = [];
  for (const c of limpo) { const i = B32.indexOf(c); if (i < 0) continue; valor = (valor << 5) | i; bits += 5; if (bits >= 8) { saida.push((valor >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(saida);
}
export const novoSegredoTotp = () => base32(randomBytes(20));
export function codigoTotp(segredo, passo = Math.floor(Date.now() / 30000)) {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const h = createHmac('sha1', deBase32(segredo)).update(contador).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}
/** Aceita o código da janela atual e das vizinhas (relógio do celular adiantado ou atrasado em até 30 s). */
export function conferirTotp(segredo, codigo, agora = Date.now()) {
  const c = String(codigo || '').replace(/\D/g, '');
  if (c.length !== 6 || !segredo) return false;
  const passo = Math.floor(agora / 30000);
  return [-1, 0, 1].some((d) => {
    const a = Buffer.from(codigoTotp(segredo, passo + d));
    return timingSafeEqual(a, Buffer.from(c));
  });
}
export const uriTotp = (segredo, email) => `otpauth://totp/${encodeURIComponent(`RX ENAMED:${email}`)}?secret=${segredo}&issuer=${encodeURIComponent('RX ENAMED')}&algorithm=SHA1&digits=6&period=30`;
export const novosCodigosRecuperacao = () => Array.from({ length: 10 }, () => randomBytes(5).toString('hex').replace(/(.{5})/, '$1-'));

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
