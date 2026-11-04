// Lê as estações dos arquivos (autorais e oficiais do Inep) e devolve no formato v2. Só para Node (build e servidor).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { normalizarEstacao } from './estacoes.js';

export const PASTAS_ESTACOES = ['estacoes', 'estacoes-inep'];

export function carregarEstacoes(pastaConteudo) {
  const lista = [];
  for (const pasta of PASTAS_ESTACOES) {
    const dir = `${pastaConteudo}/${pasta}`;
    if (!existsSync(dir)) continue;
    for (const arquivo of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
      const e = normalizarEstacao(JSON.parse(readFileSync(`${dir}/${arquivo}`, 'utf8')));
      if (`${e.id}.json` !== arquivo) throw new Error(`${pasta}/${arquivo}: o id (${e.id}) precisa ser igual ao nome do arquivo`);
      lista.push(e);
    }
  }
  return lista;
}
