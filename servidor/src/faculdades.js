// Faculdades de Medicina (Brasil, INEP; Paraguai, lista da prospecção) e banco de questões oficiais,
// usados no cadastro, no simulado nacional (correção e ranking) e no relatório da turma.
import { existsSync, readFileSync } from 'node:fs';

const raiz = new URL('../../', import.meta.url).pathname;
const lerJson = (caminho, padrao) => (existsSync(caminho) ? JSON.parse(readFileSync(caminho, 'utf8')) : padrao);

const BR = lerJson(`${raiz}conteudo/faculdades/escolas-medicas.json`, { escolas: [] }).escolas;
const PY = lerJson(`${raiz}conteudo/paraguai/paraguai.json`, { universidades: [] }).universidades;
const titulo = (s) => String(s || '').toLowerCase().replace(/(^|[\s(/-])([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());

const LISTA = [
  ...BR.map((e) => ({ codigo: `br:${e.curso}`, nome: titulo(e.nome), sigla: e.sigla || '', cidade: `${e.municipio}/${e.uf}`, pais: 'Brasil', uf: e.uf })),
  ...PY.map((u) => ({ codigo: `py:${u.id}`, nome: u.nome, sigla: u.sigla || '', cidade: u.sedes.join(', '), pais: 'Paraguai', uf: 'PY' })),
];
const POR_CODIGO = new Map(LISTA.map((f) => [f.codigo, f]));

/** Lista para o cadastro escolher a faculdade (nome, cidade e código). */
export const listaFaculdades = () => LISTA;
export const faculdadeValida = (codigo) => codigo === 'outra' || POR_CODIGO.has(codigo);
export function nomeFaculdade(codigo, outra) {
  if (!codigo) return 'Não informada';
  if (codigo === 'outra') return outra ? `${outra} (outra)` : 'Outra faculdade';
  const f = POR_CODIGO.get(codigo);
  return f ? `${f.nome} · ${f.cidade}` : codigo;
}

// Banco de questões: o mesmo arquivo da plataforma. No servidor de produção fica em site/dist/plataforma/data.
let questoes = null;
export function bancoQuestoes(config) {
  if (questoes) return questoes;
  const caminhos = [`${config.pastaSite}/plataforma/data/questoes.json`, `${raiz}app/dist/data/questoes.json`, `${raiz}app/public/data/questoes.json`];
  const arquivo = caminhos.find((c) => existsSync(c));
  const lista = arquivo ? JSON.parse(readFileSync(arquivo, 'utf8')).questoes : [];
  questoes = { lista, porId: new Map(lista.map((q) => [q.id, q])) };
  return questoes;
}
