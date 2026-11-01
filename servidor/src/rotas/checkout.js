import { Router } from 'express';
import { exigirLogin } from './autenticacao.js';
import { cpfValido } from '../seguranca.js';
import { ErroMercadoPago } from '../mercadopago.js';
import { aplicarPagamento } from '../pagamentos.js';
import { calcularPreco, ErroCupom } from '../cupons.js';

const METODOS = ['pix', 'cartao', 'boleto'];
const MINUTOS_PIX = 30;
const DIAS_BOLETO = 3;

// Mensagens amigáveis para os motivos de recusa mais comuns do cartão.
const RECUSA = {
  cc_rejected_insufficient_amount: 'Cartão sem limite suficiente. Tente outro cartão ou pague com PIX.',
  cc_rejected_bad_filled_security_code: 'Código de segurança incorreto.',
  cc_rejected_bad_filled_date: 'Data de validade incorreta.',
  cc_rejected_bad_filled_other: 'Confira os dados do cartão.',
  cc_rejected_call_for_authorize: 'O banco pediu autorização. Ligue para o seu banco e tente de novo.',
  cc_rejected_card_disabled: 'Cartão desativado. Ligue para o banco ou use outro cartão.',
  cc_rejected_duplicated_payment: 'Você já fez um pagamento igual há pouco. Confira seu e-mail antes de tentar de novo.',
  cc_rejected_high_risk: 'Pagamento recusado pela análise de segurança. Tente PIX ou outro cartão.',
  cc_rejected_max_attempts: 'Limite de tentativas atingido. Tente outro cartão ou PIX.',
};
const mensagemRecusa = (detalhe) => RECUSA[detalhe] || 'O pagamento não foi aprovado. Tente outro cartão ou pague com PIX.';

const pedidoPublico = (p) => ({
  id: p.id, plano: p.plano_id, valorCentavos: p.valor_centavos, descontoCentavos: p.desconto_centavos, metodo: p.metodo, parcelas: p.parcelas,
  status: p.status, statusDetalhe: p.status_detalhe, pagamento: p.pagamento, criadoEm: p.criado_em, pagoEm: p.pago_em,
});

