import { carregarConfig } from './config.js';
import { criarBanco, migrar } from './db.js';

const banco = criarBanco(carregarConfig().bancoUrl);
const aplicadas = await migrar(banco);
console.log(aplicadas.length ? `aplicadas: ${aplicadas.join(', ')}` : 'banco já atualizado');
await banco.fechar();
