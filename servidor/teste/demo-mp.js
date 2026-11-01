// Sobe o Mercado Pago simulado numa porta fixa (para o roteiro de navegador) e expõe /__aprovar/:id.
import { iniciarMpFalso } from './mp-falso.js';
import express from 'express';
const mp = await iniciarMpFalso();
const ctl = express();
ctl.post('/__aprovar/:ref', (req, res) => {
  const p = [...mp.pagamentos.values()].find((x) => x.external_reference === req.params.ref);
  if (!p) return res.status(404).end();
  mp.aprovar(p.id);
  res.json({ id: p.id });
});
ctl.all('/{*resto}', async (req, res) => {
  const r = await fetch(mp.url + req.originalUrl, { method: req.method, headers: { 'content-type': 'application/json', 'x-idempotency-key': req.get('x-idempotency-key') || '' }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise((ok) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => ok(b)); }) });
  res.status(r.status).type('json').send(await r.text());
});
ctl.listen(4545, () => console.log('mp falso em 4545'));
