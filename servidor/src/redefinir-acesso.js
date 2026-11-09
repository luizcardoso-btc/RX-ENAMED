// Recupera o acesso a uma conta pelo terminal do servidor (Railway), sem depender de e-mail.
// Uso: npm run redefinir-acesso -- email@dominio.com            (nova senha temporária, desbloqueia a conta)
//      npm run redefinir-acesso -- email@dominio.com --2fa      (também desativa a verificação em duas etapas)
import { carregarConfig } from './config.js';
import { precisaSsl, criarBanco } from './db.js';
import { hashSenha } from './seguranca.js';
import { randomBytes } from 'node:crypto';

const email = String(process.argv[2] || '').toLowerCase();
const zerar2fa = process.argv.includes('--2fa');
if (!email || email.startsWith('--')) { console.error('Uso: npm run redefinir-acesso -- email@dominio.com [--2fa]'); process.exit(1); }
const cfg = carregarConfig();
const banco = criarBanco(cfg.bancoUrl, { ssl: precisaSsl(cfg.bancoUrl, cfg.bancoSsl) });
const u = await banco.um('SELECT id, papel FROM usuarios WHERE lower(email) = $1 AND excluido_em IS NULL', [email]);
if (!u) {
  console.log(`Nenhuma conta com ${email}. Cadastre-se no site primeiro.`);
} else {
  // Senha temporária legível, com letras e números (troque depois em "Minha conta").
  const senha = `Rx-${randomBytes(9).toString('base64url')}7`;
  await banco.consulta(`UPDATE usuarios SET senha_hash = $2, falhas_login = 0, bloqueado_ate = NULL
    ${zerar2fa ? ', totp_ativo = false, totp_segredo = NULL' : ''} WHERE id = $1`, [u.id, await hashSenha(senha)]);
  await banco.consulta('DELETE FROM sessoes WHERE usuario_id = $1', [u.id]);
  console.log(`Conta ${email} (${u.papel}) desbloqueada.`);
  console.log(`Senha temporária: ${senha}`);
  if (zerar2fa) console.log('Verificação em duas etapas desativada: ative de novo no primeiro acesso ao painel.');
}
await banco.fechar();
