import express from 'express';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { carregarUsuario, rotasAutenticacao } from './rotas/autenticacao.js';
import { rotasCheckout } from './rotas/checkout.js';
import { rotasAvisos } from './rotas/avisos.js';
import { rotasAdmin } from './rotas/admin.js';
import { rotasProgresso } from './rotas/progresso.js';
import { criarCorreio } from './email.js';
import { criarLimitador } from './limitador.js';
import { contarVisitas } from './metas.js';
import { rotasIndicacao, rotaLinkIndicacao } from './indicacao.js';
import { rotasIa, criarClienteIa } from './ia.js';
import { rotasResidencia } from './rotas/residencia.js';

const MP_HOSTS = 'https://*.mercadopago.com https://*.mercadopago.com.br https://*.mercadolibre.com https://*.mercadolivre.com https://*.mlstatic.com';

/** Assinaturas (sha256) de todos os scripts embutidos nas páginas: a política só deixa rodar esses, nada injetado. */
function hashesDeScripts(pastas) {
  const hashes = new Set();
  const visitar = (p) => {
    for (const nome of readdirSync(p)) {
      const caminho = `${p}/${nome}`;
      if (statSync(caminho).isDirectory()) visitar(caminho);
      else if (nome.endsWith('.html')) {
        const html = readFileSync(caminho, 'utf8');
        for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)) {
          if (/application\/ld\+json/i.test(m[1]) || !m[2].trim()) continue;
          hashes.add(`'sha256-${createHash('sha256').update(m[2], 'utf8').digest('base64')}'`);
        }
      }
    }
  };
  for (const p of pastas) if (existsSync(p)) visitar(p);
  return [...hashes];
}

