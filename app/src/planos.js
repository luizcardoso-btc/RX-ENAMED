// Preços dos planos (conteudo/planos.json), usados pela área do aluno e pelo site público.
// Sem dependências do navegador: o site importa este arquivo direto no Node.

const COBRANCA = {
  gratis: { pt: 'para sempre', es: 'para siempre' },
  mensal: { pt: '30 dias de acesso, sem fidelidade', es: '30 días de acceso, sin permanencia' },
  semestral: { pt: '6 meses de acesso', es: '6 meses de acceso' },
  anual: { pt: '12 meses de acesso', es: '12 meses de acceso' },
  unico: { pt: 'pagamento único', es: 'pago único' },
};

export function reais(centavos) {
  // Mesmo formato nos dois idiomas: é o preço em real, e Bolívia, Paraguai e Argentina também usam 1.297,50.
  const casas = centavos % 100 === 0 ? 0 : 2;
  return `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
}

/** Textos de preço de um plano: o valor cobrado, o preço cheio riscado (no lançamento), o período e as parcelas. */
export function textosPreco(plano, lancamento, lingua) {
  const fundador = lancamento?.ativo && plano.precoFundador < plano.preco;
  const valor = fundador ? plano.precoFundador : plano.preco;
  const parcela = plano.parcelas > 1 && valor > 0 ? Math.round(valor / plano.parcelas) : 0;
  return {
    preco: reais(valor),
    de: fundador ? reais(plano.preco) : null,
    periodo: COBRANCA[plano.cobranca]?.[lingua] ?? '',
    parcela: parcela ? (lingua === 'es' ? `o ${plano.parcelas}× de ${reais(parcela)} sin intereses` : `ou ${plano.parcelas}× de ${reais(parcela)} sem juros`) : null,
  };
}

/** Confere o arquivo de planos; devolve a lista de problemas (vazia se estiver tudo certo). */
export function validarPlanos({ lancamento, planos }) {
  const problemas = [];
  const ids = new Set();
  for (const p of planos) {
    const onde = `plano "${p.id}"`;
    if (ids.has(p.id)) problemas.push(`${onde}: id repetido`);
    ids.add(p.id);
    if (!Number.isInteger(p.preco) || !Number.isInteger(p.precoFundador)) problemas.push(`${onde}: preços em centavos inteiros`);
    if (p.precoFundador > p.preco) problemas.push(`${onde}: preço de fundador maior que o cheio`);
    if (!COBRANCA[p.cobranca]) problemas.push(`${onde}: cobrança desconhecida "${p.cobranca}"`);
    if (p.checkout && !/^(https:\/\/|\/)/.test(p.checkout)) problemas.push(`${onde}: checkout precisa ser um link https ou um caminho do próprio site`);
    if (p.preco > 0 && !(Number.isInteger(p.duracaoMeses) && p.duracaoMeses > 0)) problemas.push(`${onde}: falta duracaoMeses`);
    for (const l of ['pt', 'es']) if (!p[l]?.nome || !p[l]?.para || !p[l]?.itens?.length) problemas.push(`${onde}: faltam textos em ${l}`);
  }
  if (lancamento?.ativo) for (const l of ['pt', 'es']) if (!lancamento[l]?.selo) problemas.push(`lançamento: falta o selo em ${l}`);
  return problemas;
}
