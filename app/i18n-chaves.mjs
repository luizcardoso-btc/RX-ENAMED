// Lista os textos da interface que precisam de tradução: os literais passados a t() e plural() no
// código e os nomes vindos dos dados (áreas, especialidades, tipos). Usado pelo build para recusar
// textos sem versão em espanhol.
// Uso: node i18n-chaves.mjs        (mostra as chaves que faltam em src/es.js)
import { readdirSync, readFileSync } from 'node:fs';

const raiz = new URL('.', import.meta.url).pathname;

function arquivos(pasta) {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((d) => (d.isDirectory()
    ? arquivos(`${pasta}/${d.name}`)
    : /\.(jsx?|mjs)$/.test(d.name) && d.name !== 'es.js' ? [`${pasta}/${d.name}`] : []));
}

/** Literais de string de um trecho de código (aspas simples ou duplas, sem template). */
function literais(trecho) {
  const achados = [];
  const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(trecho))) achados.push((m[1] ?? m[2]).replace(/\\(.)/g, '$1'));
  return achados;
}

/** Argumentos (texto bruto) de cada chamada nome(...) no código. */
function chamadas(codigo, nome) {
  const lista = [];
  const re = new RegExp(`(?<![\\w.$])${nome}\\(`, 'g');
  let m;
  while ((m = re.exec(codigo))) {
    let i = m.index + m[0].length;
    let nivel = 1;
    const args = [''];
    let aspas = null;
    for (; i < codigo.length && nivel > 0; i++) {
      const c = codigo[i];
      if (aspas) {
        if (c === '\\') { args[args.length - 1] += c + codigo[++i]; continue; }
        if (c === aspas) aspas = null;
      } else if (c === "'" || c === '"' || c === '`') aspas = c;
      else if ('([{'.includes(c)) nivel++;
      else if (')]}'.includes(c)) { nivel--; if (!nivel) break; }
      else if (c === ',' && nivel === 1) { args.push(''); continue; }
      args[args.length - 1] += c;
    }
    lista.push(args);
  }
  return lista;
}

export function chavesDoCodigo() {
  const chaves = new Set();
  for (const arq of arquivos(`${raiz}src`)) {
    const codigo = readFileSync(arq, 'utf8');
    for (const args of chamadas(codigo, 't')) for (const s of literais(args[0])) chaves.add(s);
    for (const args of chamadas(codigo, 'plural')) for (const a of args.slice(1, 3)) for (const s of literais(a)) chaves.add(s);
    // { m: '...' } das partes do motivo da trilha.
    for (const m of codigo.matchAll(/\{ m: '((?:[^'\\]|\\.)*)'/g)) chaves.add(m[1]);
  }
  // Falsos positivos: comentário de exemplo e comparação de valor.
  for (const c of ['', 'texto em português', 'ia']) chaves.delete(c);
  return chaves;
}

export function chavesDosDados(questoes) {
  const chaves = new Set();
  for (const q of questoes) {
    chaves.add(q.area);
    chaves.add(q.especialidade);
    if (q.tipo) chaves.add(q.tipo);
  }
  return chaves;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { default: ES } = await import(`${raiz}src/es.js`).catch(() => ({ default: {} }));
  const { questoes } = JSON.parse(readFileSync(`${raiz}public/data/questoes.json`, 'utf8'));
  const todas = new Set([...chavesDoCodigo(), ...chavesDosDados(questoes)]);
  const faltam = [...todas].filter((c) => !(c in ES));
  console.log(faltam.map((c) => JSON.stringify(c)).join('\n'));
  console.error(`${todas.size} textos, ${faltam.length} sem tradução`);
}
