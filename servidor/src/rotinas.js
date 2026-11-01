// Rotinas periódicas: limpeza, expiração de pedidos e avisos de vencimento do acesso.
export async function rodarRotinas({ banco, planos, correio }) {
  await banco.consulta('DELETE FROM sessoes WHERE expira_em < now()');
  await banco.consulta("DELETE FROM limites WHERE em < now() - interval '1 day'");
  await banco.consulta('DELETE FROM redefinicoes_senha WHERE expira_em < now() - interval \'1 day\'');
  await banco.consulta(`UPDATE pedidos SET status = 'expirado', atualizado_em = now()
                         WHERE status = 'pendente' AND ((metodo = 'pix' AND criado_em < now() - interval '1 day')
                            OR (metodo = 'boleto' AND criado_em < now() - interval '7 days'))`);
  // Acesso vencendo em 7 dias e em 1 dia (só a matrícula que termina por último; renovou, não avisa).
  const vencendo = await banco.varios(`
    SELECT DISTINCT ON (u.id) u.id, u.nome, u.email, m.id AS matricula, m.plano_id, m.fim,
           CEIL(EXTRACT(EPOCH FROM (m.fim - now())) / 86400)::int AS dias
      FROM matriculas m JOIN usuarios u ON u.id = m.usuario_id
     WHERE m.status = 'ativa' AND m.fim > now() AND m.fim <= now() + interval '7 days'
       AND NOT EXISTS (SELECT 1 FROM matriculas m2 WHERE m2.usuario_id = u.id AND m2.status = 'ativa' AND m2.fim > m.fim)
     ORDER BY u.id, m.fim DESC`);
  for (const v of vencendo) {
    const marco = v.dias <= 1 ? 1 : 7;
    await correio({ modelo: 'acessoVencendo', para: v.email, usuarioId: v.id, chave: `vencendo${marco}:${v.matricula}`,
      dados: { nome: v.nome, plano: planos.porId[v.plano_id]?.nome || v.plano_id, ate: v.fim, dias: v.dias } });
  }
  // Acesso que terminou nas últimas 48 h, sem outro vigente.
  const encerrados = await banco.varios(`
    SELECT DISTINCT ON (u.id) u.id, u.nome, u.email, m.id AS matricula
      FROM matriculas m JOIN usuarios u ON u.id = m.usuario_id
     WHERE m.status = 'ativa' AND m.fim <= now() AND m.fim > now() - interval '48 hours'
       AND NOT EXISTS (SELECT 1 FROM matriculas m2 WHERE m2.usuario_id = u.id AND m2.status = 'ativa' AND m2.fim > now())
     ORDER BY u.id, m.fim DESC`);
  for (const e of encerrados) {
    await correio({ modelo: 'acessoEncerrado', para: e.email, usuarioId: e.id, chave: `encerrado:${e.matricula}`, dados: { nome: e.nome } });
  }
  return { vencendo: vencendo.length, encerrados: encerrados.length };
}
