// Metas do negócio (usuários e receita), funil de conversão e contagem anônima de visitas.
import { createHash, randomBytes } from 'node:crypto';

// Segredo que muda todo dia: o hash do visitante não pode ser ligado ao do dia seguinte nem revertido para o IP.
const segredos = new Map();
const segredoDoDia = (dia) => { if (!segredos.has(dia)) { segredos.clear(); segredos.set(dia, randomBytes(16).toString('hex')); } return segredos.get(dia); };
const PAGINAS = new Map([['/', 'inicio'], ['/index.html', 'inicio'], ['/es/', 'inicio'], ['/es/index.html', 'inicio'], ['/planos.html', 'planos'], ['/es/planos.html', 'planos'],
  ['/entrar', 'entrar'], ['/checkout', 'checkout']]);
const ROBO = /bot|crawl|spider|slurp|preview|monitor|curl|wget|python|headless|lighthouse/i;

/** Conta visitas às páginas principais, sem cookies e sem guardar IP. */
export function contarVisitas(banco) {
  return (req, _res, next) => {
    const pagina = req.method === 'GET' && PAGINAS.get(req.path);
    const agente = req.get('user-agent') || '';
    if (pagina && !ROBO.test(agente)) {
      const dia = new Date().toISOString().slice(0, 10);
      const hash = createHash('sha256').update(`${segredoDoDia(dia)}|${req.ip}|${agente}`).digest('hex').slice(0, 32);
      banco.um(`WITH novo AS (INSERT INTO visitantes_dia (dia, hash) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1)
                INSERT INTO visitas (dia, pagina, total, unicos) VALUES ($1, $3, 1, (SELECT count(*) FROM novo))
                ON CONFLICT (dia, pagina) DO UPDATE SET total = visitas.total + 1, unicos = visitas.unicos + EXCLUDED.unicos RETURNING 1`,
      [dia, hash, pagina]).catch((e) => console.error('visitas', e.message));
    }
    next();
  };
}

export async function lerMetas(banco) {
  return (await banco.um(`SELECT valor FROM configuracoes WHERE chave = 'metas'`))?.valor || { usuarios: 100, receitaCentavos: 100000000, prazo: null };
}

