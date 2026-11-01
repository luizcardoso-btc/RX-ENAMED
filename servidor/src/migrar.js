import { carregarConfig } from './config.js';
import { criarBanco, migrar, precisaSsl } from './db.js';

const cfg = carregarConfig();
const banco = criarBanco(cfg.bancoUrl, { ssl: precisaSsl(cfg.bancoUrl, cfg.bancoSsl) });
const aplicadas = await migrar(banco);
console.log(aplicadas.length ? `aplicadas: ${aplicadas.join(', ')}` : 'banco já atualizado');
await banco.fechar();
