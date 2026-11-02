import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { exigirLogin } from './autenticacao.js';

// Área de residência: privada, só para administradores, até a revisão médica e a liberação para alunos.
// As questões ficam no servidor (não no arquivo público do app).
export function rotasResidencia({ config }) {
  const r = Router();
  let cache = null;
  const carregar = () => {
    if (!cache) cache = JSON.parse(readFileSync(config.arquivoResidencia, 'utf8')).questoes;
    return cache;
  };
  r.get('/residencia/questoes', exigirLogin, (req, res) => {
    if (req.usuario.papel !== 'admin') return res.status(404).json({ erro: 'Rota inexistente.' });
    try {
      res.json({ questoes: carregar() });
    } catch {
      res.status(503).json({ erro: 'Banco de residência indisponível.' });
    }
  });
  return r;
}
