// Torna admin uma conta já cadastrada: npm run criar-admin -- email@dominio.com
import { carregarConfig } from './config.js';
import { criarBanco } from './db.js';

const email = String(process.argv[2] || '').toLowerCase();
if (!email) { console.error('Uso: npm run criar-admin -- email@dominio.com'); process.exit(1); }
const banco = criarBanco(carregarConfig().bancoUrl);
const r = await banco.consulta(`UPDATE usuarios SET papel = 'admin' WHERE lower(email) = $1`, [email]);
console.log(r.rowCount ? `${email} agora é admin.` : `Nenhuma conta com ${email}. Cadastre-se no site primeiro.`);
await banco.fechar();
