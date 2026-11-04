// Gera dist/: index.html (CSS e JS do app embutidos; React vem do cdnjs), data/ (questões e conteúdo) e img/.
// Uso: node build.mjs
import { build } from 'esbuild';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { chavesDoCodigo, chavesDosDados } from './i18n-chaves.mjs';
import ES from './src/es.js';
import { validarPlanos } from './src/planos.js';
import { carregarEstacoes } from '../compartilhado/carregar-estacoes.js';
import { validarEstacao, partePublica } from '../compartilhado/estacoes.js';

const raiz = new URL('.', import.meta.url).pathname;
const dist = `${raiz}dist`;

const { outputFiles } = await build({
  entryPoints: [`${raiz}src/main.jsx`],
  bundle: true,
  write: false,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  legalComments: 'none',
});

const css = readFileSync(`${raiz}src/estilo.css`, 'utf8');
// Funções de substituição: o JS minificado pode conter "$&" e outros padrões especiais.
const html = readFileSync(`${raiz}src/pagina.html`, 'utf8')
  .replace('/*__ESTILO__*/', () => css)
  .replace('/*__SCRIPT__*/', () => outputFiles[0].text.replace(/<\/script/gi, '<\\/script'));

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
writeFileSync(`${dist}/index.html`, html);
cpSync(`${raiz}public/data`, `${dist}/data`, { recursive: true });
cpSync(`${raiz}public/img`, `${dist}/img`, { recursive: true });

// Conteúdo autoral (pacientes simulados e mentores): valida e junta num arquivo para o app.
const conteudo = `${raiz}../conteudo`;
const { mentores } = JSON.parse(readFileSync(`${conteudo}/mentores.json`, 'utf8'));
const idsMentores = new Set(mentores.map((m) => m.id));
const AREAS = ['Clínica Médica', 'Cirurgia', 'Pediatria', 'Ginecologia e Obstetrícia', 'Medicina de Família e Comunidade / Saúde Coletiva'];
// Estações da 2ª etapa: autorais (conteudo/estacoes) e oficiais do Inep (conteudo/estacoes-inep), no formato v2.
// Só as publicadas entram no app; a parte reservada (roteiro, impressos, PEP) fica fora do arquivo público.
const todasEstacoes = carregarEstacoes(conteudo);
for (const e of todasEstacoes) {
  const problemas = validarEstacao(e);
  if (!idsMentores.has(e.mentor)) problemas.push(`mentor desconhecido "${e.mentor}"`);
  if (e.status === 'publicada' && problemas.length) throw new Error(`estação ${e.id}: ${problemas.join('; ')}`);
}
const estacoesPublicadas = todasEstacoes.filter((e) => e.status === 'publicada');
const estacoes = estacoesPublicadas.map(partePublica);
// Flashcards de conceito: cada questão citada precisa existir no banco.
const idsQuestoes = new Set(JSON.parse(readFileSync(`${raiz}public/data/questoes.json`, 'utf8')).questoes.map((q) => q.id));
const { cartoes } = JSON.parse(readFileSync(`${conteudo}/flashcards.json`, 'utf8'));
const idsCartoes = new Set();
for (const c of cartoes) {
  const problemas = ['id', 'area', 'especialidade', 'tema', 'frente', 'verso'].filter((k) => !c[k]).map((k) => `falta "${k}"`);
  if (idsCartoes.has(c.id)) problemas.push('id repetido');
  if (!AREAS.includes(c.area)) problemas.push(`área desconhecida "${c.area}"`);
  for (const q of c.questoes || []) if (!idsQuestoes.has(q)) problemas.push(`questão inexistente ${q}`);
  if (problemas.length) throw new Error(`conteudo/flashcards.json, cartão "${c.id}": ${problemas.join('; ')}`);
  idsCartoes.add(c.id);
}

