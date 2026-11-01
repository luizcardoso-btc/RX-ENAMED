import express from 'express';
import { existsSync } from 'node:fs';
import { carregarUsuario, rotasAutenticacao } from './rotas/autenticacao.js';
import { rotasCheckout } from './rotas/checkout.js';
import { rotasAvisos } from './rotas/avisos.js';
import { rotasAdmin } from './rotas/admin.js';
import { rotasProgresso } from './rotas/progresso.js';
import { criarCorreio } from './email.js';

const MP_HOSTS = 'https://*.mercadopago.com https://*.mercadopago.com.br https://*.mercadolibre.com https://*.mercadolivre.com https://*.mlstatic.com';
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://sdk.mercadopago.com https://cdnjs.cloudflare.com ${MP_HOSTS}`,
  `connect-src 'self' https://api.mercadopago.com https://api-static.mercadopago.com ${MP_HOSTS}`,
  `frame-src ${MP_HOSTS}`,
  "img-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export function criarApp({ banco, config, planos, mp, correio = criarCorreio({ banco, config }) }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()',
      ...(config.producao ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
    });
    next();
  });
  app.use('/api/progresso', express.json({ limit: '4mb' }));
  app.use(express.json({ limit: '100kb' }));

  // Pedidos que alteram dados só valem vindos do próprio site (o webhook do Mercado Pago é a exceção, e tem assinatura).
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.path.startsWith('/webhooks/')) return next();
    const origem = req.get('origin');
    if (origem && origem !== config.urlBase) return res.status(403).json({ erro: 'Origem não permitida.' });
    if (!req.is('application/json')) return res.status(415).json({ erro: 'Envie JSON.' });
    next();
  });
  app.use('/api', carregarUsuario(banco));
  app.use('/api', rotasAutenticacao({ banco, config, correio }));
  app.use('/api', rotasCheckout({ banco, config, planos, mp, correio }));
  app.use('/api', rotasAvisos({ banco, config, planos, mp, correio }));
  app.use('/api', rotasProgresso({ banco }));
  app.use('/api/admin', rotasAdmin({ banco, planos, mp, correio }));
  app.get('/api/saude', async (_req, res) => {
    await banco.consulta('SELECT 1');
    res.json({ ok: true });
  });
  app.use('/api', (_req, res) => res.status(404).json({ erro: 'Rota inexistente.' }));

  // Páginas próprias do servidor: entrar, checkout e painel admin.
  const web = new URL('../web/', import.meta.url).pathname;
  app.use('/_rx', express.static(web, { maxAge: config.producao ? '1h' : 0 }));
  for (const [rota, arquivo] of [['/entrar', 'entrar.html'], ['/checkout', 'checkout.html'], ['/admin', 'admin.html'], ['/minha-conta', 'conta.html'], ['/redefinir-senha', 'redefinir.html']]) {
    app.get(rota, (_req, res) => res.sendFile(web + arquivo));
  }
  // Site público e área do aluno (gerados por site/gerar.mjs).
  if (existsSync(config.pastaSite)) app.use(express.static(config.pastaSite, { extensions: ['html'], maxAge: config.producao ? '10m' : 0 }));

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno. Tente de novo.' });
  });
  return app;
}
