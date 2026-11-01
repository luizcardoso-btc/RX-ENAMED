import { carregarConfig, conferirProducao } from './config.js';
import { criarBanco, migrar } from './db.js';
import { carregarPlanos } from './planos.js';
import { criarMercadoPago } from './mercadopago.js';
import { criarApp } from './app.js';
import { criarCorreio } from './email.js';
import { rodarRotinas } from './rotinas.js';

process.on('unhandledRejection', (e) => { console.error('ERRO AO INICIAR:', e?.message || e); process.exit(1); });
const config = carregarConfig();
console.log(`iniciando: NODE_ENV=${process.env.NODE_ENV || '-'} PORT=${config.porta} URL_BASE=${config.urlBase} banco=${config.bancoUrl ? 'configurado' : 'FALTANDO'}`);
for (const aviso of conferirProducao(config)) console.warn(`aviso: ${aviso}`);
const banco = criarBanco(config.bancoUrl, { ssl: config.bancoSsl });
const aplicadas = await migrar(banco);
if (aplicadas.length) console.log('migrações aplicadas:', aplicadas.join(', '));
const planos = carregarPlanos(config.arquivoPlanos);
const mp = criarMercadoPago(config.mercadoPago);
if (!config.mercadoPago.tokenAcesso) console.warn('aviso: MP_ACCESS_TOKEN vazio; o checkout não vai conseguir cobrar.');
const correio = criarCorreio({ banco, config });
if (!config.email.chaveResend) console.warn('aviso: RESEND_API_KEY vazio; os e-mails só ficam registrados no banco (modo simulado).');
criarApp({ banco, config, planos, mp, correio }).listen(config.porta, () => console.log(`RX ENAMED em ${config.urlBase}`));
// De hora em hora: limpeza, pedidos expirados e avisos de vencimento do acesso.
const rotina = () => rodarRotinas({ banco, planos, correio }).catch((e) => console.error('rotinas', e.message));
setTimeout(rotina, 30000).unref();
setInterval(rotina, 60 * 60 * 1000).unref();