// Aulas do curso: texto em português e espanhol, questões citadas existentes.
const CAMPOS_TEXTO = ['titulo', 'resumo', 'secoes', 'pegadinhas'];
const aulas = readdirSync(`${conteudo}/aulas`).filter((f) => f.endsWith('.json')).sort().map((arquivo) => {
  const a = JSON.parse(readFileSync(`${conteudo}/aulas/${arquivo}`, 'utf8'));
  const problemas = ['id', 'area', 'especialidade', 'mentor', 'duracaoMin', 'questoes', 'referencias', 'pt', 'es']
    .filter((c) => a[c] === undefined).map((c) => `falta "${c}"`);
  if (`${a.id}.json` !== arquivo) problemas.push('id diferente do nome do arquivo');
  if (!AREAS.includes(a.area)) problemas.push(`área desconhecida "${a.area}"`);
  if (!idsMentores.has(a.mentor)) problemas.push(`mentor desconhecido "${a.mentor}"`);
  for (const lingua of ['pt', 'es']) for (const c of CAMPOS_TEXTO) if (!a[lingua]?.[c]) problemas.push(`falta ${lingua}.${c}`);
  if (a.pt?.secoes?.length !== a.es?.secoes?.length) problemas.push('pt e es com número diferente de seções');
  for (const q of a.questoes || []) if (!idsQuestoes.has(q)) problemas.push(`questão inexistente ${q}`);
  for (const lingua of ['pt', 'es']) for (const s of a[lingua]?.secoes || []) for (const f of s.figuras || []) {
    if (!f.alt || !f.legenda) problemas.push(`${lingua}: figura sem alt ou legenda em "${s.titulo}"`);
    if (!readdirSync(`${raiz}public/img`).includes(f.arquivo)) problemas.push(`figura inexistente ${f.arquivo}`);
  }
  if (problemas.length) throw new Error(`conteudo/aulas/${arquivo}: ${problemas.join('; ')}`);
  return a;
});

// Interface em espanhol: todo texto do código e todo nome vindo dos dados precisa de tradução.
const questoesBanco = JSON.parse(readFileSync(`${raiz}public/data/questoes.json`, 'utf8')).questoes;
const semTraducao = [...new Set([...chavesDoCodigo(), ...chavesDosDados(questoesBanco)])].filter((c) => !(c in ES));
if (semTraducao.length) throw new Error(`src/es.js: ${semTraducao.length} textos sem tradução, por exemplo ${JSON.stringify(semTraducao.slice(0, 5))}. Rode node i18n-chaves.mjs.`);

// Planos e preços: os mesmos números aparecem na área do aluno e no site.
const planos = JSON.parse(readFileSync(`${conteudo}/planos.json`, 'utf8'));
delete planos._leia;
const problemasPlanos = validarPlanos(planos);
if (problemasPlanos.length) throw new Error(`conteudo/planos.json: ${problemasPlanos.join('; ')}`);
const semCheckout = planos.planos.filter((p) => p.preco > 0 && !p.checkout).map((p) => p.id);
if (semCheckout.length) console.warn(`aviso: planos sem link de pagamento (${semCheckout.join(', ')}); o botão mostra "Pagamento abre em breve".`);

// Questões discursivas da 2ª etapa, com o padrão de resposta do Inep: itens somando 10 pontos e figuras existentes.
const discursivas = readdirSync(`${conteudo}/discursivas`).filter((f) => f.endsWith('.json')).sort().flatMap((arquivo) => {
  const lista = JSON.parse(readFileSync(`${conteudo}/discursivas/${arquivo}`, 'utf8')).discursivas;
  for (const d of lista) {
    const problemas = ['id', 'numero', 'area', 'especialidade', 'tema', 'enunciado', 'itens', 'referencias'].filter((c) => d[c] === undefined).map((c) => `falta "${c}"`);
    if (!AREAS.includes(d.area)) problemas.push(`área desconhecida "${d.area}"`);
    const soma = (d.itens || []).reduce((s, i) => s + i.valor, 0);
    if (Math.abs(soma - 10) > 0.001) problemas.push(`itens somam ${soma}, e não 10`);
    for (const i of d.itens || []) if (!i.letra || !i.pergunta || !i.padrao?.length) problemas.push(`item ${i.letra || '?'} incompleto`);
    for (const f of d.figuras || []) if (!readdirSync(`${raiz}public/img`).includes(f)) problemas.push(`figura inexistente ${f}`);
    if (problemas.length) throw new Error(`conteudo/discursivas/${arquivo}, ${d.id}: ${problemas.join('; ')}`);
  }
  return lista;
});