export function rotasCheckout({ banco, config, planos, mp, correio }) {
  const r = Router();
  const ctx = { banco, planos, correio };

  r.get('/checkout/config', (_req, res) => {
    res.json({ chavePublica: config.mercadoPago.chavePublica, planos: planos.planos, limitesGratis: planos.limitesGratis });
  });

  // Confere um cupom e devolve o preço com desconto (o desconto de verdade é recalculado ao pagar).
  r.post('/checkout/cupom', async (req, res) => {
    const plano = planos.porId[req.body?.plano];
    if (!plano) return res.status(400).json({ erro: 'Plano inválido.' });
    try {
      const p = await calcularPreco(banco, plano, { cupom: req.body?.cupom });
      res.json({ valorOriginalCentavos: p.valorOriginal, descontoCentavos: p.desconto, valorCentavos: p.valor, cupom: p.cupom.codigo.toUpperCase() });
    } catch (e) {
      if (e instanceof ErroCupom) return res.status(400).json({ erro: e.message });
      throw e;
    }
  });

  r.post('/checkout/pagar', exigirLogin, async (req, res) => {
    const plano = planos.porId[req.body?.plano];
    const metodo = req.body?.metodo;
    if (!plano) return res.status(400).json({ erro: 'Plano inválido.' });
    if (!METODOS.includes(metodo)) return res.status(400).json({ erro: 'Forma de pagamento inválida.' });
    const cpf = String(req.body?.cpf || req.usuario.cpf || '').replace(/\D/g, '');
    if (!cpfValido(cpf)) return res.status(400).json({ erro: 'Informe um CPF válido.' });
    const cartao = req.body?.cartao || {};
    const parcelas = metodo === 'cartao' ? Number(cartao.parcelas || 1) : 1;
    if (metodo === 'cartao') {
      if (!cartao.token || !cartao.metodoPagamento) return res.status(400).json({ erro: 'Dados do cartão incompletos.' });
      if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > plano.parcelasMax) {
        return res.status(400).json({ erro: `Este plano parcela em até ${plano.parcelasMax}×.` });
      }
    }
    let preco;
    try {
      preco = await calcularPreco(banco, plano, { cupom: req.body?.cupom || null, ref: req.body?.ref || null });
    } catch (e) {
      if (e instanceof ErroCupom) return res.status(400).json({ erro: e.message });
      throw e;
    }
    if (!req.usuario.cpf) await banco.consulta('UPDATE usuarios SET cpf = $2 WHERE id = $1', [req.usuario.id, cpf]);

    const pedido = await banco.um(
      `INSERT INTO pedidos (usuario_id, plano_id, valor_centavos, metodo, parcelas, valor_original_centavos, cupom_id, desconto_centavos, afiliado_id, comissao_centavos)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [req.usuario.id, plano.id, preco.valor, metodo, parcelas, preco.valorOriginal, preco.cupom?.id || null, preco.desconto, preco.afiliado?.id || null, preco.comissao]);
    const [primeiro, ...resto] = req.usuario.nome.split(' ');
    const agora = Date.now();
    const dados = {
      transaction_amount: preco.valor / 100,
      description: `RX ENAMED · ${plano.nome}`,
      external_reference: pedido.id,
      notification_url: `${config.urlBase}/api/webhooks/mercadopago`,
      statement_descriptor: config.mercadoPago.descricaoFatura,
      payer: { email: req.usuario.email, first_name: primeiro, last_name: resto.join(' ') || primeiro, identification: { type: 'CPF', number: cpf } },
      additional_info: { items: [{ id: plano.id, title: `RX ENAMED · ${plano.nome}`, category_id: 'education', quantity: 1, unit_price: preco.valor / 100 }] },
    };
    if (metodo === 'pix') Object.assign(dados, { payment_method_id: 'pix', date_of_expiration: new Date(agora + MINUTOS_PIX * 60000).toISOString() });
    if (metodo === 'boleto') Object.assign(dados, { payment_method_id: 'bolbradesco', date_of_expiration: new Date(agora + DIAS_BOLETO * 86400000).toISOString() });
    if (metodo === 'cartao') {
      Object.assign(dados, { token: cartao.token, payment_method_id: cartao.metodoPagamento, installments: parcelas, ...(cartao.emissor ? { issuer_id: cartao.emissor } : {}) });
    }

    try {
      const pagamento = await mp.criarPagamento(dados, pedido.id);
      await aplicarPagamento(ctx, pagamento);
    } catch (e) {
      const detalhe = e instanceof ErroMercadoPago ? (e.corpo?.cause?.[0]?.code ? `mp_${e.corpo.cause[0].code}` : e.message) : 'erro interno';
      await banco.consulta(`UPDATE pedidos SET status = 'recusado', status_detalhe = $2, atualizado_em = now() WHERE id = $1`, [pedido.id, String(detalhe).slice(0, 200)]);
      console.error('checkout: falha ao criar pagamento', pedido.id, e.message);
      return res.status(502).json({ erro: 'Não conseguimos falar com o Mercado Pago agora. Nenhum valor foi cobrado; tente de novo em instantes.', pedido: pedido.id });
    }
    const atual = await banco.um('SELECT * FROM pedidos WHERE id = $1', [pedido.id]);
    const corpo = { pedido: pedidoPublico(atual) };
    // Se o aluno fechar a página, o PIX e o boleto ficam no e-mail.
    const dadosEmail = { nome: req.usuario.nome, plano: plano.nome, valor: atual.valor_centavos };
    if (atual.status === 'pendente' && metodo === 'pix' && atual.pagamento.pixCopiaECola) {
      correio?.({ modelo: 'pixGerado', para: req.usuario.email, usuarioId: req.usuario.id, chave: `pix:${atual.id}`, dados: { ...dadosEmail, copiaECola: atual.pagamento.pixCopiaECola } }).catch(() => {});
    }
    if (atual.status === 'pendente' && metodo === 'boleto' && atual.pagamento.boletoUrl) {
      correio?.({ modelo: 'boletoGerado', para: req.usuario.email, usuarioId: req.usuario.id, chave: `boleto:${atual.id}`, dados: { ...dadosEmail, boletoUrl: atual.pagamento.boletoUrl, codigo: atual.pagamento.boletoCodigo } }).catch(() => {});
    }
    if (atual.status === 'recusado') corpo.erro = mensagemRecusa(atual.status_detalhe);
    res.status(atual.status === 'recusado' ? 402 : 201).json(corpo);
  });

  // O aluno acompanha o pedido (a tela do PIX consulta a cada poucos segundos). Pendente: confirma direto no Mercado Pago.
  r.get('/pedidos/:id', exigirLogin, async (req, res) => {
    let pedido = await banco.um('SELECT * FROM pedidos WHERE id = $1 AND usuario_id = $2', [req.params.id, req.usuario.id]).catch(() => null);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    if (pedido.status === 'pendente' && pedido.mp_pagamento_id && Date.now() - new Date(pedido.atualizado_em) > 5000) {
      try {
        await aplicarPagamento(ctx, await mp.consultarPagamento(pedido.mp_pagamento_id));
        pedido = await banco.um('SELECT * FROM pedidos WHERE id = $1', [pedido.id]);
      } catch (e) { console.error('pedido: consulta ao Mercado Pago falhou', e.message); }
    }
    res.json({ pedido: pedidoPublico(pedido) });
  });

  r.get('/meus-pedidos', exigirLogin, async (req, res) => {
    const lista = await banco.varios('SELECT * FROM pedidos WHERE usuario_id = $1 ORDER BY criado_em DESC LIMIT 50', [req.usuario.id]);
    res.json({ pedidos: lista.map(pedidoPublico) });
  });

  return r;
}
