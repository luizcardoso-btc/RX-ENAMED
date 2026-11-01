// Apaga os dados de teste (alunos, pedidos, acessos, e-mails, cupons, afiliados, avisos e auditoria) para abrir as vendas
// com o painel zerado. Contas de administrador são mantidas. Uso: npm run zerar -- --confirmar
import { carregarConfig } from './config.js';
import { criarBanco, migrar } from './db.js';

if (!process.argv.includes('--confirmar')) {
  console.error('Isto apaga todos os alunos, pedidos e vendas (menos as contas de admin). Para confirmar: npm run zerar -- --confirmar');
  process.exit(1);
}
const banco = criarBanco(carregarConfig().bancoUrl);
await migrar(banco);
await banco.transacao(async (t) => {
  await t.consulta('TRUNCATE avisos_pagamento, auditoria, emails, redefinicoes_senha, progresso, matriculas RESTART IDENTITY CASCADE');
  await t.consulta('TRUNCATE pedidos, cupons, afiliados CASCADE');
  await t.consulta(`DELETE FROM sessoes WHERE usuario_id IN (SELECT id FROM usuarios WHERE papel <> 'admin')`);
  await t.consulta(`DELETE FROM usuarios WHERE papel <> 'admin'`);
});
const admins = await banco.varios(`SELECT email FROM usuarios WHERE papel = 'admin'`);
console.log(`Painel zerado. Admins mantidos: ${admins.map((a) => a.email).join(', ') || 'nenhum'}`);
await banco.fechar();