writeFileSync(`${dist}/data/conteudo.json`, JSON.stringify({ mentores, estacoes, cartoes, aulas, planos, discursivas }));
// Estações completas só para o modo sem servidor (testes e visualização no claude.ai). O site com servidor
// (site/gerar.mjs com CHECKOUT_PROPRIO=1) apaga este arquivo: lá o roteiro e o PEP vêm da API, por papel.
writeFileSync(`${dist}/data/estacoes-local.json`, JSON.stringify(estacoesPublicadas));
const editais = readdirSync(`${conteudo}/editais`).filter((f) => f.endsWith('.json')).sort()
  .map((f) => JSON.parse(readFileSync(`${conteudo}/editais/${f}`, 'utf8')));
writeFileSync(`${dist}/data/editais.json`, JSON.stringify(editais));

// Comentários das questões: um arquivo por edição, com explicação geral e de cada alternativa, em pt e es.
const porIdQuestao = Object.fromEntries(questoesBanco.map((q) => [q.id, q]));
const comentarios = {};
for (const arquivo of readdirSync(`${conteudo}/comentarios`).filter((f) => f.endsWith('.json')).sort()) {
  for (const [id, c] of Object.entries(JSON.parse(readFileSync(`${conteudo}/comentarios/${arquivo}`, 'utf8')))) {
    const q = porIdQuestao[id];
    const problemas = [];
    if (!q) problemas.push('questão inexistente');
    else if (!q.gabarito) problemas.push('questão anulada não leva comentário');
    else {
      const letras = 'ABCDE'.slice(0, q.alternativas.length).split('');
      // Português é obrigatório; espanhol é opcional (sem ele, o app mostra o comentário em português).
      for (const lingua of ['pt', 'es'].filter((l) => l === 'pt' || c[l])) {
        if (!c[lingua]?.resumo) problemas.push(`falta ${lingua}.resumo`);
        const faltam = letras.filter((l) => !c[lingua]?.alternativas?.[l]);
        if (faltam.length) problemas.push(`${lingua}: faltam alternativas ${faltam.join(', ')}`);
        // A alternativa do gabarito, e só ela, começa com "Correta:" (es: "Correcta:").
        const marcadas = letras.filter((l) => /^(Correta|Correcta)\b/.test(c[lingua]?.alternativas?.[l] ?? ''));
        if (marcadas.join() !== q.gabarito) problemas.push(`${lingua}: marca como correta ${marcadas.join(', ') || 'nenhuma'}, gabarito ${q.gabarito}`);
      }
    }
    if (comentarios[id]) problemas.push('comentário repetido');
    if (problemas.length) throw new Error(`conteudo/comentarios/${arquivo}, ${id}: ${problemas.join('; ')}`);
    comentarios[id] = c;
  }
}
writeFileSync(`${dist}/data/comentarios.json`, JSON.stringify(comentarios));
console.log(`dist/index.html: ${(html.length / 1024).toFixed(0)} KB · ${estacoes.length} estações (${estacoes.filter((e) => e.origem === 'oficial').length} oficiais do Inep) · ${mentores.length} mentores · ${cartoes.length} cartões · ${aulas.length} aulas · ${planos.planos.length} planos · ${discursivas.length} discursivas · ${Object.keys(comentarios).length} comentários`);
