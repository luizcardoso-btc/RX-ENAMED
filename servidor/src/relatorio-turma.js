// Relatório da turma para a coordenação: números agregados de todos os alunos da faculdade e, por nome,
// só de quem autorizou no cadastro (compartilhar_faculdade). Nunca mostra e-mail nem telefone.
import { bancoQuestoes, nomeFaculdade } from './faculdades.js';

const DIA = 86400000;
const ROTULO_ETAPA = { 1: '1º ano', 2: '2º ano', 3: '3º ano', 4: '4º ano', 5: '5º ano', 6: '6º ano', formado: 'Formado', exterior: 'Formado no exterior' };

function resumoDoAluno(dados, porId, agora) {
  const respostas = dados?.respostas && typeof dados.respostas === 'object' ? dados.respostas : {};
  let resolvidas = 0;
  let certas = 0;
  let ultima = 0;
  const porArea = {};
  const semanas = Array.from({ length: 8 }, () => ({ questoes: 0, certas: 0 }));
  for (const [id, lista] of Object.entries(respostas)) {
    if (!Array.isArray(lista) || !lista.length) continue;
    const q = porId.get(id);
    for (const r of lista) {
      const t = Number(r?.t) || 0;
      if (t > ultima) ultima = t;
      const s = Math.floor((agora - t) / (7 * DIA));
      if (s >= 0 && s < 8) { semanas[7 - s].questoes += 1; if (r.certa) semanas[7 - s].certas += 1; }
    }
    if (!q || q.anulada) continue;
    const ult = lista[lista.length - 1];
    resolvidas += 1;
    const a = (porArea[q.area] ||= { resolvidas: 0, certas: 0 });
    a.resolvidas += 1;
    if (ult?.certa) { certas += 1; a.certas += 1; }
  }
  return { resolvidas, certas, porArea, semanas, ultima, simulados: Array.isArray(dados?.simulados) ? dados.simulados.length : 0 };
}

/** Monta o relatório de uma faculdade. `comNomes`: incluir a lista individual de quem autorizou. */
export async function relatorioTurma(banco, config, faculdade, { comNomes = true, agora = Date.now() } = {}) {
  const { porId } = bancoQuestoes(config);
  const alunos = await banco.varios(`SELECT u.id, u.nome, u.etapa, u.compartilhar_faculdade, u.criado_em, p.dados, p.atualizado_em
    FROM usuarios u LEFT JOIN progresso p ON p.usuario_id = u.id
    WHERE u.faculdade = $1 AND u.papel = 'aluno' AND u.excluido_em IS NULL`, [faculdade]);
  const porEtapa = {};
  const areas = {};
  const semanas = Array.from({ length: 8 }, (_, i) => ({ semana: i - 7, questoes: 0, certas: 0 }));
  let resolvidas = 0;
  let certas = 0;
  let ativos7 = 0;
  let ativos30 = 0;
  let emRisco = 0;
  const individuais = [];
  for (const a of alunos) {
    porEtapa[a.etapa || '—'] = (porEtapa[a.etapa || '—'] || 0) + 1;
    const r = resumoDoAluno(a.dados, porId, agora);
    resolvidas += r.resolvidas;
    certas += r.certas;
    for (const [area, v] of Object.entries(r.porArea)) {
      const x = (areas[area] ||= { resolvidas: 0, certas: 0, alunos: 0 });
      x.resolvidas += v.resolvidas; x.certas += v.certas; x.alunos += 1;
    }
    r.semanas.forEach((s, i) => { semanas[i].questoes += s.questoes; semanas[i].certas += s.certas; });
    if (r.ultima && agora - r.ultima < 7 * DIA) ativos7 += 1;
    if (r.ultima && agora - r.ultima < 30 * DIA) ativos30 += 1;
    const acerto = r.resolvidas ? r.certas / r.resolvidas : null;
    // Em risco: parado há mais de 14 dias, ou com 30+ questões e acerto abaixo de 50%.
    const motivos = [];
    if (!r.ultima || agora - r.ultima > 14 * DIA) motivos.push(r.ultima ? 'sem estudar há mais de 14 dias' : 'ainda não começou');
    if (r.resolvidas >= 30 && acerto < 0.5) motivos.push('acerto abaixo de 50%');
    if (motivos.length) emRisco += 1;
    if (comNomes && a.compartilhar_faculdade) {
      individuais.push({ nome: a.nome, etapa: ROTULO_ETAPA[a.etapa] || '—', resolvidas: r.resolvidas, acerto: acerto === null ? null : Math.round(acerto * 1000) / 10,
        simulados: r.simulados, ultimaAtividade: r.ultima ? new Date(r.ultima).toISOString() : null, risco: motivos });
    }
  }
  const nacionais = await banco.varios(`SELECT s.id, s.nome, s.exame, s.fim,
      count(p.usuario_id) FILTER (WHERE p.faculdade = $1)::int AS participantes,
      round(avg(p.nota) FILTER (WHERE p.faculdade = $1), 2) AS media_faculdade,
      round(avg(p.nota), 2) AS media_geral
    FROM simulados_nacionais s JOIN simulado_participacoes p ON p.simulado_id = s.id AND p.enviado_em IS NOT NULL AND p.no_tempo
    GROUP BY s.id HAVING count(p.usuario_id) FILTER (WHERE p.faculdade = $1) > 0 ORDER BY s.fim DESC LIMIT 12`, [faculdade]);
  return {
    faculdade, nome: nomeFaculdade(faculdade), geradoEm: new Date(agora).toISOString(),
    alunos: alunos.length, autorizaram: alunos.filter((a) => a.compartilhar_faculdade).length,
    porEtapa: Object.entries(porEtapa).map(([k, n]) => ({ etapa: ROTULO_ETAPA[k] || 'Não informada', alunos: n })),
    ativos7, ativos30, emRisco, resolvidas,
    acerto: resolvidas ? Math.round((certas / resolvidas) * 1000) / 10 : null,
    areas: Object.entries(areas).map(([area, v]) => ({ area, resolvidas: v.resolvidas, alunos: v.alunos, acerto: Math.round((v.certas / v.resolvidas) * 1000) / 10 }))
      .sort((a, b) => a.acerto - b.acerto),
    semanas: semanas.map((s) => ({ ...s, acerto: s.questoes ? Math.round((s.certas / s.questoes) * 1000) / 10 : null })),
    nacionais: nacionais.map((n) => ({ nome: n.nome, exame: n.exame, participantes: n.participantes, mediaFaculdade: Number(n.media_faculdade), mediaGeral: Number(n.media_geral) })),
    individuais: individuais.sort((a, b) => (b.risco.length - a.risco.length) || ((a.acerto ?? 101) - (b.acerto ?? 101))),
  };
}
