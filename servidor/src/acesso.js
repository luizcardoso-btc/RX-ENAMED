import { readFileSync } from 'node:fs';
import { somarMeses } from './planos.js';

// O que cada plano libera (conteudo/planos.json, campo recursos). Matrículas ativas somam os recursos.
const ARQ_PLANOS = new URL('../../conteudo/planos.json', import.meta.url).pathname;
const RECURSOS_POR_PLANO = Object.fromEntries(JSON.parse(readFileSync(ARQ_PLANOS, 'utf8')).planos.map((p) => [p.id, p.recursos || []]));
export const TODOS_RECURSOS = ['teoria', 'estacoes', 'dupla'];

/** Situação de acesso de um aluno a partir das matrículas. */
export async function situacaoDoAluno(banco, usuarioId) {
  const vigentes = await banco.varios(
    `SELECT plano_id, inicio, fim, origem FROM matriculas
      WHERE usuario_id = $1 AND status = 'ativa' AND inicio <= now() AND fim > now()
      ORDER BY fim DESC`, [usuarioId]);
  if (!vigentes.length) return { ativo: false, plano: 'gratis', ate: null, planos: [], recursos: [] };
  const atual = vigentes[0];
  const recursos = TODOS_RECURSOS.filter((r) => vigentes.some((m) => (RECURSOS_POR_PLANO[m.plano_id] || []).includes(r)));
  return { ativo: true, plano: atual.plano_id, ate: atual.fim, origem: atual.origem, planos: vigentes.map((m) => m.plano_id), recursos };
}

/**
 * Cria a matrícula de um pedido aprovado. Idempotente: o mesmo pedido nunca gera duas matrículas.
 * Se o aluno ainda tem acesso, o novo período começa quando o atual termina (renovação antecipada não perde dias).
 */
export async function liberarPorPedido(t, pedido, plano) {
  const ja = await t.um('SELECT id FROM matriculas WHERE pedido_id = $1', [pedido.id]);
  if (ja) return ja.id;
  const vigente = await t.um(
    `SELECT max(fim) AS fim FROM matriculas WHERE usuario_id = $1 AND status = 'ativa' AND fim > now()`, [pedido.usuario_id]);
  const inicio = vigente?.fim ? new Date(vigente.fim) : new Date();
  const fim = somarMeses(inicio, plano.duracaoMeses);
  const m = await t.um(
    `INSERT INTO matriculas (usuario_id, plano_id, inicio, fim, pedido_id, origem)
     VALUES ($1, $2, $3, $4, $5, 'pagamento') RETURNING id`,
    [pedido.usuario_id, pedido.plano_id, inicio, fim, pedido.id]);
  return m.id;
}

/** Reembolso ou contestação: encerra a matrícula daquele pedido. */
export async function cancelarPorPedido(t, pedidoId) {
  await t.consulta(`UPDATE matriculas SET status = 'cancelada' WHERE pedido_id = $1`, [pedidoId]);
}

/** O usuário tem o recurso? Administradores têm todos. */
export async function temRecurso(banco, usuario, recurso) {
  if (usuario?.papel === 'admin') return true;
  return (await situacaoDoAluno(banco, usuario.id)).recursos.includes(recurso);
}
