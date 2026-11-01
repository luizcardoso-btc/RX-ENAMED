import { statusDoPedido, resumoPagamento } from './mercadopago.js';
import { liberarPorPedido, cancelarPorPedido } from './acesso.js';

/**
 * Aplica ao pedido o estado atual de um pagamento consultado no Mercado Pago, libera ou encerra o acesso
 * e, na primeira aprovação, conta o uso do cupom e manda o e-mail de confirmação. É idempotente.
 */
export async function aplicarPagamento({ banco, planos, correio }, pagamento) {
  const pedidoId = pagamento.external_reference;
  if (!pedidoId) return { resultado: 'sem referência' };
  const r = await banco.transacao(async (t) => {
    const pedido = await t.um('SELECT * FROM pedidos WHERE id = $1 FOR UPDATE', [pedidoId]);
    if (!pedido) return { resultado: 'pedido inexistente' };
    if (Math.round(Number(pagamento.transaction_amount) * 100) !== pedido.valor_centavos) {
      return { resultado: `valor divergente (${pagamento.transaction_amount})` };
    }
    const status = statusDoPedido(pagamento.status);
    const pagoEm = status === 'aprovado' ? pagamento.date_approved || new Date().toISOString() : null;
    await t.consulta(
      `UPDATE pedidos SET status = $2, status_detalhe = $3, mp_pagamento_id = $4,
              pagamento = pagamento || $5::jsonb, pago_em = COALESCE(pago_em, $6), atualizado_em = now()
        WHERE id = $1`,
      [pedido.id, status, pagamento.status_detail || null, String(pagamento.id), JSON.stringify(resumoPagamento(pagamento)), pagoEm]);
    let novoAprovado = false;
    if (status === 'aprovado') {
      const plano = planos.porId[pedido.plano_id];
      if (!plano) return { resultado: `plano ${pedido.plano_id} não existe mais` };
      const ja = await t.um('SELECT 1 FROM matriculas WHERE pedido_id = $1', [pedido.id]);
      await liberarPorPedido(t, pedido, plano);
      novoAprovado = !ja;
      if (pedido.cupom_id && !pedido.cupom_contado) {
        await t.consulta('UPDATE cupons SET usos = usos + 1 WHERE id = $1', [pedido.cupom_id]);
        await t.consulta('UPDATE pedidos SET cupom_contado = true WHERE id = $1', [pedido.id]);
      }
    } else if (status === 'reembolsado' || status === 'contestado' || status === 'cancelado') {
      await cancelarPorPedido(t, pedido.id);
    }
    return { resultado: status, pedidoId: pedido.id, novoAprovado, pedido };
  });
  if (r.novoAprovado && correio) {
    const u = await banco.um('SELECT id, nome, email FROM usuarios WHERE id = $1', [r.pedido.usuario_id]);
    const m = await banco.um('SELECT fim FROM matriculas WHERE pedido_id = $1', [r.pedido.id]);
    await correio({ modelo: 'pagamentoAprovado', para: u.email, usuarioId: u.id, chave: `aprovado:${r.pedido.id}`,
      dados: { nome: u.nome, plano: planos.porId[r.pedido.plano_id].nome, valor: r.pedido.valor_centavos, ate: m.fim } }).catch((e) => console.error('e-mail', e.message));
  }
  return r;
}
