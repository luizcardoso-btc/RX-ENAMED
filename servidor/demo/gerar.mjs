// Gera a demonstração do painel admin (dados fictícios, sem servidor): node servidor/demo/gerar.mjs
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
const aqui = new URL('.', import.meta.url).pathname;
const web = new URL('../web/', import.meta.url).pathname;
const saida = `${aqui}dist/`;
rmSync(saida, { recursive: true, force: true });
mkdirSync(saida, { recursive: true });
cpSync(new URL('../../site/site.css', import.meta.url).pathname, `${saida}site.css`);
cpSync(`${web}rx.css`, `${saida}rx.css`);
cpSync(`${web}comum.js`, `${saida}comum-base.js`);
cpSync(`${aqui}api-demo.js`, `${saida}comum.js`);
const admin = readFileSync(`${web}admin.js`, 'utf8')
  .replace(/<a class="botao" href="\/api\/admin\/alunos\?[^"]*">Exportar planilha<\/a>/, '<button type="button" class="botao" onclick="alert(\'No painel de verdade, este botão baixa a planilha de alunos (CSV) para abrir no Excel ou no Google Planilhas.\')">Exportar planilha</button>');
writeFileSync(`${saida}admin.js`, admin);
const html = readFileSync(`${web}admin.html`, 'utf8')
  .replace('<title>Admin | RX ENAMED</title>', '<title>Painel Admin RX</title>')
  .replace('href="/site.css"', 'href="site.css"').replace('href="/_rx/rx.css"', 'href="rx.css"').replace('src="/_rx/admin.js"', 'src="admin.js"')
  .replace('href="/admin"', 'href="#painel"')
  .replace('<main class="envoltorio rx-pagina" id="conteudo">', `<p style="margin:0;background:#2d230b;border-bottom:1px solid #fbbf24;color:#fde68a;padding:10px 16px;text-align:center;font-size:.9rem">
  Demonstração com dados fictícios: alunos, vendas e afiliados são inventados para mostrar o painel. As ações funcionam só nesta página e somem ao recarregar.</p>
<main class="envoltorio rx-pagina" id="conteudo">`)
  .replace('<head>', '<head>\n<style>:root{color-scheme:dark}</style>');
writeFileSync(`${saida}index.html`, html);
console.log('demo do admin em', saida);
