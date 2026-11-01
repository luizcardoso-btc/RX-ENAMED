import { Router } from 'express';
import { exigirLogin } from './autenticacao.js';

const LIMITE_BYTES = 3 * 1024 * 1024;

// Progresso de estudo na conta: a plataforma junta o que está no navegador com o que está aqui e salva de volta.
export function rotasProgresso({ banco }) {
  const r = Router();
  r.get('/progresso', exigirLogin, async (req, res) => {
    const p = await banco.um('SELECT dados, atualizado_em FROM progresso WHERE usuario_id = $1', [req.usuario.id]);
    res.json({ dados: p?.dados ?? null, atualizadoEm: p?.atualizado_em ?? null });
  });
  r.put('/progresso', exigirLogin, async (req, res) => {
    const dados = req.body?.dados;
    if (!dados || typeof dados !== 'object' || dados.versao !== 1) return res.status(400).json({ erro: 'Progresso inválido.' });
    const json = JSON.stringify(dados);
    if (Buffer.byteLength(json) > LIMITE_BYTES) return res.status(413).json({ erro: 'Progresso grande demais.' });
    const p = await banco.um(`INSERT INTO progresso (usuario_id, dados) VALUES ($1, $2)
      ON CONFLICT (usuario_id) DO UPDATE SET dados = EXCLUDED.dados, atualizado_em = now() RETURNING atualizado_em`, [req.usuario.id, json]);
    res.json({ ok: true, atualizadoEm: p.atualizado_em });
  });
  return r;
}