/** Progresso das metas, ritmo, previsão, funil e indicações. */
export async function resumoMetas(banco) {
  const metas = await lerMetas(banco);
  const agora = new Date();
  const n = await banco.um(`SELECT
      (SELECT count(*) FROM usuarios WHERE papel = 'aluno' AND excluido_em IS NULL) AS usuarios,
      (SELECT count(DISTINCT usuario_id) FROM pedidos WHERE status = 'aprovado') AS pagantes,
      (SELECT COALESCE(sum(valor_centavos), 0) FROM pedidos WHERE status = 'aprovado') AS receita,
      (SELECT count(*) FROM pedidos WHERE status = 'aprovado') AS vendas,
      (SELECT min(criado_em) FROM usuarios WHERE papel = 'aluno') AS primeiro,
      (SELECT count(*) FROM usuarios WHERE papel = 'aluno' AND criado_em >= now() - interval '7 days') AS usuarios7,
      (SELECT count(*) FROM usuarios WHERE papel = 'aluno' AND criado_em >= now() - interval '30 days') AS usuarios30,
      (SELECT COALESCE(sum(valor_centavos), 0) FROM pedidos WHERE status = 'aprovado' AND pago_em >= now() - interval '7 days') AS receita7,
      (SELECT COALESCE(sum(valor_centavos), 0) FROM pedidos WHERE status = 'aprovado' AND pago_em >= now() - interval '30 days') AS receita30`);
  const diasRestantes = metas.prazo ? Math.max(0, Math.ceil((new Date(`${metas.prazo}T23:59:59-03:00`) - agora) / 86400000)) : null;
  const ticket = n.vendas ? Math.round(n.receita / n.vendas) : 76500; // sem vendas ainda: estimativa do plano de negócio
  // Ritmo: média diária dos últimos 30 dias (ou desde o primeiro cadastro, se for mais recente).
  const diasBase = n.primeiro ? Math.max(1, Math.min(30, Math.ceil((agora - new Date(n.primeiro)) / 86400000))) : 30;
  const ritmo = { usuariosDia: n.usuarios30 / diasBase, receitaDia: n.receita30 / diasBase };
  const falta = { usuarios: Math.max(0, metas.usuarios - n.usuarios), receita: Math.max(0, metas.receitaCentavos - n.receita) };
  const previsao = (faltaX, porDia) => (faltaX === 0 ? agora.toISOString() : porDia > 0 ? new Date(agora.getTime() + (faltaX / porDia) * 86400000).toISOString() : null);
  const funil = await banco.um(`SELECT
      (SELECT COALESCE(sum(unicos), 0) FROM visitas WHERE dia >= current_date - 29) AS visitantes,
      (SELECT count(*) FROM usuarios WHERE papel = 'aluno' AND criado_em >= now() - interval '30 days') AS cadastros,
      (SELECT count(DISTINCT usuario_id) FROM pedidos WHERE criado_em >= now() - interval '30 days') AS checkout,
      (SELECT count(DISTINCT usuario_id) FROM pedidos WHERE status = 'aprovado' AND pago_em >= now() - interval '30 days') AS pagantes`);
  const serie = await banco.varios(`
    SELECT to_char(d, 'YYYY-MM-DD') AS dia,
           (SELECT count(*) FROM usuarios WHERE papel = 'aluno' AND criado_em < d + interval '1 day') AS usuarios,
           (SELECT COALESCE(sum(valor_centavos), 0) FROM pedidos WHERE status = 'aprovado' AND pago_em < d + interval '1 day') AS receita,
           (SELECT COALESCE(sum(unicos), 0) FROM visitas WHERE dia = d::date) AS visitantes
      FROM generate_series(date_trunc('day', now()) - interval '59 days', date_trunc('day', now()), interval '1 day') d`);
  const origens = await banco.varios(`SELECT COALESCE(origem, 'direto') AS origem, count(*) AS n FROM usuarios WHERE papel = 'aluno' GROUP BY 1 ORDER BY n DESC LIMIT 8`);
  const indicacao = await banco.um(`SELECT
      (SELECT count(*) FROM usuarios WHERE indicado_por IS NOT NULL) AS cadastros,
      (SELECT count(*) FROM recompensas_indicacao WHERE status = 'concedida') AS compraram,
      (SELECT COALESCE(sum(dias), 0) FROM recompensas_indicacao WHERE status = 'concedida') AS dias,
      (SELECT COALESCE(sum(p.valor_centavos), 0) FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id WHERE p.status = 'aprovado' AND u.indicado_por IS NOT NULL) AS receita`);
  const topIndicadores = await banco.varios(`
    SELECT i.id, i.nome, i.email, i.codigo_indicacao AS codigo, count(u.*) AS cadastros,
           (SELECT count(*) FROM recompensas_indicacao r WHERE r.indicador_id = i.id AND r.status = 'concedida') AS compraram
      FROM usuarios i JOIN usuarios u ON u.indicado_por = i.id GROUP BY i.id ORDER BY compraram DESC, cadastros DESC LIMIT 10`);
  return {
    metas, atual: { usuarios: n.usuarios, pagantes: n.pagantes, receita: n.receita, vendas: n.vendas, ticket },
    ultimos: { usuarios7: n.usuarios7, usuarios30: n.usuarios30, receita7: n.receita7, receita30: n.receita30 },
    falta, ritmo, diasRestantes,
    necessario: diasRestantes ? { usuariosDia: falta.usuarios / diasRestantes, receitaDia: falta.receita / diasRestantes, vendasDia: falta.receita / ticket / diasRestantes } : null,
    previsao: { usuarios: previsao(falta.usuarios, ritmo.usuariosDia), receita: previsao(falta.receita, ritmo.receitaDia) },
    vendasParaMeta: Math.ceil(falta.receita / ticket),
    funil, serie, origens, indicacao, topIndicadores,
  };
}
