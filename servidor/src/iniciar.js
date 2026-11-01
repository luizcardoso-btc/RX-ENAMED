// Início do servidor em produção. Responde na hora (a checagem de saúde do Railway passa) e conecta ao banco em
// segundo plano, tentando de novo até conseguir. Se faltar configuração, o site mostra qual variável falta.
import express from 'express';
import { carregarConfig, conferirProducao } from './config.js';
import { criarBanco, migrar, precisaSsl } from './db.js';
import { carregarPlanos } from './planos.js';
import { criarMercadoPago } from './mercadopago.js';
import { criarApp } from './app.js';
import { criarCorreio } from './email.js';
import { rodarRotinas } from './rotinas.js';

process.on('unhandledRejection', (e) => console.error('erro não tratado:', e?.message || e));
const config = carregarConfig();
const { erros, avisos } = config.producao ? conferirProducao(config) : { erros: [], avisos: [] };
console.log(`iniciando: NODE_ENV=${process.env.NODE_ENV || '-'} PORT=${config.porta} URL_BASE=${config.urlBase} banco=${config.bancoUrl ? 'configurado' : 'FALTANDO'}`);
for (const a of avisos) console.warn(`aviso: ${a}`);
for (const e of erros) console.error(`CONFIGURAÇÃO: ${e}`);

const estado = { pronto: false, motivo: erros.length ? erros.join(' ') : 'conectando ao banco de dados…' };
let appReal = null;
const raiz = express();
raiz.disable('x-powered-by');
raiz.get('/api/saude', (_req, res) => res.set('Cache-Control', 'no-store').json({ ok: true, pronto: estado.pronto, ...(estado.pronto ? {} : { motivo: estado.motivo }) }));
raiz.use((req, res, next) => {
  if (appReal) return appReal(req, res, next);
  res.status(503).set({ 'Retry-After': '15', 'Cache-Control': 'no-store' });
  if (req.path.startsWith('/api/')) return res.json({ erro: 'Servidor iniciando. Tente em alguns segundos.' });
  res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="15">
<title>RX ENAMED</title><body style="font-family:system-ui;background:#05070c;color:#e9eef8;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="max-width:560px;padding:24px"><h1>RX ENAMED</h1><p>${erros.length ? 'Falta configurar o servidor:' : 'Iniciando, a página recarrega sozinha.'}</p>
${erros.map((e) => `<p style="background:#2d230b;border:1px solid #fbbf24;padding:10px;border-radius:8px">${e.replace(/[<>&]/g, '')}</p>`).join('')}</div>`);
});
raiz.listen(config.porta, '0.0.0.0', () => console.log(`ouvindo na porta ${config.porta}`));

async function subir() {
  if (erros.length) return; // corrija as variáveis no Railway: o serviço reinicia sozinho ao salvar
  const ssl = precisaSsl(config.bancoUrl, config.bancoSsl);
  const banco = criarBanco(config.bancoUrl, { ssl });
  for (let tentativa = 1; ; tentativa += 1) {
    try {
      const aplicadas = await migrar(banco);
      console.log(`banco conectado${ssl ? ' (SSL)' : ''}; migrações aplicadas: ${aplicadas.join(', ') || 'nenhuma nova'}`);
      break;
    } catch (e) {
      estado.motivo = 'banco de dados indisponível, tentando de novo…';
      console.error(`banco: tentativa ${tentativa} falhou: ${e.message}`);
      await new Promise((ok) => setTimeout(ok, Math.min(30000, 3000 * tentativa)));
    }
  }
  const planos = carregarPlanos(config.arquivoPlanos);
  const mp = criarMercadoPago(config.mercadoPago);
  const correio = criarCorreio({ banco, config });
  if (!config.email.chaveResend) console.warn('aviso: RESEND_API_KEY vazio; os e-mails só ficam registrados no banco (modo simulado).');
  appReal = criarApp({ banco, config, planos, mp, correio });
  estado.pronto = true;
  console.log(`RX ENAMED pronto em ${config.urlBase}`);
  const rotina = () => rodarRotinas({ banco, planos, correio }).catch((e) => console.error('rotinas', e.message));
  setTimeout(rotina, 30000).unref();
  setInterval(rotina, 60 * 60 * 1000).unref();
}
subir();
