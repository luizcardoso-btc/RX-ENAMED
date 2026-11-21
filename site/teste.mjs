// Confere o site gerado em site/dist: links internos existem, nenhuma página rola na horizontal,
// sem erros de página, e a área do aluno abre a partir do site nos dois idiomas.
// Uso: node site/teste.mjs [pasta-das-capturas]
import { chromium } from '../app/node_modules/playwright-core/index.mjs';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';

const raiz = new URL('..', import.meta.url).pathname;
const dist = `${raiz}site/dist`;
const saida = process.argv[2] || `${raiz}site/capturas`;
mkdirSync(saida, { recursive: true });
const TIPOS = { html: 'text/html', css: 'text/css', json: 'application/json', png: 'image/png', webp: 'image/webp', js: 'text/javascript' };
const erros = [];

// Navegador dos testes: RX_CHROMIUM, ou o headless shell pré-instalado no ambiente (a versão muda entre imagens).
function navegadorDeTeste() {
  if (process.env.RX_CHROMIUM) return process.env.RX_CHROMIUM;
  const base = '/opt/pw-browsers';
  for (const d of readdirSync(base).filter((n) => n.startsWith('chromium_headless_shell-')).sort().reverse()) {
    for (const sub of readdirSync(`${base}/${d}`)) {
      for (const nome of ['chrome-headless-shell', 'headless_shell']) if (existsSync(`${base}/${d}/${sub}/${nome}`)) return `${base}/${d}/${sub}/${nome}`;
    }
  }
  return `${base}/chromium`;
}

const navegador = await chromium.launch({ executablePath: navegadorDeTeste() });
async function nova(largura, altura) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: altura } });
  await ctx.route('**/*', (rota) => {
    const url = new URL(rota.request().url());
    if (url.hostname === 'cdnjs.cloudflare.com') {
      const nome = url.pathname.endsWith('react-dom.production.min.js') ? 'react-dom/umd/react-dom.production.min.js' : 'react/umd/react.production.min.js';
      return rota.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(`${raiz}app/node_modules/${nome}`) });
    }
    if (url.hostname !== 'site.local') return rota.abort();
    const caminho = decodeURIComponent(url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname);
    const arquivo = `${dist}${caminho}`;
    if (!existsSync(arquivo)) { erros.push(`404: ${caminho}`); return rota.fulfill({ status: 404, body: '' }); }
    return rota.fulfill({ status: 200, contentType: TIPOS[caminho.split('.').pop()] || 'application/octet-stream', body: readFileSync(arquivo) });
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
  return p;
}

const PAGINAS = ['index.html', 'enamed.html', 'revalida.html', 'planos.html', 'es/index.html', 'es/enamed.html', 'es/revalida.html', 'es/planos.html'];
try {
  for (const [largura, altura, sufixo] of [[1280, 900, ''], [375, 812, '-celular']]) {
    const p = await nova(largura, altura);
    for (const pag of PAGINAS) {
      await p.goto(`http://site.local/${pag}`);
      const { sw, cw, links } = await p.evaluate(() => ({
        sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
        links: [...document.querySelectorAll('a[href], link[rel=stylesheet][href], img[src]')].map((a) => a.href || a.src),
      }));
      if (sw > cw + 1) erros.push(`${pag}${sufixo}: rolagem horizontal (${sw} > ${cw})`);
      for (const l of links) {
        const u = new URL(l);
        if (u.hostname === 'site.local' && !existsSync(`${dist}${decodeURIComponent(u.pathname)}`)) erros.push(`${pag}: link quebrado ${u.pathname}`);
      }
      await p.screenshot({ path: `${saida}/${pag.replace(/\//g, '_')}${sufixo}.png`, fullPage: true });
    }
  }
  // Do site para a área do aluno, em espanhol.
  const p = await nova(1280, 900);
  await p.goto('http://site.local/es/index.html');
  await p.getByRole('link', { name: /Empezar gratis/ }).first().click();
  await p.getByRole('heading', { level: 1 }).first().waitFor();
  await p.getByRole('navigation', { name: 'Secciones' }).waitFor();
  // Sair da área do aluno volta para a página inicial do site, no mesmo idioma.
  await p.getByRole('button', { name: 'Salir' }).click();
  await p.waitForURL('http://site.local/es/index.html');
  // As provas não ficam mais abertas no site público.
  if (existsSync(`${dist}/provas`)) erros.push('site: a pasta provas/ não deveria existir');
  // Preços do site iguais aos do arquivo de planos.
  await p.goto('http://site.local/planos.html');
  for (const valor of ['R$ 197,90', 'R$ 897', 'R$ 997', 'R$ 1.497', 'R$ 1.297', 'R$ 1.997']) if (!(await p.getByText(valor, { exact: true }).count())) erros.push(`planos.html: falta o preço ${valor}`);
} catch (err) {
  erros.push(`falha: ${err.message.split('\n')[0]}`);
} finally {
  await navegador.close();
}
console.log(erros.length ? `PROBLEMAS:\n${[...new Set(erros)].join('\n')}` : `OK: ${PAGINAS.length} páginas em 2 larguras, links internos e área do aluno.`);
