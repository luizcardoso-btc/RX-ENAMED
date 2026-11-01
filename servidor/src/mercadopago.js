// Cliente mínimo da API de pagamentos do Mercado Pago (https://www.mercadopago.com.br/developers/pt/reference).
// Só o servidor fala com o Mercado Pago: o token de acesso nunca vai para o navegador.
export class ErroMercadoPago extends Error {
  constructor(mensagem, status, corpo) {
    super(mensagem);
    this.status = status;
    this.corpo = corpo;
  }
}

export function criarMercadoPago({ api, tokenAcesso }, buscar = fetch) {
  const chamar = async (metodo, caminho, corpo, chaveIdempotencia) => {
    const r = await buscar(`${api}${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${tokenAcesso}`,
        'Content-Type': 'application/json',
        ...(chaveIdempotencia ? { 'X-Idempotency-Key': chaveIdempotencia } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const texto = await r.text();
    let json = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { json = { bruto: texto }; }
    if (!r.ok) throw new ErroMercadoPago(json?.message || `Mercado Pago respondeu ${r.status}`, r.status, json);
    return json;
  };
  return {
    criarPagamento: (dados, chaveIdempotencia) => chamar('POST', '/v1/payments', dados, chaveIdempotencia),
    consultarPagamento: (id) => chamar('GET', `/v1/payments/${encodeURIComponent(id)}`),
    reembolsar: (id, chaveIdempotencia) => chamar('POST', `/v1/payments/${encodeURIComponent(id)}/refunds`, {}, chaveIdempotencia),
  };
}

/** Status do Mercado Pago → status do pedido. */
export function statusDoPedido(statusMp) {
  return {
    approved: 'aprovado', authorized: 'pendente', pending: 'pendente', in_process: 'pendente', in_mediation: 'contestado',
    rejected: 'recusado', cancelled: 'cancelado', refunded: 'reembolsado', charged_back: 'contestado',
  }[statusMp] || 'pendente';
}

/** Dados do pagamento que interessam ao aluno e ao admin (sem dados sensíveis do cartão). */
export function resumoPagamento(p) {
  const td = p.point_of_interaction?.transaction_data || {};
  return {
    pixCopiaECola: td.qr_code || undefined,
    pixQrBase64: td.qr_code_base64 || undefined,
    pixLink: td.ticket_url || undefined,
    boletoUrl: p.transaction_details?.external_resource_url || undefined,
    boletoCodigo: p.barcode?.content || undefined,
    vencimento: p.date_of_expiration || undefined,
    bandeira: p.payment_method_id || undefined,
    finalCartao: p.card?.last_four_digits || undefined,
    parcelas: p.installments || undefined,
    valorLiquidoCentavos: p.transaction_details?.net_received_amount != null ? Math.round(p.transaction_details.net_received_amount * 100) : undefined,
  };
}
