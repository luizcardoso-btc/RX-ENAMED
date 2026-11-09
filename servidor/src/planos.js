import { readFileSync } from 'node:fs';

// Os planos vêm do mesmo arquivo que o site e a área do aluno usam (conteudo/planos.json).
// O preço cobrado é sempre o do servidor: o navegador só informa qual plano quer.
export function carregarPlanos(arquivo) {
  const dados = JSON.parse(readFileSync(arquivo, 'utf8'));
  const usarFundador = dados.lancamento?.ativo;
  const planos = dados.planos.filter((p) => p.preco > 0).map((p) => ({
    id: p.id,
    nome: p.pt.nome,
    nomeEs: p.es.nome,
    para: p.pt.para,
    paraEs: p.es.para,
    itens: p.pt.itens,
    itensEs: p.es.itens,
    valorCentavos: usarFundador && p.precoFundador < p.preco ? p.precoFundador : p.preco,
    parcelasMax: p.parcelas || 1,
    duracaoMeses: p.duracaoMeses,
    etapas: Array.isArray(p.etapas) ? p.etapas.map(String) : null,
  }));
  for (const p of planos) if (!Number.isInteger(p.duracaoMeses) || p.duracaoMeses < 1) throw new Error(`planos.json: plano ${p.id} sem duracaoMeses`);
  const porId = Object.fromEntries(planos.map((p) => [p.id, p]));
  return { planos, porId, limitesGratis: dados.limitesGratis };
}

/** Fim do acesso: soma meses de calendário a partir do início (ou do fim do acesso atual, na renovação antecipada). */
export function somarMeses(data, meses) {
  const d = new Date(data);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d;
}