function politica(hashes) {
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')} https://sdk.mercadopago.com https://cdnjs.cloudflare.com ${MP_HOSTS}`,
    `connect-src 'self' https://api.mercadopago.com https://api-static.mercadopago.com ${MP_HOSTS}`,
    `frame-src ${MP_HOSTS}`,
    "img-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/** Limite geral por IP, em memória (barato), contra robôs martelando a API. Os limites sensíveis ficam no banco. */
function limiteGeral(max = 600, janelaMs = 5 * 60 * 1000) {
  const contagem = new Map();
  setInterval(() => { const agora = Date.now(); for (const [k, v] of contagem) if (agora - v.inicio > janelaMs) contagem.delete(k); }, 60000).unref();
  return (req, res, next) => {
    const agora = Date.now();
    const c = contagem.get(req.ip);
    if (!c || agora - c.inicio > janelaMs) { contagem.set(req.ip, { inicio: agora, n: 1 }); return next(); }
    c.n += 1;
    if (c.n > max) { res.set('Retry-After', '60'); return res.status(429).json({ erro: 'Muitas requisições. Espere um minuto.' }); }
    next();
  };
}

export function criarApp({ banco, config, planos, mp, correio = criarCorreio({ banco, config }), limitar: limitarBase = criarLimitador(banco), ia = criarClienteIa(config) }) {
  const limitar = (chave, max, seg) => limitarBase(chave, max * (config.multiplicadorLimites || 1), seg);
  const app = express();
  const web = new URL('../web/', import.meta.url).pathname;
  const csp = politica(hashesDeScripts([web, config.pastaSite]));
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // um proxy na frente (Railway/Render): req.ip é o IP real do visitante
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': csp,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(), payment=(self), usb=(), interest-cohort=()',
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Resource-Policy': 'same-site',
      ...(config.producao ? { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' } : {}),
    });
    // Em produção, tudo por HTTPS.
    if (config.producao && req.get('x-forwarded-proto') === 'http' && req.path !== '/api/saude') return res.redirect(301, `https://${req.get('host')}${req.originalUrl}`);
    next();
  });
  app.get('/api/saude', async (_req, res) => {
    await banco.consulta('SELECT 1');
    res.set('Cache-Control', 'no-store').json({ ok: true });
  });
  app.use('/api', limiteGeral(600 * (config.multiplicadorLimites || 1)), (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api/progresso', express.json({ limit: '4mb' }));
  app.use('/api/ia', express.json({ limit: '300kb' }));
  app.use(express.json({ limit: '100kb' }));

  // Proteção contra requisições forjadas por outros sites (CSRF): quem altera dados precisa vir do próprio site.
  // O webhook do Mercado Pago é a exceção, e é protegido pela assinatura.
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path.startsWith('/webhooks/')) return next();
    let origem = req.get('origin') || null;
    if (!origem && req.get('referer')) { try { origem = new URL(req.get('referer')).origin; } catch { origem = null; } }
    if (origem !== config.urlBase) return res.status(403).json({ erro: 'Origem não permitida.' });
    if (!req.is('application/json')) return res.status(415).json({ erro: 'Envie JSON.' });
    next();
  });
  app.use('/api', carregarUsuario(banco, config));
  app.use('/api', rotasAutenticacao({ banco, config, correio, limitar }));
  app.use('/api', rotasCheckout({ banco, config, planos, mp, correio, limitar }));
  app.use('/api', rotasAvisos({ banco, config, planos, mp, correio }));
  app.use('/api', rotasProgresso({ banco }));
  app.use('/api', rotasIndicacao({ banco, config }));
  app.use('/api', rotasIa({ banco, config, limitar, cliente: ia }));
  app.use('/api', rotasResidencia({ config }));
  app.use('/api/admin', rotasAdmin({ banco, planos, mp, correio, config }));
  app.use('/api', (_req, res) => res.status(404).json({ erro: 'Rota inexistente.' }));

  // Visitas anônimas (painel de metas) e link de indicação.
  app.use(contarVisitas(banco));
  app.get('/i/:codigo', rotaLinkIndicacao({ banco, config }));
  // Páginas próprias do servidor: entrar, checkout, conta, admin e documentos legais.
  app.use('/_rx', express.static(web, { maxAge: config.producao ? '1h' : 0 }));
  const paginas = [['/entrar', 'entrar.html'], ['/checkout', 'checkout.html'], ['/admin', 'admin.html'], ['/minha-conta', 'conta.html'],
    ['/redefinir-senha', 'redefinir.html'], ['/privacidade', 'privacidade.html'], ['/termos', 'termos.html']];
  // Documentos legais com os dados da empresa vindos da configuração.
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  for (const [rota, arquivo] of [['/privacidade', 'privacidade.html'], ['/termos', 'termos.html']]) {
    const html = readFileSync(web + arquivo, 'utf8')
      .replaceAll('{{EMPRESA}}', esc(config.legal.empresa))
      .replaceAll('{{DOCUMENTO}}', config.legal.documento ? ` (${esc(config.legal.documento)})` : '')
      .replaceAll('{{EMAIL}}', esc(config.legal.email))
      .replaceAll('{{DATA}}', esc(config.legal.data));
    app.get(rota, (_req, res) => res.type('html').send(html));
  }
  for (const [rota, arquivo] of paginas.filter(([r]) => !['/privacidade', '/termos'].includes(r))) {
    app.get(rota, (_req, res) => {
      if (['/admin', '/minha-conta', '/redefinir-senha', '/checkout'].includes(rota)) res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
      res.sendFile(web + arquivo);
    });
  }
  app.get('/.well-known/security.txt', (_req, res) => res.type('text/plain').send(
    `Contact: mailto:${config.email.responderPara || 'contato@rxenamed.com.br'}\nExpires: ${new Date(Date.now() + 365 * 86400000).toISOString()}\nPreferred-Languages: pt, es, en\n`));
  // Área do aluno restrita: a plataforma e os dados dela (questões, comentários, aulas) só abrem com a conta logada.
  // Sem login, a página manda para o cadastro e volta para a plataforma depois.
  app.use('/plataforma', carregarUsuario(banco, config), (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    if (req.usuario) return next();
    if (req.path === '/' || req.path.endsWith('.html')) {
      const volta = encodeURIComponent(`/plataforma/index.html${req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : ''}`);
      return res.redirect(302, `/entrar?modo=cadastro&voltar=${volta}`);
    }
    res.status(401).json({ erro: 'Entre na sua conta para acessar a área do aluno.' });
  });
  // Site público e área do aluno (gerados por site/gerar.mjs).
  if (existsSync(config.pastaSite)) app.use(express.static(config.pastaSite, { extensions: ['html'], maxAge: config.producao ? '10m' : 0, dotfiles: 'ignore' }));

  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ erro: 'Envio grande demais.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
    console.error(err);
    res.status(500).json({ erro: 'Erro interno. Tente de novo.' });
  });
  return app;
}
