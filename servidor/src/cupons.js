import { temDescontoDeIndicado, DESCONTO_INDICADO } from './indicacao.js';
// Cupons de desconto e afiliados. O preço final é sempre calculado aqui, no servidor.
export const VALOR_MINIMO_CENTAVOS = 500; // nenhum desconto deixa o pedido abaixo de R$ 5

export class ErroCupom extends Error {}

/** Busca o cupom válido para o plano, ou lança ErroCupom com o motivo. */
export async function buscarCupom(banco, codigo, planoId) {
  const c = await banco.um('SELECT * FROM cupons WHERE upper(codigo) = upper($1)', [String(codigo).trim()]);
  if (!c || !c.ativo) throw new ErroCupom('Cupom inválido.');
  if (c.valido_ate && new Date(c.valido_ate) < new Date()) throw new ErroCupom('Este cupom expirou.');
  if (c.limite_usos != null && c.usos >= c.limite_usos) throw new ErroCupom('Este cupom já atingiu o limite de usos.');
  if (c.planos?.length && !c.planos.includes(planoId)) throw new ErroCupom('Este cupom não vale para este plano.');
  return c;
}

export function aplicarDesconto(valor, cupom) {
  if (!cupom) return 0;
  const bruto = cupom.tipo === 'percentual' ? Math.round((valor * cupom.valor) / 100) : cupom.valor;
  return Math.max(0, Math.min(bruto, valor - VALOR_MINIMO_CENTAVOS));
}

/** Preço do pedido com cupom e afiliado (por cupom vinculado ou por link de indicação ?ref=CODIGO). */
export async function calcularPreco(banco, plano, { cupom: codigoCupom, ref, usuarioId } = {}) {
  const cupomBuscado = codigoCupom ? await buscarCupom(banco, codigoCupom, plano.id) : null;
  // Indicado na primeira compra: 10% de desconto. Com cupom também, vale o maior dos dois (não acumula).
  const indicado = usuarioId ? await temDescontoDeIndicado(banco, usuarioId) : false;
  const descontoCupom = aplicarDesconto(plano.valorCentavos, cupomBuscado);
  const descontoInd = indicado ? aplicarDesconto(plano.valorCentavos, { tipo: 'percentual', valor: DESCONTO_INDICADO }) : 0;
  const usarIndicacao = descontoInd > descontoCupom;
  const cupom = usarIndicacao ? null : cupomBuscado;
  const desconto = usarIndicacao ? descontoInd : descontoCupom;
  const valor = plano.valorCentavos - desconto;
  let afiliado = null;
  if (cupom?.afiliado_id) afiliado = await banco.um('SELECT * FROM afiliados WHERE id = $1 AND ativo', [cupom.afiliado_id]);
  else if (ref) afiliado = await banco.um('SELECT * FROM afiliados WHERE upper(codigo) = upper($1) AND ativo', [String(ref).trim().slice(0, 40)]);
  const comissao = afiliado ? Math.round((valor * Number(afiliado.comissao_percentual)) / 100) : 0;
  return { valorOriginal: plano.valorCentavos, desconto, valor, cupom, afiliado, comissao, descontoIndicacao: usarIndicacao };
}
