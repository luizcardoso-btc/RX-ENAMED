import { Router } from 'express';
import { assinaturaMercadoPagoValida } from '../seguranca.js';
import { aplicarPagamento } from '../pagamentos.js';

// Avisos (webhooks) do Mercado Pago. Nunca confiamos no corpo: conferimos a assinatura e consultamos o pagamento na API.
export function rotasAvisos({ banco, config, planos, mp, correio }) {
  const r = Router();
  r.post('/webhooks/mercadopago', async (req, res) => {
    const tipo = req.body?.type || req.query.type || req.query.topic;
    const recursoId = String(req.query['data.id'] || req.body?.data?.id || req.query.id || '');
    const ok = assinaturaMercadoPagoValida({
      assinatura: req.get('x-signature'), idRequisicao: req.get('x-request-id'), idDado: recursoId, segredo: config.mercadoPago.segredoWebhook,
    });
    const aviso = await banco.um(
      'INSERT INTO avisos_pagamento (tipo, recurso_id, assinatura_ok, corpo) VALUES ($1, $2, $3, $4) RETURNING id',
      [tipo || null, recursoId || null, ok, JSON.stringify({ query: req.query, corpo: req.body ?? null })]);
    const registrar = (resultado) => banco.consulta('UPDATE avisos_pagamento SET resultado = $2 WHERE id = $1', [aviso.id, resultado]);
    if (!ok) {
      await registrar('assinatura inválida');
      return res.status(401).json({ erro: 'assinatura inválida' });
    }
    if (tipo !== 'payment' || !recursoId) {
      await registrar('ignorado');
      return res.json({ ok: true });
    }
    try {
      const { resultado } = await aplicarPagamento({ banco, planos, correio }, await mp.consultarPagamento(recursoId));
      await registrar(resultado);
      res.json({ ok: true });
    } catch (e) {
      await registrar(`erro: ${e.message}`.slice(0, 300));
      res.status(500).json({ erro: 'tente de novo' }); // o Mercado Pago reenvia
    }
  });
  return r;
}
