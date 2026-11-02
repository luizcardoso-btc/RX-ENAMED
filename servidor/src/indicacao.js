// Programa de indicação: cada aluno tem um link pessoal. O indicado ganha desconto na primeira compra e quem
// indicou ganha dias de acesso completo quando o indicado compra. Reembolso cancela a recompensa.
import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { exigirLogin } from './rotas/autenticacao.js';

export const DESCONTO_INDICADO = 10; // % na primeira compra de quem chegou por indicação
export const DIAS_INDICADOR = 30;    // dias de acesso completo por indicado que comprar
export const COOKIE_INDICACAO = 'rx_indicado_por';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O e 1/I, para não confundir ao digitar
const sufixo = (n) => Array.from(randomBytes(n), (b) => ALFABETO[b % ALFABETO.length]).join('');
const base = (nome) => String(nome || 'RX').normalize('NFD').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 6) || 'RX';

/** Código de indicação do aluno (cria na primeira vez). */
export async function codigoDoAluno(banco, usuario) {
  const atual = await banco.um('SELECT codigo_indicacao FROM usuarios WHERE id = $1', [usuario.id]);
  if (atual?.codigo_indicacao) return atual.codigo_indicacao;
  for (let i = 0; i < 6; i += 1) {
    const codigo = `${base(usuario.nome.split(' ')[0])}${sufixo(4)}`;
    try {
      const r = await banco.um('UPDATE usuarios SET codigo_indicacao = $2 WHERE id = $1 AND codigo_indicacao IS NULL RETURNING codigo_indicacao', [usuario.id, codigo]);
      if (r) return r.codigo_indicacao;
      return (await banco.um('SELECT codigo_indicacao FROM usuarios WHERE id = $1', [usuario.id])).codigo_indicacao;
    } catch (e) { if (e.code !== '23505') throw e; }
  }
  throw new Error('não foi possível gerar o código de indicação');
}

/** O aluno tem direito ao desconto de indicado? (chegou por indicação e ainda não comprou nada) */
export async function temDescontoDeIndicado(banco, usuarioId) {
  const r = await banco.um(`SELECT u.indicado_por IS NOT NULL AS indicado,
      EXISTS (SELECT 1 FROM pedidos p WHERE p.usuario_id = u.id AND p.status IN ('aprovado', 'reembolsado', 'contestado')) AS ja_comprou
    FROM usuarios u WHERE u.id = $1`, [usuarioId]);
  return Boolean(r?.indicado && !r.ja_comprou);
}

/**
 * Na primeira compra aprovada do indicado, dá ao indicador DIAS_INDICADOR dias de acesso completo.
 * Bloqueia autoindicação por CPF igual. Idempotente (uma recompensa por indicado).
 */
export async function recompensarIndicacao(t, pedido, somarMeses) {
  const u = await t.um('SELECT id, indicado_por, cpf FROM usuarios WHERE id = $1', [pedido.usuario_id]);
  if (!u?.indicado_por || u.indicado_por === u.id) return null;
  if (await t.um('SELECT 1 FROM recompensas_indicacao WHERE indicado_id = $1', [u.id])) return null;
  const anteriores = await t.um(`SELECT count(*) AS n FROM pedidos WHERE usuario_id = $1 AND status IN ('aprovado', 'reembolsado', 'contestado') AND id <> $2`, [u.id, pedido.id]);
  if (anteriores.n > 0) return null;
  const indicador = await t.um('SELECT id, cpf, nome, email, excluido_em FROM usuarios WHERE id = $1', [u.indicado_por]);
  if (!indicador || indicador.excluido_em) return null;
  if (indicador.cpf && u.cpf && indicador.cpf === u.cpf) return null; // mesma pessoa
  const vigente = await t.um(`SELECT max(fim) AS fim FROM matriculas WHERE usuario_id = $1 AND status = 'ativa' AND fim > now()`, [indicador.id]);
  const inicio = vigente?.fim ? new Date(vigente.fim) : new Date();
  const fim = new Date(inicio.getTime() + DIAS_INDICADOR * 86400000);
  const m = await t.um(`INSERT INTO matriculas (usuario_id, plano_id, inicio, fim, origem, observacao) VALUES ($1, 'mensal', $2, $3, 'indicacao', $4) RETURNING id`,
    [indicador.id, inicio, fim, `Indicação: primeira compra de ${pedido.usuario_id}`]);
  await t.consulta('INSERT INTO recompensas_indicacao (indicado_id, indicador_id, pedido_id, matricula_id, dias) VALUES ($1, $2, $3, $4, $5)',
    [u.id, indicador.id, pedido.id, m.id, DIAS_INDICADOR]);
  return { indicador, fim };
}

/** Reembolso ou contestação da compra que gerou recompensa: cancela os dias dados ao indicador. */
export async function cancelarRecompensa(t, pedidoId) {
  const r = await t.um(`UPDATE recompensas_indicacao SET status = 'cancelada' WHERE pedido_id = $1 AND status = 'concedida' RETURNING matricula_id`, [pedidoId]);
  if (r?.matricula_id) await t.consulta(`UPDATE matriculas SET status = 'cancelada' WHERE id = $1`, [r.matricula_id]);
}

export function rotasIndicacao({ banco, config }) {
  const r = Router();
  // Painel do aluno: link, números e recompensas.
  r.get('/indicacao', exigirLogin, async (req, res) => {
    const codigo = await codigoDoAluno(banco, req.usuario);
    const n = await banco.um(`SELECT
        (SELECT count(*) FROM usuarios WHERE indicado_por = $1) AS cadastros,
        (SELECT count(*) FROM recompensas_indicacao WHERE indicador_id = $1 AND status = 'concedida') AS compraram,
        (SELECT COALESCE(sum(dias), 0) FROM recompensas_indicacao WHERE indicador_id = $1 AND status = 'concedida') AS dias`, [req.usuario.id]);
    res.json({ codigo, link: `${config.urlBase}/i/${codigo}`, descontoIndicado: DESCONTO_INDICADO, diasPorIndicacao: DIAS_INDICADOR, ...n });
  });
  return r;
}

/** Link de indicação: guarda quem indicou num cookie (30 dias) e leva ao cadastro. */
export function rotaLinkIndicacao({ banco, config }) {
  return async (req, res) => {
    const codigo = String(req.params.codigo || '').slice(0, 20);
    const dono = /^[A-Z0-9]{3,20}$/i.test(codigo) ? await banco.um('SELECT id FROM usuarios WHERE upper(codigo_indicacao) = upper($1) AND excluido_em IS NULL', [codigo]) : null;
    if (dono) res.cookie(COOKIE_INDICACAO, dono.id, { httpOnly: true, secure: config.producao, sameSite: 'lax', path: '/', maxAge: 30 * 86400000 });
    res.redirect(302, `/entrar?modo=cadastro&indicacao=${dono ? '1' : '0'}`);
  };
}
