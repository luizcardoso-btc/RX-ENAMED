// Mercado Pago simulado para os testes: guarda pagamentos em memória e responde como a API real.
import express from 'express';

export function iniciarMpFalso() {
  const pagamentos = new Map();
  const chaves = new Map();
  let proximo = 1000;
  const app = express();
  app.use(express.json());
  app.post('/v1/payments', (req, res) => {
    const chave = req.get('x-idempotency-key');
    if (chave && chaves.has(chave)) return res.status(201).json(pagamentos.get(chaves.get(chave)));
    const b = req.body;
    const id = proximo++;
    const p = { id, external_reference: b.external_reference, transaction_amount: b.transaction_amount, payment_method_id: b.payment_method_id,
      installments: b.installments || 1, date_of_expiration: b.date_of_expiration, transaction_details: { net_received_amount: b.transaction_amount * 0.95 } };
    if (b.payment_method_id === 'pix') Object.assign(p, { status: 'pending', status_detail: 'pending_waiting_transfer',
      point_of_interaction: { transaction_data: { qr_code: '00020126PIXFALSO', qr_code_base64: 'iVBORw0KGgo=', ticket_url: 'https://mp.test/pix' } } });
    else if (b.payment_method_id === 'bolbradesco') Object.assign(p, { status: 'pending', status_detail: 'pending_waiting_payment',
      transaction_details: { external_resource_url: 'https://mp.test/boleto' }, barcode: { content: '23790000000' } });
    else if (b.token === 'cartao-recusado') Object.assign(p, { status: 'rejected', status_detail: 'cc_rejected_insufficient_amount' });
    else Object.assign(p, { status: 'approved', status_detail: 'accredited', date_approved: new Date().toISOString(), card: { last_four_digits: '4242' } });
    pagamentos.set(id, p);
    if (chave) chaves.set(chave, id);
    res.status(201).json(p);
  });
  app.get('/v1/payments/:id', (req, res) => {
    const p = pagamentos.get(Number(req.params.id));
    return p ? res.json(p) : res.status(404).json({ message: 'not found' });
  });
  app.post('/v1/payments/:id/refunds', (req, res) => {
    const p = pagamentos.get(Number(req.params.id));
    if (!p) return res.status(404).json({ message: 'not found' });
    p.status = 'refunded';
    res.status(201).json({ id: 1, payment_id: p.id });
  });
  return new Promise((ok) => {
    const servidor = app.listen(0, () => ok({
      url: `http://127.0.0.1:${servidor.address().port}`,
      pagamentos,
      aprovar: (id) => Object.assign(pagamentos.get(Number(id)), { status: 'approved', status_detail: 'accredited', date_approved: new Date().toISOString() }),
      fechar: () => servidor.close(),
    }));
  });
}
